import { describe, expect, it } from 'vitest'
import type { ArticleRow, CachedVideo, FeedRow } from './db.js'
import type { TrackInput } from './gemini.js'
import { runPipeline, type PipelineEvent, type PipelineResult } from './pipeline'
import type { FetchResult, RssItem } from './rss.js'
import type { ScrapeLogRecord } from './scrape-log.js'
import type { ScrapePorts } from './scrape-ports.js'

async function drain<T, R>(gen: AsyncGenerator<T, R>): Promise<{ events: T[]; result: R }> {
  const events: T[] = []
  while (true) {
    const { value, done } = await gen.next()
    if (done) return { events, result: value }
    events.push(value)
  }
}

function feedRow(url: string, title: string | null = url): FeedRow {
  return { url, title, lastFetchedAt: null }
}

function rssItem(overrides: Partial<RssItem> & { id: string }): RssItem {
  return {
    feedUrl: 'feed',
    feedTitle: 'Feed',
    title: 'Article',
    url: 'https://example/a',
    summary: null,
    image: null,
    published: null,
    categories: [],
    author: null,
    ...overrides,
  }
}

function articleRow(overrides: Partial<ArticleRow> & { id: string }): ArticleRow {
  return {
    feedUrl: 'feed',
    title: 'Article',
    source: 'Source',
    url: 'https://example/a',
    summary: null,
    image: null,
    published: null,
    categories: [],
    author: null,
    read: 0,
    ...overrides,
  }
}

function fetchResult(
  feedUrl: string,
  items: RssItem[] = [],
  error: string | null = null,
): FetchResult {
  return { feedUrl, feedTitle: error ? null : feedUrl, items, error }
}

/** Scrape에 넣어줄 세계. 테스트가 미리 채워두는 값. */
interface World {
  feeds: FeedRow[]
  fetchResults: FetchResult[]
  knownArticleIds: Set<string>
  unprocessed: ArticleRow[]
  tracks: TrackInput[]
  matchCache: Map<string, CachedVideo>
  searchMatch: (searchQuery: string) => Promise<CachedVideo>
  processedCount: number
}

/** Scrape가 세계에 남긴 자국. 단언은 여기를 본다. */
interface Trace {
  recordedFeeds: Array<{ feedUrl: string; feedTitle: string | null }>
  savedArticles: ArticleRow[]
  extractCalls: number
  searches: string[]
  savedMatches: Map<string, CachedVideo>
  processed: string[][]
  logs: ScrapeLogRecord[]
}

/**
 * in-memory adapter. 실제 SQLite·Gemini·YouTube·로그 파일 자리에 들어가지만
 * Scrape의 결정 로직은 그대로 실행된다 — 이 adapter는 I/O만 대신한다.
 */
function makeWorld(overrides: Partial<World> = {}): { ports: ScrapePorts; trace: Trace } {
  const world: World = {
    feeds: [],
    fetchResults: [],
    knownArticleIds: new Set(),
    unprocessed: [],
    tracks: [],
    matchCache: new Map(),
    searchMatch: async () => ({ videoId: null, videoTitle: null }),
    processedCount: 0,
    ...overrides,
  }

  const trace: Trace = {
    recordedFeeds: [],
    savedArticles: [],
    extractCalls: 0,
    searches: [],
    savedMatches: new Map(),
    processed: [],
    logs: [],
  }

  const ports: ScrapePorts = {
    listFeeds: async () => world.feeds,
    fetchFeeds: async () => world.fetchResults,

    async recordFeed(feedUrl, feedTitle) {
      trace.recordedFeeds.push({ feedUrl, feedTitle })
    },

    findKnownArticleIds: async (ids) => new Set(ids.filter((id) => world.knownArticleIds.has(id))),

    async saveArticles(articles) {
      trace.savedArticles.push(...articles)
    },

    takeUnprocessed: async () => world.unprocessed,

    async extractTracks() {
      trace.extractCalls++
      return world.tracks
    },

    loadMatchCache: async () => world.matchCache,

    async searchMatch(searchQuery) {
      trace.searches.push(searchQuery)
      return world.searchMatch(searchQuery)
    },

    async saveMatch(articleId, searchQuery, match) {
      trace.savedMatches.set(`${articleId}|${searchQuery}`, match)
    },

    async markProcessed(articleIds) {
      trace.processed.push(articleIds)
      return world.processedCount
    },

    async log(record) {
      trace.logs.push(record)
    },
  }

  return { ports, trace }
}

describe('runPipeline — early termination', () => {
  it('throws when no feeds registered', async () => {
    const { ports } = makeWorld({ feeds: [] })
    await expect(drain(runPipeline(ports))).rejects.toThrow(/No feeds registered/)
  })

  it('emits done early when no unprocessed articles', async () => {
    const { ports, trace } = makeWorld({
      feeds: [feedRow('a')],
      fetchResults: [fetchResult('a', [])],
      unprocessed: [],
    })

    const { events, result } = await drain(runPipeline(ports))

    expect(result.tracks).toEqual([])
    expect(result.stats.feeds).toBe(1)
    expect(result.stats.newArticles).toBe(0)
    expect(events.some((e) => e.type === 'stage' && e.stage === 'done')).toBe(true)
    expect(trace.extractCalls).toBe(0)
    expect(trace.searches).toEqual([])
  })
})

describe('runPipeline — happy path', () => {
  it('runs all stages end-to-end and emits correct events', async () => {
    const { ports, trace } = makeWorld({
      feeds: [feedRow('feedA', 'Feed A')],
      fetchResults: [fetchResult('feedA', [rssItem({ id: 'art-1', title: 'New' })])],
      unprocessed: [articleRow({ id: 'art-1' })],
      tracks: [
        {
          articleId: 'art-1',
          searchQuery: 'q-1',
          articleTitle: 'Article',
          source: 'Feed A',
          url: 'https://example/a',
        },
      ],
      searchMatch: async () => ({ videoId: 'v1', videoTitle: 'V1' }),
      processedCount: 1,
    })

    const { events, result } = await drain(runPipeline(ports))

    // tracks
    expect(result.tracks).toEqual([
      {
        articleId: 'art-1',
        searchQuery: 'q-1',
        articleTitle: 'Article',
        source: 'Feed A',
        url: 'https://example/a',
        videoId: 'v1',
        videoTitle: 'V1',
      },
    ])
    expect(result.stats).toMatchObject({
      feeds: 1,
      feedErrors: 0,
      newArticles: 1,
      trackCount: 1,
      cacheHits: 0,
      youtubeApiCalls: 1,
      processed: 1,
    })

    // stage events in order
    const stages = events.filter((e) => e.type === 'stage').map((e) => e.stage)
    expect(stages).toEqual(['feeds', 'fetch', 'gemini', 'youtube', 'mark-processed', 'done'])

    // 세계에 남은 자국
    expect(trace.recordedFeeds).toEqual([{ feedUrl: 'feedA', feedTitle: 'feedA' }])
    expect(trace.savedArticles.map((a) => a.id)).toEqual(['art-1'])
    expect(trace.searches).toEqual(['q-1'])
    expect(trace.savedMatches.get('art-1|q-1')).toEqual({ videoId: 'v1', videoTitle: 'V1' })
    expect(trace.processed).toEqual([['art-1']])
  })
})

describe('runPipeline — error handling', () => {
  it('continues when one feed fetch errors', async () => {
    const { ports } = makeWorld({
      feeds: [feedRow('ok'), feedRow('bad')],
      fetchResults: [
        fetchResult('ok', [rssItem({ id: 'a' })]),
        fetchResult('bad', [], 'fetch failed'),
      ],
      unprocessed: [],
    })

    const { events, result } = await drain(runPipeline(ports))

    expect(result.stats.feedErrors).toBe(1)
    expect(result.stats.newArticles).toBe(1) // ok feed still saved
    expect(events.some((e) => e.type === 'log' && e.message.includes('fetch failed'))).toBe(true)
  })

  it('catches YouTube error per-track and keeps going', async () => {
    const { ports, trace } = makeWorld({
      feeds: [feedRow('f')],
      fetchResults: [fetchResult('f')],
      unprocessed: [articleRow({ id: 'a1' }), articleRow({ id: 'a2' })],
      tracks: [
        { articleId: 'a1', searchQuery: 'q1', articleTitle: 't', source: 's', url: 'u' },
        { articleId: 'a2', searchQuery: 'q2', articleTitle: 't', source: 's', url: 'u' },
      ],
      searchMatch: async (q) => {
        if (q === 'q1') throw new Error('youtube down')
        return { videoId: 'v2', videoTitle: 'V2' }
      },
    })

    const { events, result } = await drain(runPipeline(ports))

    expect(result.tracks).toHaveLength(2)
    expect(result.tracks[0]).toMatchObject({ articleId: 'a1', videoId: null })
    expect(result.tracks[1]).toMatchObject({ articleId: 'a2', videoId: 'v2' })
    expect(result.stats.youtubeApiCalls).toBe(1) // only successful one counted
    expect(events.some((e) => e.type === 'log' && e.message.includes('youtube down'))).toBe(true)
    // 실패한 Track은 Match가 기록되지 않아 다음 Scrape에서 재시도된다
    expect(trace.savedMatches.has('a1|q1')).toBe(false)
    expect(trace.savedMatches.has('a2|q2')).toBe(true)
  })
})

describe('runPipeline — cache and skip behavior', () => {
  it('uses cache and skips YouTube call when cached', async () => {
    const { ports, trace } = makeWorld({
      feeds: [feedRow('f')],
      fetchResults: [fetchResult('f')],
      unprocessed: [articleRow({ id: 'a' })],
      tracks: [{ articleId: 'a', searchQuery: 'q', articleTitle: 't', source: 's', url: 'u' }],
      matchCache: new Map([['a|q', { videoId: 'cached-v', videoTitle: 'Cached' }]]),
    })

    const { result } = await drain(runPipeline(ports))

    expect(result.tracks[0]).toMatchObject({ videoId: 'cached-v', videoTitle: 'Cached' })
    expect(result.stats.cacheHits).toBe(1)
    expect(result.stats.youtubeApiCalls).toBe(0)
    expect(trace.searches).toEqual([])
  })

  it('skips YouTube for tracks with empty searchQuery (non-music)', async () => {
    const { ports, trace } = makeWorld({
      feeds: [feedRow('f')],
      fetchResults: [fetchResult('f')],
      unprocessed: [articleRow({ id: 'a' })],
      tracks: [{ articleId: 'a', searchQuery: '', articleTitle: 't', source: 's', url: 'u' }],
    })

    const { result } = await drain(runPipeline(ports))

    expect(result.tracks[0]).toMatchObject({ videoId: null, videoTitle: null })
    expect(trace.searches).toEqual([])
    expect(result.stats.youtubeApiCalls).toBe(0)
  })

  it('filters out articles already in DB before saveArticles', async () => {
    const { ports, trace } = makeWorld({
      feeds: [feedRow('f')],
      fetchResults: [fetchResult('f', [rssItem({ id: 'existing' }), rssItem({ id: 'new' })])],
      knownArticleIds: new Set(['existing']),
      unprocessed: [],
    })

    const { result } = await drain(runPipeline(ports))

    expect(result.stats.newArticles).toBe(1)
    expect(trace.savedArticles.map((r) => r.id)).toEqual(['new'])
  })
})

describe('runPipeline — scrape log', () => {
  it('records one feed entry per feed, marking the failed one', async () => {
    const { ports, trace } = makeWorld({
      feeds: [feedRow('ok'), feedRow('bad')],
      fetchResults: [
        fetchResult('ok', [rssItem({ id: 'a', published: '2026-01-02T00:00:00.000Z' })]),
        fetchResult('bad', [], 'fetch failed'),
      ],
      unprocessed: [],
    })

    await drain(runPipeline(ports))

    const feedLogs = trace.logs.filter((l) => l.type === 'feed')
    expect(feedLogs).toHaveLength(2)

    const ok = feedLogs.find((l) => l.feedUrl === 'ok')!
    expect(ok).toMatchObject({
      ok: true,
      itemCount: 1,
      newCount: 1,
      newestPublished: '2026-01-02T00:00:00.000Z',
      error: null,
    })

    const bad = feedLogs.find((l) => l.feedUrl === 'bad')!
    expect(bad).toMatchObject({ ok: false, itemCount: 0, newCount: 0, error: 'fetch failed' })
  })

  it('records exactly one run summary carrying the final stats', async () => {
    const { ports, trace } = makeWorld({
      feeds: [feedRow('f')],
      fetchResults: [fetchResult('f', [rssItem({ id: 'a' })])],
      unprocessed: [articleRow({ id: 'a' })],
      tracks: [{ articleId: 'a', searchQuery: 'q', articleTitle: 't', source: 's', url: 'u' }],
      searchMatch: async () => ({ videoId: 'v', videoTitle: 'V' }),
      processedCount: 1,
    })

    const { result } = await drain(runPipeline(ports))

    const runLogs = trace.logs.filter((l) => l.type === 'run')
    expect(runLogs).toHaveLength(1)
    expect(runLogs[0]).toMatchObject({
      feeds: result.stats.feeds,
      feedErrors: result.stats.feedErrors,
      newArticles: result.stats.newArticles,
      processed: result.stats.processed,
      trackCount: result.stats.trackCount,
      cacheHits: result.stats.cacheHits,
      youtubeApiCalls: result.stats.youtubeApiCalls,
    })
    // 모든 로그가 같은 실행에 속한다
    expect(new Set(trace.logs.map((l) => l.runId)).size).toBe(1)
  })
})

describe('runPipeline — type witnesses', () => {
  it('result includes well-typed stats and tracks', async () => {
    const { ports } = makeWorld({
      feeds: [feedRow('f')],
      fetchResults: [fetchResult('f')],
      unprocessed: [],
    })

    const { result } = await drain(runPipeline(ports))

    const _typed: PipelineResult = result
    const _events: PipelineEvent[] = []
    void _typed
    void _events
    expect(result).toBeDefined()
  })
})
