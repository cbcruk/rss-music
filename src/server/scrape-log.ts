import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

const LOG_PATH = process.env.RSS_SCRAPE_LOG ?? join(process.cwd(), 'data', 'scrape.jsonl')

export interface FeedLogRecord {
  type: 'feed'
  runId: string
  feedUrl: string
  feedTitle: string | null
  ok: boolean
  itemCount: number
  newCount: number
  newestPublished: string | null
  error: string | null
}

export interface RunLogRecord {
  type: 'run'
  runId: string
  durationMs: number
  feeds: number
  feedErrors: number
  newArticles: number
  processed: number
  trackCount: number
  cacheHits: number
  youtubeApiCalls: number
}

export type ScrapeLogRecord = FeedLogRecord | RunLogRecord

export async function appendScrapeLog(record: ScrapeLogRecord): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n'
  try {
    await appendFile(LOG_PATH, line)
  } catch {
    // Logging must never break the pipeline.
  }
}

export function newestPublished(items: ReadonlyArray<{ published: string | null }>): string | null {
  let max: string | null = null
  for (const item of items) {
    if (item.published && (max === null || item.published > max)) max = item.published
  }
  return max
}
