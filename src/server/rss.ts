import Parser from 'rss-parser'
import { Context, Effect, Layer } from 'effect'

export interface RssItem {
  id: string
  feedUrl: string
  feedTitle: string
  title: string
  url: string
  summary: string | null
  image: string | null
  published: string | null
  categories: string[]
  author: string | null
}

export interface CustomItemFields {
  'media:content'?: { $: { url?: string } } | { $: { url?: string } }[]
  'media:thumbnail'?: { $: { url?: string } } | { $: { url?: string } }[]
  enclosure?: { url?: string; type?: string }
  'content:encoded'?: string
  id?: string
}

export type ParsedItem = Parser.Item & CustomItemFields

export interface ParsedFeed {
  title?: string
  items?: ParsedItem[]
}

export class RssParserError extends Error {
  readonly _tag = 'RssParserError'
}

export class RssParser extends Context.Tag('RssParser')<
  RssParser,
  { readonly parseURL: (url: string) => Effect.Effect<ParsedFeed, RssParserError> }
>() {}

export const RssParserLive = Layer.sync(RssParser, () => {
  const parser = new Parser<{}, CustomItemFields>({
    timeout: 15000,
    headers: { 'User-Agent': 'rss-extensions/1.0 (+https://github.com/)' },
    customFields: {
      item: ['media:content', 'media:thumbnail', 'enclosure', 'content:encoded'],
    },
  })
  return {
    parseURL: (url) =>
      Effect.tryPromise({
        try: () => parser.parseURL(url) as Promise<ParsedFeed>,
        catch: (e) => new RssParserError(e instanceof Error ? e.message : String(e)),
      }),
  }
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

export function pickImage(item: ParsedItem): string | null {
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

export function pickId(item: ParsedItem, feedUrl: string): string {
  return item.guid || item.id || item.link || `${feedUrl}#${item.title ?? ''}`
}

export const fetchFeedEffect = (feedUrl: string) =>
  Effect.gen(function* () {
    const { parseURL } = yield* RssParser
    const feed = yield* parseURL(feedUrl).pipe(
      Effect.mapError((e) => new RssFetchError(e.message, feedUrl)),
    )
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
      categories: item.categories ?? [],
      author: item.creator ?? null,
    }))
    return { feedTitle, items }
  })

export interface FetchResult {
  feedUrl: string
  feedTitle: string | null
  items: RssItem[]
  error: string | null
}

export const fetchFeedsEffect = (feedUrls: string[]) =>
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
  return Effect.runPromise(fetchFeedsEffect(feedUrls).pipe(Effect.provide(RssParserLive)))
}
