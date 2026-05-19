import { Context, Effect, Layer, pipe } from 'effect'
import { GoogleGenAI, Type } from '@google/genai'
import type { ArticleRow } from './db.js'
import { retryByStatus } from './retry.js'

export interface TrackInput {
  articleId: string
  searchQuery: string
  articleTitle: string
  source: string
  url: string
}

const MODEL = 'gemini-3.1-flash-lite'
const BATCH_SIZE = 50
const MAX_ATTEMPTS = 5
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

const SYSTEM_INSTRUCTION = `You analyze music articles and produce YouTube search queries for tracks mentioned in them.

Rules:
1. Single-track review or premiere: produce one entry with "Artist Name Song Title" plus appropriate keyword ("official music video", "live", "cover", "audio", ...) when context suggests it.
2. Listicles ("Songs of the Week", "Best New Tracks", album reviews mentioning multiple cuts): produce one entry per distinct track. Reuse the same articleId for all entries derived from one article.
3. Non-music articles (interviews, news without a specific track, festival lineup announcements, gear reviews, obituaries): produce one entry for that article with searchQuery set to an empty string "". Do not omit it.
4. searchQuery must be in English.
5. Preserve articleId / articleTitle / source / url verbatim from the input.

Return JSON array only.`

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      articleId: { type: Type.STRING },
      searchQuery: { type: Type.STRING },
      articleTitle: { type: Type.STRING },
      source: { type: Type.STRING },
      url: { type: Type.STRING },
    },
    required: ['articleId', 'searchQuery', 'articleTitle', 'source', 'url'],
  },
}

export class GeminiClient extends Context.Tag('GeminiClient')<
  GeminiClient,
  { readonly ai: GoogleGenAI }
>() {}

export class MissingGeminiApiKeyError extends Error {
  readonly _tag = 'MissingGeminiApiKeyError'
  constructor() {
    super('GEMINI_API_KEY is required')
  }
}

export const GeminiClientLive = Layer.effect(
  GeminiClient,
  Effect.gen(function* () {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return yield* Effect.fail(new MissingGeminiApiKeyError())
    return { ai: new GoogleGenAI({ apiKey }) }
  }),
)

export class GeminiApiError extends Error {
  readonly _tag = 'GeminiApiError'
  constructor(
    public readonly status: number | undefined,
    message: string,
  ) {
    super(message)
  }
}

export class GeminiParseError extends Error {
  readonly _tag = 'GeminiParseError'
}

type GeminiError = GeminiApiError | GeminiParseError

export type GeminiProgressEvent = {
  type: 'batch-start'
  current: number
  total: number
  size: number
}

export type GeminiProgressCallback = (event: GeminiProgressEvent) => void

export function formatArticles(articles: ArticleRow[]): string {
  return articles
    .map((a) => `articleId: ${a.id}\ntitle: ${a.title}\nsource: ${a.source}\nurl: ${a.url}`)
    .join('\n\n---\n\n')
}

const callGemini = (articles: ArticleRow[]) =>
  Effect.gen(function* () {
    const { ai } = yield* GeminiClient
    return yield* Effect.tryPromise({
      try: () =>
        ai.models.generateContent({
          model: MODEL,
          contents: formatArticles(articles),
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      catch: (e) => {
        const status = (e as { status?: number })?.status
        return new GeminiApiError(status, e instanceof Error ? e.message : String(e))
      },
    })
  })

export const parseTracks = (text: string | undefined) =>
  Effect.try({
    try: () => {
      if (!text) return [] as TrackInput[]
      return JSON.parse(text) as TrackInput[]
    },
    catch: (e) => new GeminiParseError(e instanceof Error ? e.message : String(e)),
  })

export const isRetryable = (err: GeminiError): boolean =>
  err._tag === 'GeminiApiError' &&
  typeof err.status === 'number' &&
  RETRYABLE_STATUSES.has(err.status)

const retryPolicy = retryByStatus<GeminiError>({
  isRetryable,
  maxAttempts: MAX_ATTEMPTS,
  label: 'Gemini',
})

const generateBatch = (articles: ArticleRow[]) =>
  pipe(
    callGemini(articles),
    Effect.flatMap((response) => parseTracks(response.text)),
    Effect.retry(retryPolicy),
  )

const generateTracksEffect = (articles: ArticleRow[], onProgress?: GeminiProgressCallback) =>
  Effect.gen(function* () {
    const total = Math.ceil(articles.length / BATCH_SIZE)
    const tracks: TrackInput[] = []
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE)
      const current = Math.floor(i / BATCH_SIZE) + 1
      if (onProgress) {
        yield* Effect.sync(() =>
          onProgress({ type: 'batch-start', current, total, size: batch.length }),
        )
      }
      const result = yield* generateBatch(batch)
      tracks.push(...result)
    }
    return tracks
  })

export function generateTracks(
  articles: ArticleRow[],
  onProgress?: GeminiProgressCallback,
): Promise<TrackInput[]> {
  return Effect.runPromise(
    generateTracksEffect(articles, onProgress).pipe(Effect.provide(GeminiClientLive)),
  )
}
