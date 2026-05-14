import { writeFileSync } from 'fs'
import { createServer } from 'http'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { TrackWithVideo } from './types.js'
import { fetchFeeds } from './rss.js'
import { parseOpml } from './opml.js'
import { generateTracks } from './gemini.js'
import { searchYouTube } from './youtube.js'
import { generateHtml } from './html.js'
import {
  hasArticle,
  saveArticles,
  getCachedVideos,
  cacheVideo,
  markAllRead as dbMarkAllRead,
  markArticlesRead,
  listFeeds,
  upsertFeed,
  removeFeed,
  touchFeed,
  getUnreadArticles,
} from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = join(__dirname, '..', 'output.html')

interface ScrapeOptions {
  useApi: boolean
}

/** RSS fetch → Gemini로 검색어 생성 → YouTube 검색 → HTML 생성 → localhost:3333 서빙 → 성공 시 read 마킹.
 * 단일 Node 프로세스에서 모든 단계가 수행되며, HTML 생성 전에 어디서 실패해도 unread 상태로 남아 다음 실행에 자동 재처리된다. */
export async function scrape(options: ScrapeOptions): Promise<void> {
  const feeds = listFeeds()
  if (feeds.length === 0) {
    console.error(
      'No feeds registered. Run `pnpm start --import-opml <path>` or `pnpm start --add-feed <url>`.',
    )
    process.exit(1)
  }

  const cleared = dbMarkAllRead()
  if (cleared > 0) {
    console.error(`Cleared ${cleared} backlog articles (read=0 → 1).`)
  }

  console.error(`Fetching ${feeds.length} feeds...`)
  const fetchResults = await fetchFeeds(feeds.map((f) => f.url))

  let newCount = 0
  let errorCount = 0
  for (const result of fetchResults) {
    if (result.error) {
      console.error(`  ✗ ${result.feedUrl}: ${result.error}`)
      errorCount++
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
      newCount += fresh.length
    }
  }

  console.error(
    `RSS: ${fetchResults.length} feeds (${errorCount} errors), ${newCount} new articles`,
  )

  const unread = getUnreadArticles()
  if (unread.length === 0) {
    console.error('No unread articles to process.')
    return
  }
  console.error(`Unread to process: ${unread.length}`)

  const tracks = await generateTracks(unread)
  console.error(`Gemini: produced ${tracks.length} tracks from ${unread.length} articles.`)

  const trackResults: TrackWithVideo[] = []
  let cacheHits = 0

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
      cacheHits++
      continue
    }

    console.error(`Searching: ${track.searchQuery}`)
    try {
      const video = await searchYouTube(track.searchQuery)
      cacheVideo(
        track.articleId,
        track.searchQuery,
        video.videoId,
        video.videoTitle,
      )
      trackResults.push({ ...track, ...video })
    } catch (e) {
      console.error(`  ✗ YouTube search failed: ${e instanceof Error ? e.message : String(e)}`)
      trackResults.push({ ...track, videoId: null, videoTitle: null })
    }
  }

  const apiCalls = options.useApi ? tracks.length - cacheHits : 0
  console.error(
    `YouTube: ${tracks.length} tracks, ${cacheHits} cached, ${apiCalls} API calls${!options.useApi ? ' (link-only mode)' : ''}`,
  )

  const html = generateHtml(trackResults)
  writeFileSync(OUTPUT_PATH, html)
  console.error(`Generated: ${OUTPUT_PATH}`)

  const articleIds = [...new Set(tracks.map((t) => t.articleId))]
  const marked = markArticlesRead(articleIds)
  console.error(`Marked ${marked} articles as read.`)

  const server = createServer((_, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })

  server.listen(3333, () => {
    console.error('Serving at http://localhost:3333')
    import('child_process').then(({ exec }) =>
      exec('open http://localhost:3333'),
    )
  })
}

/** 모든 unread 기사를 read로 마킹한다. (긴급 클리어용) */
export function markAllRead(): void {
  const count = dbMarkAllRead()
  console.log(`Marked ${count} articles as read.`)
}

/** OPML 파일을 파싱하여 피드를 DB에 등록한다. --category 필터로 특정 카테고리만 선택 가능. */
export function importOpml(filePath: string, category: string | null): void {
  const feeds = parseOpml(filePath)
  const filtered = category
    ? feeds.filter((f) => f.category?.toLowerCase() === category.toLowerCase())
    : feeds

  if (filtered.length === 0) {
    console.error(
      category
        ? `No feeds found in category "${category}". Available categories: ${[...new Set(feeds.map((f) => f.category).filter(Boolean))].join(', ')}`
        : 'No feeds found in OPML file.',
    )
    process.exit(1)
  }

  for (const feed of filtered) {
    upsertFeed(feed.url, feed.title)
  }
  console.log(
    `Imported ${filtered.length} feeds${category ? ` from category "${category}"` : ''}.`,
  )
}

export function addFeed(url: string): void {
  upsertFeed(url, null)
  console.log(`Added feed: ${url}`)
}

export function removeFeedCmd(url: string): void {
  const changes = removeFeed(url)
  if (changes === 0) {
    console.error(`Feed not found: ${url}`)
    process.exit(1)
  }
  console.log(`Removed feed: ${url}`)
}

export function listFeedsCmd(): void {
  const feeds = listFeeds()
  if (feeds.length === 0) {
    console.log('No feeds registered.')
    return
  }
  for (const f of feeds) {
    console.log(
      `${f.title ?? '(no title)'}\n  ${f.url}\n  last fetched: ${f.lastFetchedAt ?? 'never'}`,
    )
  }
  console.log(`\nTotal: ${feeds.length} feeds`)
}
