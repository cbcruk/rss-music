import { Context, Effect, Layer, pipe } from 'effect'
import type { CachedVideo } from './db.js'
import { Fetcher, FetcherLive } from './fetcher.js'
import { retryByStatus } from './retry.js'

const MAX_ATTEMPTS = 5
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

export class YoutubeClient extends Context.Tag('YoutubeClient')<
  YoutubeClient,
  { readonly apiKey: string }
>() {}

export class MissingYoutubeApiKeyError extends Error {
  readonly _tag = 'MissingYoutubeApiKeyError'
  constructor() {
    super('YOUTUBE_API_KEY is required')
  }
}

export const YoutubeClientLive = Layer.effect(
  YoutubeClient,
  Effect.gen(function* () {
    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) return yield* Effect.fail(new MissingYoutubeApiKeyError())
    return { apiKey }
  }),
)

export class YoutubeApiError extends Error {
  readonly _tag = 'YoutubeApiError'
  constructor(
    public readonly status: number | undefined,
    message: string,
  ) {
    super(message)
  }
}

export class YoutubeParseError extends Error {
  readonly _tag = 'YoutubeParseError'
}

type YoutubeError = YoutubeApiError | YoutubeParseError

interface SearchItem {
  id: { videoId: string }
  snippet: { title: string }
}

interface SearchResponse {
  items?: SearchItem[]
}

const callYoutube = (query: string) =>
  Effect.gen(function* () {
    const { apiKey } = yield* YoutubeClient
    const { fetch } = yield* Fetcher
    const url =
      'https://www.googleapis.com/youtube/v3/search' +
      '?part=snippet&type=video&videoCategoryId=10&maxResults=1' +
      `&q=${encodeURIComponent(query)}&key=${apiKey}`

    const res = yield* fetch(url).pipe(
      Effect.mapError((e) => new YoutubeApiError(undefined, e.message)),
    )

    if (!res.ok) {
      return yield* Effect.fail(
        new YoutubeApiError(res.status, `YouTube search error: ${res.status}`),
      )
    }

    return yield* Effect.tryPromise({
      try: () => res.json() as Promise<SearchResponse>,
      catch: (e) => new YoutubeParseError(e instanceof Error ? e.message : String(e)),
    })
  })

const isRetryable = (err: YoutubeError): boolean =>
  err._tag === 'YoutubeApiError' &&
  typeof err.status === 'number' &&
  RETRYABLE_STATUSES.has(err.status)

const retryPolicy = retryByStatus<YoutubeError>({
  isRetryable,
  maxAttempts: MAX_ATTEMPTS,
  label: 'YouTube',
})

export const searchYouTubeEffect = (query: string) =>
  pipe(
    callYoutube(query),
    Effect.retry(retryPolicy),
    Effect.map((data): CachedVideo => {
      const item = data.items?.[0]
      if (!item) return { videoId: null, videoTitle: null }
      return { videoId: item.id.videoId, videoTitle: item.snippet.title }
    }),
  )

/** YouTube Data API로 검색어에 해당하는 음악 영상을 검색한다. 첫 번째 결과를 반환. */
export function searchYouTube(query: string): Promise<CachedVideo> {
  return Effect.runPromise(
    searchYouTubeEffect(query).pipe(Effect.provide(YoutubeClientLive), Effect.provide(FetcherLive)),
  )
}
