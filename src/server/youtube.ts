import { Context, Effect, Layer, pipe } from 'effect'
import type { CachedVideo } from './db.js'
import { Fetcher, FetcherLive } from './fetcher.js'
import { retryByStatus } from './retry.js'

const MAX_ATTEMPTS = 5
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

/**
 * YouTube Data API 키를 담는 서비스. 테스트에서는 더미 키를 주입한다.
 * @see {@link YoutubeClientLive} 환경변수로 초기화하는 구현
 */
export class YoutubeClient extends Context.Tag('YoutubeClient')<
  YoutubeClient,
  { readonly apiKey: string }
>() {}

/** `YOUTUBE_API_KEY` 환경변수가 없을 때 Layer 구성 단계에서 실패한다. */
export class MissingYoutubeApiKeyError extends Error {
  readonly _tag = 'MissingYoutubeApiKeyError'
  constructor() {
    super('YOUTUBE_API_KEY is required')
  }
}

/** `YOUTUBE_API_KEY`로 {@link YoutubeClient}를 구성한다. 키가 없으면 {@link MissingYoutubeApiKeyError}. */
export const YoutubeClientLive = Layer.effect(
  YoutubeClient,
  Effect.gen(function* () {
    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) return yield* Effect.fail(new MissingYoutubeApiKeyError())
    return { apiKey }
  }),
)

/** 검색 API 호출 실패. `status`가 재시도 가능 여부를 가른다(429·500·502·503·504만 재시도). */
export class YoutubeApiError extends Error {
  readonly _tag = 'YoutubeApiError'
  constructor(
    /** HTTP 상태 코드. 네트워크 오류처럼 응답 자체가 없으면 `undefined`. */
    public readonly status: number | undefined,
    message: string,
  ) {
    super(message)
  }
}

/** 검색 응답 본문을 JSON으로 읽지 못했을 때. 재시도하지 않는다. */
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

/**
 * 음악 카테고리(`videoCategoryId=10`)로 한정해 검색하고 첫 결과만 취한다.
 * 재시도 정책과 {@link Fetcher} 주입이 필요한 Effect 버전.
 * @returns 첫 검색 결과. 결과가 없으면 두 필드가 `null`인 {@link CachedVideo}
 */
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

/**
 * YouTube Data API로 검색어에 해당하는 음악 영상을 검색한다. 첫 번째 결과를 반환.
 * {@link searchYouTubeEffect}에 실제 API 키와 fetch를 주입해 실행하는 Promise 진입점.
 */
export function searchYouTube(query: string): Promise<CachedVideo> {
  return Effect.runPromise(
    searchYouTubeEffect(query).pipe(Effect.provide(YoutubeClientLive), Effect.provide(FetcherLive)),
  )
}
