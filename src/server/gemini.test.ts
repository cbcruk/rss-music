import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'
import type { ArticleRow } from './db.js'
import {
  formatArticles,
  GeminiApiError,
  GeminiParseError,
  isRetryable,
  parseTracks,
} from './gemini'

function article(overrides: Partial<ArticleRow> & { id: string }): ArticleRow {
  return {
    feedUrl: 'feed',
    title: 'Title',
    source: 'Source',
    url: 'https://x/a',
    summary: null,
    image: null,
    published: null,
    read: 0,
    ...overrides,
  }
}

describe('formatArticles', () => {
  it('returns empty string for empty input', () => {
    expect(formatArticles([])).toBe('')
  })

  it('formats a single article with all fields', () => {
    expect(
      formatArticles([
        article({ id: 'a1', title: 'Hello', source: 'Pitchfork', url: 'https://p/a' }),
      ]),
    ).toBe(`articleId: a1\ntitle: Hello\nsource: Pitchfork\nurl: https://p/a`)
  })

  it('joins multiple articles with --- separator', () => {
    const out = formatArticles([
      article({ id: 'a1', title: 'One', source: 'S1', url: 'u1' }),
      article({ id: 'a2', title: 'Two', source: 'S2', url: 'u2' }),
    ])
    expect(out).toBe(
      `articleId: a1\ntitle: One\nsource: S1\nurl: u1\n\n---\n\n` +
        `articleId: a2\ntitle: Two\nsource: S2\nurl: u2`,
    )
  })

  it('preserves special characters verbatim in fields', () => {
    const out = formatArticles([
      article({ id: 'a', title: 'Tom: "Hi" — & 한글', source: 's', url: 'u' }),
    ])
    expect(out).toContain('Tom: "Hi" — & 한글')
  })
})

describe('parseTracks', () => {
  it('returns empty array when text is undefined', () => {
    expect(Effect.runSync(parseTracks(undefined))).toEqual([])
  })

  it('returns empty array when text is empty string', () => {
    expect(Effect.runSync(parseTracks(''))).toEqual([])
  })

  it('parses valid JSON array of TrackInput', () => {
    const json = JSON.stringify([
      {
        articleId: 'a1',
        searchQuery: 'q1',
        articleTitle: 'T',
        source: 'S',
        url: 'U',
      },
    ])
    expect(Effect.runSync(parseTracks(json))).toEqual([
      { articleId: 'a1', searchQuery: 'q1', articleTitle: 'T', source: 'S', url: 'U' },
    ])
  })

  it('fails with GeminiParseError on invalid JSON', () => {
    const exit = Effect.runSyncExit(parseTracks('{not valid json'))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit) && exit.cause._tag === 'Fail') {
      expect(exit.cause.error).toBeInstanceOf(GeminiParseError)
      expect((exit.cause.error as GeminiParseError)._tag).toBe('GeminiParseError')
    }
  })
})

describe('isRetryable', () => {
  it('returns true for GeminiApiError with retryable status (429, 500, 502, 503, 504)', () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isRetryable(new GeminiApiError(status, `${status}`))).toBe(true)
    }
  })

  it('returns false for GeminiApiError with non-retryable status', () => {
    for (const status of [400, 401, 403, 404]) {
      expect(isRetryable(new GeminiApiError(status, `${status}`))).toBe(false)
    }
  })

  it('returns false for GeminiApiError without status', () => {
    expect(isRetryable(new GeminiApiError(undefined, 'network'))).toBe(false)
  })

  it('returns false for GeminiParseError (parse errors are not retryable)', () => {
    expect(isRetryable(new GeminiParseError('bad json'))).toBe(false)
  })
})
