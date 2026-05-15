import type { TrackWithVideo } from './types.js'
import { fetchFeeds } from './rss.js'
import { generateTracks } from './gemini.js'
import { searchYouTube } from './youtube.js'
import {
  hasArticle,
  saveArticles,
  getCachedVideos,
  cacheVideo,
  markAllRead as dbMarkAllRead,
  markArticlesRead,
  listFeeds,
  upsertFeed,
  touchFeed,
  getUnreadArticles,
} from './db.js'

export interface PipelineOptions {
  useApi: boolean
}

export interface PipelineStats {
  feeds: number
  feedErrors: number
  newArticles: number
  backlogCleared: number
  geminiBatches: number
  trackCount: number
  cacheHits: number
  youtubeApiCalls: number
  markedRead: number
}

export interface PipelineResult {
  tracks: TrackWithVideo[]
  stats: PipelineStats
}

export type PipelineEvent =
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'stage'; stage: PipelineStage; message: string }

export type PipelineStage =
  | 'feeds'
  | 'fetch'
  | 'gemini'
  | 'youtube'
  | 'mark-read'
  | 'done'

function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): PipelineEvent {
  return { type: 'log', level, message }
}

function stage(s: PipelineStage, message: string): PipelineEvent {
  return { type: 'stage', stage: s, message }
}

const EMPTY_STATS: PipelineStats = {
  feeds: 0,
  feedErrors: 0,
  newArticles: 0,
  backlogCleared: 0,
  geminiBatches: 0,
  trackCount: 0,
  cacheHits: 0,
  youtubeApiCalls: 0,
  markedRead: 0,
}

/** RSS fetch → Gemini 검색어 생성 → YouTube 검색 → read 마킹까지 한 사이클을 async generator로 노출.
 * 진행 이벤트는 yield, 최종 결과(tracks)는 return으로 전달한다.
 *
 * 트랜잭션 보장: YouTube 단계가 완료되기 전까지는 이번 사이클에 fetch한 새 기사들이 read=0으로 남아 다음 실행에서 재시도된다. */
export async function* runPipeline(
  options: PipelineOptions,
): AsyncGenerator<PipelineEvent, PipelineResult> {
  const stats: PipelineStats = { ...EMPTY_STATS }

  // Stage 1: feeds
  yield stage('feeds', 'Loading feeds...')
  const feeds = listFeeds()
  if (feeds.length === 0) {
    throw new Error(
      'No feeds registered. Run with --import-opml <path> or --add-feed <url>.',
    )
  }
  stats.feeds = feeds.length
  yield log(`Loaded ${feeds.length} feeds.`)

  // Backlog cleanup (hybrid marking strategy)
  const cleared = dbMarkAllRead()
  stats.backlogCleared = cleared
  if (cleared > 0) {
    yield log(`Cleared ${cleared} backlog articles (read=0 → 1).`)
  }

  // Stage 2: RSS fetch + save new articles as read=0
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

  const unread = getUnreadArticles()
  if (unread.length === 0) {
    yield stage('done', 'No unread articles to process.')
    return { tracks: [], stats }
  }

  // Stage 3: Gemini
  yield stage('gemini', `Generating queries for ${unread.length} articles...`)
  const tracks = await generateTracks(unread, (event) => {
    if (event.type === 'batch-start') {
      stats.geminiBatches = event.current
      // Note: we can't yield from inside the callback, but we update stats.
      // For richer streaming, callers can wrap generateTracks themselves.
    }
  })
  stats.trackCount = tracks.length
  yield log(`Gemini produced ${tracks.length} tracks from ${unread.length} articles.`)

  // Stage 4: YouTube
  yield stage('youtube', `Searching YouTube for ${tracks.length} tracks...`)
  const trackResults: TrackWithVideo[] = []

  for (const track of tracks) {
    if (!track.searchQuery) {
      trackResults.push({ ...track, videoId: null, videoTitle: null })
      continue
    }

    if (!options.useApi) {
      trackResults.push({ ...track, videoId: null, videoTitle: null })
      continue
    }

    const cached = getCachedVideos(track.articleId).find(
      (c) => c.searchQuery === track.searchQuery,
    )
    if (cached) {
      trackResults.push({
        ...track,
        videoId: cached.videoId,
        videoTitle: cached.videoTitle,
      })
      stats.cacheHits++
      continue
    }

    try {
      const video = await searchYouTube(track.searchQuery)
      cacheVideo(
        track.articleId,
        track.searchQuery,
        video.videoId,
        video.videoTitle,
      )
      trackResults.push({ ...track, ...video })
      stats.youtubeApiCalls++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      yield log(`YouTube search failed: ${track.searchQuery} (${msg})`, 'warn')
      trackResults.push({ ...track, videoId: null, videoTitle: null })
    }
  }

  yield log(
    `YouTube: ${tracks.length} tracks, ${stats.cacheHits} cached, ${stats.youtubeApiCalls} API calls${!options.useApi ? ' (link-only)' : ''}.`,
  )

  // Stage 5: mark articles as read (transactional — only after YouTube step completes)
  const articleIds = [...new Set(tracks.map((t) => t.articleId))]
  stats.markedRead = markArticlesRead(articleIds)
  yield stage('mark-read', `Marked ${stats.markedRead} articles as read.`)

  yield stage('done', 'Pipeline complete.')
  return { tracks: trackResults, stats }
}
