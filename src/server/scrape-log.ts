import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

const LOG_PATH = process.env.RSS_SCRAPE_LOG ?? join(process.cwd(), 'data', 'scrape.jsonl')

/** 피드 1개의 수집 결과 로그. 실패한 경우 `ok: false`이고 `error`에 사유가 담긴다. */
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

/** 실행 1회의 요약 로그. 같은 `runId`를 가진 {@link FeedLogRecord}들의 마무리 격. */
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

/** `scrape.jsonl`에 쌓이는 레코드. `type`으로 구분한다. */
export type ScrapeLogRecord = FeedLogRecord | RunLogRecord

/**
 * 레코드에 타임스탬프를 붙여 JSONL 로그 파일에 한 줄 덧붙인다.
 * 로그 실패가 파이프라인을 멈추면 안 되므로 쓰기 오류는 삼킨다.
 */
export async function appendScrapeLog(record: ScrapeLogRecord): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n'
  try {
    await appendFile(LOG_PATH, line)
  } catch {
    // Logging must never break the pipeline.
  }
}

/**
 * 가장 최근 발행일을 고른다. 값이 ISO 8601 문자열이라 사전순 비교로 충분하다.
 * @returns 최신 발행일. 발행일이 있는 항목이 하나도 없으면 `null`
 */
export function newestPublished(items: ReadonlyArray<{ published: string | null }>): string | null {
  let max: string | null = null
  for (const item of items) {
    if (item.published && (max === null || item.published > max)) max = item.published
  }
  return max
}
