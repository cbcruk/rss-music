import Parser from 'rss-parser'
import { Effect } from 'effect'
import type { RssItem } from './types.js'

interface CustomItemFields {
  'media:content'?: { $: { url?: string } } | { $: { url?: string } }[]
  'media:thumbnail'?: { $: { url?: string } } | { $: { url?: string } }[]
  enclosure?: { url?: string; type?: string }
  'content:encoded'?: string
  id?: string
}

const parser = new Parser<{}, CustomItemFields>({
  timeout: 15000,
  headers: { 'User-Agent': 'rss-extensions/1.0 (+https://github.com/)' },
  customFields: {
    item: ['media:content', 'media:thumbnail', 'enclosure', 'content:encoded'],
  },
})

export class RssFetchError extends Error {
  readonly _tag = 'RssFetchError'
  constructor(
    message: string,
    public readonly feedUrl: string,
  ) {
    super(message)
  }
}

function pickImage(item: Parser.Item & CustomItemFields): string | null {
  const media = item['media:content']
  if (media) {
    const arr = Array.isArray(media) ? media : [media]
    for (const m of arr) {
      const url = m?.$?.url
      if (url) return url
    }
  }
  const thumb = item['media:thumbnail']
  if (thumb) {
    const arr = Array.isArray(thumb) ? thumb : [thumb]
    for (const m of arr) {
      const url = m?.$?.url
      if (url) return url
    }
  }
  if (item.enclosure?.url && item.enclosure.type?.startsWith('image/')) {
    return item.enclosure.url
  }
  const html = item['content:encoded'] ?? item.content ?? ''
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match ? match[1] : null
}

function pickId(item: Parser.Item & CustomItemFields, feedUrl: string): string {
  return item.guid || item.id || item.link || `${feedUrl}#${item.title ?? ''}`
}

const fetchFeedEffect = (feedUrl: string) =>
  Effect.gen(function* () {
    const feed = yield* Effect.tryPromise({
      try: () => parser.parseURL(feedUrl),
      catch: (e) => new RssFetchError(e instanceof Error ? e.message : String(e), feedUrl),
    })
    const feedTitle = feed.title ?? feedUrl
    const items: RssItem[] = (feed.items ?? []).map((item) => ({
      id: pickId(item, feedUrl),
      feedUrl,
      feedTitle,
      title: item.title ?? '',
      url: item.link ?? '',
      summary: item.contentSnippet ?? item.summary ?? null,
      image: pickImage(item),
      published: item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : null),
    }))
    return { feedTitle, items }
  })

export interface FetchResult {
  feedUrl: string
  feedTitle: string | null
  items: RssItem[]
  error: string | null
}

const fetchFeedsEffect = (feedUrls: string[]) =>
  Effect.forEach(
    feedUrls,
    (url) =>
      fetchFeedEffect(url).pipe(
        Effect.match({
          onSuccess: ({ feedTitle, items }): FetchResult => ({
            feedUrl: url,
            feedTitle,
            items,
            error: null,
          }),
          onFailure: (e): FetchResult => ({
            feedUrl: url,
            feedTitle: null,
            items: [],
            error: e.message,
          }),
        }),
      ),
    { concurrency: 'unbounded' },
  )

export function fetchFeeds(feedUrls: string[]): Promise<FetchResult[]> {
  return Effect.runPromise(fetchFeedsEffect(feedUrls))
}
