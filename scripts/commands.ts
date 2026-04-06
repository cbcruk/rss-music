import { writeFileSync } from 'fs'
import { createServer } from 'http'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { TrackInput, TrackWithVideo } from './types.js'
import { fetchUnreadEntries, markAsRead } from './feedly.js'
import { searchYouTube } from './youtube.js'
import { generateHtml } from './html.js'
import { hasArticle, saveArticles, getCachedVideos, cacheVideo, markAllProcessed } from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = join(__dirname, '..', 'output.html')

/** Feedly에서 안 읽은 기사를 가져와 새 기사만 JSON으로 stdout에 출력하고, DB에 저장 후 읽음 처리한다. */
export async function scrape(): Promise<void> {
  const entries = await fetchUnreadEntries()

  const newEntries = entries.filter((e) => !hasArticle(e.id))
  console.error(
    `Feedly: ${entries.length} unread, ${newEntries.length} new, ${entries.length - newEntries.length} cached`,
  )

  const mapped = newEntries.map((e) => ({
    id: e.id,
    title: e.title ?? '',
    source: e.origin?.title ?? '',
    url: e.alternate?.[0]?.href ?? '',
    keywords: e.keywords ? JSON.stringify(e.keywords) : null,
    summary: e.summary?.content ?? null,
    image: e.visual?.url ?? null,
    published: e.published ? new Date(e.published).toISOString() : null,
    processed: 0,
  }))

  saveArticles(mapped)

  const result = {
    category: 'musicexplo',
    entries: mapped,
  }

  console.log(JSON.stringify(result, null, 2))

  await markAsRead(entries.map((e) => e.id))

  console.error(`Marked ${entries.length} entries as read.`)
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

  server.listen(3000, () => {
    console.error('Serving at http://localhost:3000')
    import('child_process').then(({ exec }) =>
      exec('open http://localhost:3000'),
    )
  })
}

/** 미처리 기사를 모두 처리 완료로 마킹한다. */
export function markAllRead(): void {
  const count = markAllProcessed()
  console.log(`Marked ${count} articles as processed.`)
}
