import { Context, Effect, Layer, pipe } from 'effect'
import { GoogleGenAI, Type } from '@google/genai'
import type { ArticleRow } from './db.js'
import { retryByStatus } from './retry.js'

/**
 * Gemini가 기사 1건에서 뽑아낸 트랙 후보. 리스티클 기사는 여러 개가 같은 `articleId`를 공유한다.
 * 음악과 무관한 기사는 `searchQuery`가 빈 문자열로 온다.
 */
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

/**
 * Gemini SDK 인스턴스를 담는 서비스. 테스트에서는 가짜 `ai` 객체를 주입한다.
 * @see {@link GeminiClientLive} 환경변수로 초기화하는 구현
 */
export class GeminiClient extends Context.Tag('GeminiClient')<
  GeminiClient,
  { readonly ai: GoogleGenAI }
>() {}

/** `GEMINI_API_KEY` 환경변수가 없을 때 Layer 구성 단계에서 실패한다. */
export class MissingGeminiApiKeyError extends Error {
  readonly _tag = 'MissingGeminiApiKeyError'
  constructor() {
    super('GEMINI_API_KEY is required')
  }
}

/** `GEMINI_API_KEY`로 {@link GeminiClient}를 구성한다. 키가 없으면 {@link MissingGeminiApiKeyError}. */
export const GeminiClientLive = Layer.effect(
  GeminiClient,
  Effect.gen(function* () {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return yield* Effect.fail(new MissingGeminiApiKeyError())
    return { ai: new GoogleGenAI({ apiKey }) }
  }),
)

/** Gemini API 호출 실패. `status`가 재시도 가능 여부를 가른다({@link isRetryable}). */
export class GeminiApiError extends Error {
  readonly _tag = 'GeminiApiError'
  constructor(
    /** HTTP 상태 코드. 네트워크 오류처럼 응답 자체가 없으면 `undefined`. */
    public readonly status: number | undefined,
    message: string,
  ) {
    super(message)
  }
}

/** 응답 본문을 {@link TrackInput} 배열로 파싱하지 못했을 때. 재시도하지 않는다. */
export class GeminiParseError extends Error {
  readonly _tag = 'GeminiParseError'
}

type GeminiError = GeminiApiError | GeminiParseError

/** 배치 시작 시점에 알리는 진행 이벤트. `current`는 1부터 시작하는 배치 번호. */
export type GeminiProgressEvent = {
  type: 'batch-start'
  current: number
  total: number
  size: number
}

/** {@link generateTracks}가 배치마다 호출하는 진행 콜백. */
export type GeminiProgressCallback = (event: GeminiProgressEvent) => void

/** 기사 목록을 프롬프트용 평문으로 직렬화한다. 기사 사이는 `---`로 구분. */
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

/**
 * 응답 본문을 {@link TrackInput} 배열로 파싱한다. 본문이 비어 있으면 빈 배열,
 * JSON이 아니면 {@link GeminiParseError}로 실패한다.
 */
export const parseTracks = (text: string | undefined) =>
  Effect.try({
    try: () => {
      if (!text) return [] as TrackInput[]
      return JSON.parse(text) as TrackInput[]
    },
    catch: (e) => new GeminiParseError(e instanceof Error ? e.message : String(e)),
  })

/** 재시도할 만한 실패인지 판정한다. 429·500·502·503·504만 재시도하고 파싱 오류나 그 밖의 4xx는 즉시 포기. */
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

/**
 * 기사들을 50건씩 나눠 Gemini에 보내고 트랙 후보를 모아 돌려준다.
 * 배치는 순차 실행이며, 배치별 실패는 최대 5회까지 지수 백오프로 재시도한다.
 * @param onProgress 배치 시작마다 호출되는 진행 콜백
 */
export function generateTracks(
  articles: ArticleRow[],
  onProgress?: GeminiProgressCallback,
): Promise<TrackInput[]> {
  return Effect.runPromise(
    generateTracksEffect(articles, onProgress).pipe(Effect.provide(GeminiClientLive)),
  )
}
