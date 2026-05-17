import { fetchFeeds } from './rss.js'
import { generateTracks, type TrackInput } from './gemini.js'
import { searchYouTube } from './youtube.js'

export interface TrackWithVideo extends TrackInput {
  videoId: string | null
  videoTitle: string | null
}
import {
  hasArticle,
  saveArticles,
  getTrackCache,
  cacheVideo,
  markArticlesProcessed,
  listFeeds,
  upsertFeed,
  touchFeed,
  getUnprocessedArticles,
} from './db.js'

export interface PipelineStats {
  feeds: number
  feedErrors: number
  newArticles: number
  geminiBatches: number
  trackCount: number
  cacheHits: number
  youtubeApiCalls: number
  processed: number
}

export interface PipelineResult {
  tracks: TrackWithVideo[]
  stats: PipelineStats
}

export type PipelineEvent =
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'stage'; stage: PipelineStage; message: string }

export type PipelineStage = 'feeds' | 'fetch' | 'gemini' | 'youtube' | 'mark-processed' | 'done'

function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): PipelineEvent {
  return { type: 'log', level, message }
}

function stage(s: PipelineStage, message: string): PipelineEvent {
  return { type: 'stage', stage: s, message }
}

/** RSS fetch → Gemini 검색어 생성 → YouTube 검색 → processed 마킹까지 한 사이클을 async generator로 노출.
 * 진행 이벤트는 yield, 최종 결과(tracks)는 return으로 전달한다.
 *
 * read 상태는 사용자 액션 전용이므로 pipeline은 건드리지 않는다.
 * 재처리 방지는 processed 컬럼으로만 관리: YouTube 단계가 완료되기 전에 실패하면 processed=0으로 남아 다음 실행에서 재시도된다. */
export async function* runPipeline(): AsyncGenerator<PipelineEvent, PipelineResult> {
  const stats: PipelineStats = {
    feeds: 0,
    feedErrors: 0,
    newArticles: 0,
    geminiBatches: 0,
    trackCount: 0,
    cacheHits: 0,
    youtubeApiCalls: 0,
    processed: 0,
  }

  // Stage 1: feeds
  yield stage('feeds', 'Loading feeds...')
  const feeds = listFeeds()
  if (feeds.length === 0) {
    throw new Error('No feeds registered.')
  }
  stats.feeds = feeds.length
  yield log(`Loaded ${feeds.length} feeds.`)

  // Stage 2: RSS fetch + save new articles as read=0, processed=0
  yield stage('fetch', `Fetching ${feeds.length} feeds...`)
  const fetchResults = await fetchFeeds(feeds.map((f) => f.url))

  for (const result of fetchResults) {
    if (result.error) {
      yield log(`✗ ${result.feedUrl}: ${result.error}`, 'warn')
      stats.feedErrors++
      continue
    }
    if (result.feedTitle) {
      upsertFeed(result.feedUrl, result.feedTitle)
    }
    touchFeed(result.feedUrl)

    const fresh = result.items.filter((i) => !hasArticle(i.id))
    if (fresh.length > 0) {
      saveArticles(
        fresh.map((i) => ({
          id: i.id,
          feedUrl: i.feedUrl,
          title: i.title,
          source: i.feedTitle,
          url: i.url,
          summary: i.summary,
          image: i.image,
          published: i.published,
          read: 0,
        })),
      )
      stats.newArticles += fresh.length
    }
  }
  yield log(
    `RSS: ${fetchResults.length} feeds (${stats.feedErrors} errors), ${stats.newArticles} new articles.`,
  )

  const queue = getUnprocessedArticles()
  if (queue.length === 0) {
    yield stage('done', 'No unprocessed articles.')
    return { tracks: [], stats }
  }

  // Stage 3: Gemini
  yield stage('gemini', `Generating queries for ${queue.length} articles...`)
  const tracks = await generateTracks(queue, (event) => {
    if (event.type === 'batch-start') {
      stats.geminiBatches = event.current
    }
  })
  stats.trackCount = tracks.length
  yield log(`Gemini produced ${tracks.length} tracks from ${queue.length} articles.`)

  // Stage 4: YouTube — batch-load cache once, then per-track lookup/fetch
  yield stage('youtube', `Searching YouTube for ${tracks.length} tracks...`)
  const trackArticleIds = [...new Set(tracks.map((t) => t.articleId))]
  const cache = getTrackCache(trackArticleIds)
  const trackResults: TrackWithVideo[] = []

  for (const track of tracks) {
    if (!track.searchQuery) {
      trackResults.push({ ...track, videoId: null, videoTitle: null })
      continue
    }

    const cached = cache.get(`${track.articleId}|${track.searchQuery}`)
    if (cached) {
      trackResults.push({ ...track, ...cached })
      stats.cacheHits++
      continue
    }

    try {
      const video = await searchYouTube(track.searchQuery)
      cacheVideo(track.articleId, track.searchQuery, video.videoId, video.videoTitle)
      trackResults.push({ ...track, ...video })
      stats.youtubeApiCalls++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      yield log(`YouTube search failed: ${track.searchQuery} (${msg})`, 'warn')
      trackResults.push({ ...track, videoId: null, videoTitle: null })
    }
  }

  yield log(
    `YouTube: ${tracks.length} tracks, ${stats.cacheHits} cached, ${stats.youtubeApiCalls} API calls.`,
  )

  // Stage 5: mark as processed (read는 사용자 액션 전용)
  const articleIds = [...new Set(tracks.map((t) => t.articleId))]
  stats.processed = markArticlesProcessed(articleIds)
  yield stage('mark-processed', `Marked ${stats.processed} articles as processed.`)

  yield stage('done', 'Pipeline complete.')
  return { tracks: trackResults, stats }
}
