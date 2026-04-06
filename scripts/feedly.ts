import type { FeedlyEntry } from './types.js'
import { FEEDLY_BASE, STREAM_ID } from './constants.js'

function getFeedlyToken(): string {
  const token = process.env.FEEDLY_TOKEN
  if (!token) {
    console.error('FEEDLY_TOKEN is required')
    process.exit(1)
  }
  return token
}

function feedlyHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

/** Feedly API에서 musicexplo 카테고리의 안 읽은 기사를 모두 가져온다. pagination 자동 처리. */
export async function fetchUnreadEntries(): Promise<FeedlyEntry[]> {
  const token = getFeedlyToken()
  const allEntries: FeedlyEntry[] = []

  let continuation: string | undefined
  do {
    const url =
      `${FEEDLY_BASE}/v3/streams/contents` +
      `?streamId=${encodeURIComponent(STREAM_ID)}&unreadOnly=true&count=100` +
      (continuation ? `&continuation=${continuation}` : '')

    const res = await fetch(url, { headers: feedlyHeaders(token) })
    if (!res.ok) throw new Error(`Feedly stream error: ${res.status}`)

    const data = await res.json()
    allEntries.push(...((data.items ?? []) as FeedlyEntry[]))
    continuation = data.continuation
  } while (continuation)

  return allEntries
}

/** 지정된 entry ID 목록을 Feedly에서 읽음 처리한다. */
export async function markAsRead(entryIds: string[]): Promise<void> {
  if (!entryIds.length) return
  const token = getFeedlyToken()

  const res = await fetch(`${FEEDLY_BASE}/v3/markers`, {
    method: 'POST',
    headers: feedlyHeaders(token),
    body: JSON.stringify({
      action: 'markAsRead',
      type: 'entries',
      entryIds,
    }),
  })

  if (!res.ok) throw new Error(`Feedly markAsRead error: ${res.status}`)
}
