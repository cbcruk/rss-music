import { Duration, Effect, Layer, TestClock, TestContext } from 'effect'
import { describe, expect, it } from 'vitest'
import { Fetcher, FetcherError } from './fetcher'
import { searchYouTubeEffect, YoutubeClient } from './youtube'

const TestYoutubeClient = Layer.succeed(YoutubeClient, { apiKey: 'test-key' })

/** Build a Fetcher Layer that returns the given responses in order. Records the URLs fetched. */
function fetcherLayer(...responses: Array<Partial<Response> | FetcherError>): {
  layer: Layer.Layer<Fetcher>
  callCount: () => number
  callsWith: () => string[]
} {
  const calls: string[] = []
  let i = 0
  const layer = Layer.succeed(Fetcher, {
    fetch: (url) => {
      calls.push(url)
      const r = responses[i++]
      if (r instanceof FetcherError) return Effect.fail(r)
      return Effect.succeed(r as Response)
    },
  })
  return { layer, callCount: () => calls.length, callsWith: () => calls }
}

function jsonResponse(body: unknown, status = 200): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function errorResponse(status: number): Partial<Response> {
  return { ok: false, status }
}

/** Run an Effect requiring YoutubeClient + Fetcher with TestClock for fake time. */
async function runWith<A>(
  effect: Effect.Effect<A, unknown, YoutubeClient | Fetcher>,
  fetcher: Layer.Layer<Fetcher>,
  clockTicksSec: ReadonlyArray<number> = [],
): Promise<A> {
  const program = Effect.gen(function* () {
    const fiber = yield* Effect.fork(effect)
    for (const sec of clockTicksSec) {
      yield* TestClock.adjust(Duration.seconds(sec))
    }
    return yield* fiber.await
  }).pipe(
    Effect.flatMap((exit) =>
      exit._tag === 'Success' ? Effect.succeed(exit.value) : Effect.failCause(exit.cause),
    ),
  )
  return Effect.runPromise(
    program.pipe(
      Effect.provide(TestYoutubeClient),
      Effect.provide(fetcher),
      Effect.provide(TestContext.TestContext),
    ),
  )
}

describe('searchYouTube — success mapping', () => {
  it('maps first item to { videoId, videoTitle }', async () => {
    const f = fetcherLayer(
      jsonResponse({ items: [{ id: { videoId: 'abc123' }, snippet: { title: 'Test Song' } }] }),
    )
    const result = await runWith(searchYouTubeEffect('artist - track'), f.layer)
    expect(result).toEqual({ videoId: 'abc123', videoTitle: 'Test Song' })
  })

  it('returns null pair when items is empty', async () => {
    const f = fetcherLayer(jsonResponse({ items: [] }))
    expect(await runWith(searchYouTubeEffect('q'), f.layer)).toEqual({
      videoId: null,
      videoTitle: null,
    })
  })

  it('returns null pair when items is missing', async () => {
    const f = fetcherLayer(jsonResponse({}))
    expect(await runWith(searchYouTubeEffect('q'), f.layer)).toEqual({
      videoId: null,
      videoTitle: null,
    })
  })

  it('builds the search URL with required query params', async () => {
    const f = fetcherLayer(jsonResponse({ items: [] }))
    await runWith(searchYouTubeEffect('hello world'), f.layer)
    const url = f.callsWith()[0]
    expect(url).toContain('https://www.googleapis.com/youtube/v3/search')
    expect(url).toContain('part=snippet')
    expect(url).toContain('type=video')
    expect(url).toContain('videoCategoryId=10')
    expect(url).toContain('maxResults=1')
    expect(url).toContain('q=hello%20world')
    expect(url).toContain('key=test-key')
  })
})

describe('searchYouTube — error paths', () => {
  it('throws on 4xx without retry', async () => {
    const f = fetcherLayer(errorResponse(403))
    await expect(runWith(searchYouTubeEffect('q'), f.layer)).rejects.toThrow(/403/)
    expect(f.callCount()).toBe(1)
  })

  it('throws on 404 without retry', async () => {
    const f = fetcherLayer(errorResponse(404))
    await expect(runWith(searchYouTubeEffect('q'), f.layer)).rejects.toThrow(/404/)
    expect(f.callCount()).toBe(1)
  })
})

describe('searchYouTube — retry behavior (with TestClock)', () => {
  it('retries on 503 then succeeds (advancing clock through backoff)', async () => {
    const f = fetcherLayer(
      errorResponse(503),
      jsonResponse({ items: [{ id: { videoId: 'after-retry' }, snippet: { title: 'OK' } }] }),
    )
    const result = await runWith(searchYouTubeEffect('q'), f.layer, [2])
    expect(result).toEqual({ videoId: 'after-retry', videoTitle: 'OK' })
    expect(f.callCount()).toBe(2)
  })

  it('exhausts retries on persistent 503 then throws', async () => {
    const f = fetcherLayer(
      errorResponse(503),
      errorResponse(503),
      errorResponse(503),
      errorResponse(503),
      errorResponse(503),
    )
    await expect(runWith(searchYouTubeEffect('q'), f.layer, [20])).rejects.toThrow(/503/)
    expect(f.callCount()).toBe(5)
  })

  it('throws YoutubeParseError on malformed JSON (no retry)', async () => {
    const f = fetcherLayer({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token')
      },
    })
    await expect(runWith(searchYouTubeEffect('q'), f.layer)).rejects.toThrow(/Unexpected token/)
    expect(f.callCount()).toBe(1)
  })

  it('wraps FetcherError as YoutubeApiError (network failure)', async () => {
    const f = fetcherLayer(new FetcherError('ECONNREFUSED'))
    await expect(runWith(searchYouTubeEffect('q'), f.layer)).rejects.toThrow(/ECONNREFUSED/)
    expect(f.callCount()).toBe(1)
  })
})
