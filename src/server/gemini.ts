import { GoogleGenAI, Type } from '@google/genai'
import type { ArticleRow } from './db.js'
import type { TrackInput } from './types.js'

const MODEL = 'gemini-3.1-flash-lite'
const BATCH_SIZE = 50

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

function formatArticles(articles: ArticleRow[]): string {
  return articles
    .map((a) => `articleId: ${a.id}\ntitle: ${a.title}\nsource: ${a.source}\nurl: ${a.url}`)
    .join('\n\n---\n\n')
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 5

export type GeminiProgressEvent =
  | { type: 'batch-start'; current: number; total: number; size: number }
  | { type: 'batch-retry'; label: string; attempt: number; status: number; delayMs: number }

export type GeminiProgressCallback = (event: GeminiProgressEvent) => void

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  onProgress: GeminiProgressCallback | undefined,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const status = (e as { status?: number })?.status
      const retryable = typeof status === 'number' && RETRYABLE_STATUSES.has(status)
      if (!retryable || attempt === MAX_ATTEMPTS) throw e
      const delay = Math.min(1000 * 2 ** (attempt - 1), 16000) + Math.random() * 500
      onProgress?.({
        type: 'batch-retry',
        label,
        attempt,
        status: status as number,
        delayMs: Math.round(delay),
      })
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

async function generateBatch(
  ai: GoogleGenAI,
  articles: ArticleRow[],
  batchLabel: string,
  onProgress: GeminiProgressCallback | undefined,
): Promise<TrackInput[]> {
  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: MODEL,
        contents: formatArticles(articles),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    batchLabel,
    onProgress,
  )

  const text = response.text
  if (!text) return []
  return JSON.parse(text) as TrackInput[]
}

export async function generateTracks(
  articles: ArticleRow[],
  onProgress?: GeminiProgressCallback,
): Promise<TrackInput[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required')
  }

  const ai = new GoogleGenAI({ apiKey })
  const totalBatches = Math.ceil(articles.length / BATCH_SIZE)
  const tracks: TrackInput[] = []

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE)
    const batchNo = Math.floor(i / BATCH_SIZE) + 1
    const label = `Gemini batch ${batchNo}/${totalBatches}`
    onProgress?.({
      type: 'batch-start',
      current: batchNo,
      total: totalBatches,
      size: batch.length,
    })
    const batchResults = await generateBatch(ai, batch, label, onProgress)
    tracks.push(...batchResults)
  }

  return tracks
}
