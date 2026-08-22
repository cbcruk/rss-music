import { Context, Effect, Layer } from 'effect'

/** fetch 자체가 실패했을 때(네트워크 오류 등). HTTP 에러 응답은 여기 해당하지 않는다. */
export class FetcherError extends Error {
  readonly _tag = 'FetcherError'
}

/**
 * HTTP 요청을 추상화한 서비스. 테스트에서 네트워크 없이 응답을 가짜로 주입하기 위해 존재한다.
 * @see {@link FetcherLive} `globalThis.fetch` 구현
 */
export class Fetcher extends Context.Tag('Fetcher')<
  Fetcher,
  {
    readonly fetch: (input: string, init?: RequestInit) => Effect.Effect<Response, FetcherError>
  }
>() {}

/** `globalThis.fetch` 기반 {@link Fetcher} 구현. */
export const FetcherLive = Layer.succeed(Fetcher, {
  fetch: (input, init) =>
    Effect.tryPromise({
      try: () => globalThis.fetch(input, init),
      catch: (e) => new FetcherError(e instanceof Error ? e.message : String(e)),
    }),
})
