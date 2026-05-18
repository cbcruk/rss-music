import { Context, Effect, Layer } from 'effect'

export class FetcherError extends Error {
  readonly _tag = 'FetcherError'
}

export class Fetcher extends Context.Tag('Fetcher')<
  Fetcher,
  {
    readonly fetch: (input: string, init?: RequestInit) => Effect.Effect<Response, FetcherError>
  }
>() {}

export const FetcherLive = Layer.succeed(Fetcher, {
  fetch: (input, init) =>
    Effect.tryPromise({
      try: () => globalThis.fetch(input, init),
      catch: (e) => new FetcherError(e instanceof Error ? e.message : String(e)),
    }),
})
