import Parser from 'rss-parser'
import { Context, Effect, Layer } from 'effect'

/** 피드 종류와 무관하게 정규화된 기사 1건. `articles` 테이블 행의 원본이 된다. */
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

/** rss-parser 기본 필드에 없어 `customFields`로 추가 파싱하는 확장 필드. */
export interface CustomItemFields {
  'media:content'?: { $: { url?: string } } | { $: { url?: string } }[]
  'media:thumbnail'?: { $: { url?: string } } | { $: { url?: string } }[]
  enclosure?: { url?: string; type?: string }
  'content:encoded'?: string
  id?: string
}

/** rss-parser가 돌려주는 item에 {@link CustomItemFields}를 합친 타입. */
export type ParsedItem = Parser.Item & CustomItemFields

/** 파싱된 피드 중 이 앱이 실제로 쓰는 부분만 추린 타입. */
export interface ParsedFeed {
  title?: string
  items?: ParsedItem[]
}

/** 피드 XML을 내려받거나 파싱하는 데 실패했을 때. */
export class RssParserError extends Error {
  readonly _tag = 'RssParserError'
}

/**
 * 피드 URL을 파싱하는 서비스. 테스트에서는 이 Tag에 가짜 파서를 주입한다.
 * @see {@link RssParserLive} 실제 rss-parser 구현
 */
export class RssParser extends Context.Tag('RssParser')<
  RssParser,
  { readonly parseURL: (url: string) => Effect.Effect<ParsedFeed, RssParserError> }
>() {}

/** rss-parser 기반 {@link RssParser} 구현. 타임아웃 15초, media/enclosure 확장 필드를 함께 파싱한다. */
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

/** {@link RssParserError}에 실패한 피드 URL을 덧붙인 에러. 어느 피드가 깨졌는지 로그로 남기기 위함. */
export class RssFetchError extends Error {
  readonly _tag = 'RssFetchError'
  constructor(
    message: string,
    /** 파싱에 실패한 피드 URL. */
    public readonly feedUrl: string,
  ) {
    super(message)
  }
}

/**
 * 기사 대표 이미지를 고른다. `media:content` → `media:thumbnail` → 이미지 `enclosure` →
 * 본문 HTML의 첫 `<img src>` 순으로 탐색한다.
 * @returns 찾은 이미지 URL, 어디에도 없으면 `null`
 */
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

/**
 * 기사의 안정적인 기본키를 만든다. `guid` → `id` → `link` 순으로 쓰고,
 * 셋 다 없으면 `피드URL#제목`으로 대체한다.
 */
export function pickId(item: ParsedItem, feedUrl: string): string {
  return item.guid || item.id || item.link || `${feedUrl}#${item.title ?? ''}`
}

/**
 * 피드 하나를 파싱해 {@link RssItem} 목록으로 정규화한다.
 * @returns 피드 제목과 기사 목록. 파싱 실패 시 {@link RssFetchError}로 실패한다.
 */
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

/** 피드 1개의 수집 결과. 성공하면 `error`가 `null`, 실패하면 `items`가 빈 배열이다. */
export interface FetchResult {
  feedUrl: string
  feedTitle: string | null
  items: RssItem[]
  error: string | null
}

/**
 * 여러 피드를 동시에 수집한다. 개별 피드 실패는 {@link FetchResult.error}로 흡수되므로
 * 피드 하나가 깨져도 전체가 실패하지 않는다.
 */
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

/** {@link fetchFeedsEffect}에 실제 파서를 주입해 실행하는 Promise 진입점. */
export function fetchFeeds(feedUrls: string[]): Promise<FetchResult[]> {
  return Effect.runPromise(fetchFeedsEffect(feedUrls).pipe(Effect.provide(RssParserLive)))
}
