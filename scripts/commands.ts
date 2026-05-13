import { writeFileSync } from 'fs'
import { createServer } from 'http'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { TrackInput, TrackWithVideo } from './types.js'
import { fetchFeeds } from './rss.js'
import { parseOpml } from './opml.js'
import { searchYouTube } from './youtube.js'
import { generateHtml } from './html.js'
import {
  hasArticle,
  saveArticles,
  getCachedVideos,
  cacheVideo,
  markAllRead as dbMarkAllRead,
  listFeeds,
  upsertFeed,
  removeFeed,
  touchFeed,
  getUnreadArticles,
} from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = join(__dirname, '..', 'output.html')

/** 기존 unread 기사를 모두 read로 마킹한 뒤, 등록된 RSS 피드를 fetch하고 새 기사만 저장하여 unread로 출력한다. */
export async function scrape(): Promise<void> {
  const feeds = listFeeds()
  if (feeds.length === 0) {
    console.error('No feeds registered. Run `pnpm start --import-opml <path>` or `pnpm start --add-feed <url>`.')
    process.exit(1)
  }

  const prevUnread = dbMarkAllRead()
  if (prevUnread > 0) {
    console.error(`Marked ${prevUnread} previously unread articles as read.`)
  }

  console.error(`Fetching ${feeds.length} feeds...`)
  const results = await fetchFeeds(feeds.map((f) => f.url))

  let newCount = 0
  let errorCount = 0
  for (const result of results) {
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

  const unread = getUnreadArticles()
  console.error(
    `RSS: ${results.length} feeds (${errorCount} errors), ${newCount} new articles, ${unread.length} unread total`,
  )

  const result = {
    entries: unread.map((a) => ({
      id: a.id,
      title: a.title,
      source: a.source,
      url: a.url,
      summary: a.summary,
      image: a.image,
      published: a.published,
    })),
  }

  console.log(JSON.stringify(result, null, 2))
}

interface SearchOptions {
  useApi: boolean
}

/** 트랙 JSON 배열을 받아 YouTube 검색(캐시 우선) 후 HTML을 생성하고 localhost:3000에서 서빙한다. --no-api 시 검색 링크만 제공. */
export async function searchAndOutput(
  tracksJson: string,
  options: SearchOptions,
): Promise<void> {
  const tracks: TrackInput[] = JSON.parse(tracksJson)
  const results: TrackWithVideo[] = []
  let cacheHits = 0

  for (const track of tracks) {
    if (!track.searchQuery) {
      console.error(`Skipped: ${track.articleTitle}`)
      results.push({ ...track, videoId: null, videoTitle: null })
      continue
    }

    if (!options.useApi) {
      results.push({ ...track, videoId: null, videoTitle: null })
      continue
    }

    const cached = getCachedVideos(track.articleId)
    const cachedHit = cached.find((c) => c.searchQuery === track.searchQuery)
    if (cachedHit) {
      console.error(`Cache hit: ${track.searchQuery}`)
      results.push({
        ...track,
        videoId: cachedHit.videoId,
        videoTitle: cachedHit.videoTitle,
      })
      cacheHits++
      continue
    }

    console.error(`Searching: ${track.searchQuery}`)
    const video = await searchYouTube(track.searchQuery)
    cacheVideo(
      track.articleId,
      track.searchQuery,
      video.videoId,
      video.videoTitle,
    )
    results.push({ ...track, ...video })
  }

  const apiCalls = options.useApi ? tracks.length - cacheHits : 0
  console.error(
    `YouTube: ${tracks.length} tracks, ${cacheHits} cached, ${apiCalls} API calls${!options.useApi ? ' (link-only mode)' : ''}`,
  )

  const html = generateHtml(results)
  writeFileSync(OUTPUT_PATH, html)
  console.error(`Generated: ${OUTPUT_PATH}`)

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

/** 모든 unread 기사를 read로 마킹한다. */
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
  console.log(`Imported ${filtered.length} feeds${category ? ` from category "${category}"` : ''}.`)
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
    console.log(`${f.title ?? '(no title)'}\n  ${f.url}\n  last fetched: ${f.lastFetchedAt ?? 'never'}`)
  }
  console.log(`\nTotal: ${feeds.length} feeds`)
}
