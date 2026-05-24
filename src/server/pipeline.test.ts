import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./db.js', () => ({
  listFeeds: vi.fn(),
  upsertFeed: vi.fn(),
  touchFeed: vi.fn(),
  getExistingArticleIds: vi.fn(),
  saveArticles: vi.fn(),
  getUnprocessedArticles: vi.fn(),
  getTrackCache: vi.fn(),
  cacheVideo: vi.fn(),
  markArticlesProcessed: vi.fn(),
}))

vi.mock('./gemini.js', () => ({
  generateTracks: vi.fn(),
}))

vi.mock('./rss.js', () => ({
  fetchFeeds: vi.fn(),
}))

vi.mock('./youtube.js', () => ({
  searchYouTube: vi.fn(),
}))

import {
  cacheVideo,
  getExistingArticleIds,
  getTrackCache,
  getUnprocessedArticles,
  listFeeds,
  markArticlesProcessed,
  saveArticles,
  touchFeed,
  upsertFeed,
  type ArticleRow,
  type FeedRow,
} from './db.js'
import { generateTracks } from './gemini.js'
import { fetchFeeds, type FetchResult, type RssItem } from './rss.js'
import { runPipeline, type PipelineEvent, type PipelineResult } from './pipeline'
import { searchYouTube } from './youtube.js'

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

beforeEach(() => {
  vi.resetAllMocks()
  // sane defaults — tests override per-case
  vi.mocked(upsertFeed).mockResolvedValue(undefined)
  vi.mocked(touchFeed).mockResolvedValue(undefined)
  vi.mocked(saveArticles).mockResolvedValue(undefined)
  vi.mocked(cacheVideo).mockResolvedValue(undefined)
  vi.mocked(getExistingArticleIds).mockResolvedValue(new Set())
  vi.mocked(getTrackCache).mockResolvedValue(new Map())
  vi.mocked(markArticlesProcessed).mockResolvedValue(0)
})

describe('runPipeline — early termination', () => {
  it('throws when no feeds registered', async () => {
    vi.mocked(listFeeds).mockResolvedValue([])
    await expect(drain(runPipeline())).rejects.toThrow(/No feeds registered/)
  })

  it('emits done early when no unprocessed articles', async () => {
    vi.mocked(listFeeds).mockResolvedValue([feedRow('a')])
    vi.mocked(fetchFeeds).mockResolvedValue([fetchResult('a', [])])
    vi.mocked(getUnprocessedArticles).mockResolvedValue([])

    const { events, result } = await drain(runPipeline())

    expect(result.tracks).toEqual([])
    expect(result.stats.feeds).toBe(1)
    expect(result.stats.newArticles).toBe(0)
    expect(events.some((e) => e.type === 'stage' && e.stage === 'done')).toBe(true)
    expect(generateTracks).not.toHaveBeenCalled()
    expect(searchYouTube).not.toHaveBeenCalled()
  })
})

describe('runPipeline — happy path', () => {
  it('runs all stages end-to-end and emits correct events', async () => {
    vi.mocked(listFeeds).mockResolvedValue([feedRow('feedA', 'Feed A')])
    vi.mocked(fetchFeeds).mockResolvedValue([
      fetchResult('feedA', [rssItem({ id: 'art-1', title: 'New' })]),
    ])
    vi.mocked(getUnprocessedArticles).mockResolvedValue([articleRow({ id: 'art-1' })])
    vi.mocked(generateTracks).mockResolvedValue([
      {
        articleId: 'art-1',
        searchQuery: 'q-1',
        articleTitle: 'Article',
        source: 'Feed A',
        url: 'https://example/a',
      },
    ])
    vi.mocked(searchYouTube).mockResolvedValue({ videoId: 'v1', videoTitle: 'V1' })
    vi.mocked(markArticlesProcessed).mockResolvedValue(1)

    const { events, result } = await drain(runPipeline())

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

    // saveArticles called with new article
    expect(saveArticles).toHaveBeenCalledOnce()
    expect(searchYouTube).toHaveBeenCalledWith('q-1')
    expect(cacheVideo).toHaveBeenCalledWith('art-1', 'q-1', 'v1', 'V1')
    expect(markArticlesProcessed).toHaveBeenCalledWith(['art-1'])
  })
})

describe('runPipeline — error handling', () => {
  it('continues when one feed fetch errors', async () => {
    vi.mocked(listFeeds).mockResolvedValue([feedRow('ok'), feedRow('bad')])
    vi.mocked(fetchFeeds).mockResolvedValue([
      fetchResult('ok', [rssItem({ id: 'a' })]),
      fetchResult('bad', [], 'fetch failed'),
    ])
    vi.mocked(getUnprocessedArticles).mockResolvedValue([])

    const { events, result } = await drain(runPipeline())

    expect(result.stats.feedErrors).toBe(1)
    expect(result.stats.newArticles).toBe(1) // ok feed still saved
    expect(events.some((e) => e.type === 'log' && e.message.includes('fetch failed'))).toBe(true)
  })

  it('catches YouTube error per-track and keeps going', async () => {
    vi.mocked(listFeeds).mockResolvedValue([feedRow('f')])
    vi.mocked(fetchFeeds).mockResolvedValue([fetchResult('f')])
    vi.mocked(getUnprocessedArticles).mockResolvedValue([
      articleRow({ id: 'a1' }),
      articleRow({ id: 'a2' }),
    ])
    vi.mocked(generateTracks).mockResolvedValue([
      {
        articleId: 'a1',
        searchQuery: 'q1',
        articleTitle: 't',
        source: 's',
        url: 'u',
      },
      {
        articleId: 'a2',
        searchQuery: 'q2',
        articleTitle: 't',
        source: 's',
        url: 'u',
      },
    ])
    vi.mocked(searchYouTube)
      .mockRejectedValueOnce(new Error('youtube down'))
      .mockResolvedValueOnce({ videoId: 'v2', videoTitle: 'V2' })

    const { events, result } = await drain(runPipeline())

    expect(result.tracks).toHaveLength(2)
    expect(result.tracks[0]).toMatchObject({ articleId: 'a1', videoId: null })
    expect(result.tracks[1]).toMatchObject({ articleId: 'a2', videoId: 'v2' })
    expect(result.stats.youtubeApiCalls).toBe(1) // only successful one counted
    expect(events.some((e) => e.type === 'log' && e.message.includes('youtube down'))).toBe(true)
  })
})

describe('runPipeline — cache and skip behavior', () => {
  it('uses cache and skips YouTube call when cached', async () => {
    vi.mocked(listFeeds).mockResolvedValue([feedRow('f')])
    vi.mocked(fetchFeeds).mockResolvedValue([fetchResult('f')])
    vi.mocked(getUnprocessedArticles).mockResolvedValue([articleRow({ id: 'a' })])
    vi.mocked(generateTracks).mockResolvedValue([
      { articleId: 'a', searchQuery: 'q', articleTitle: 't', source: 's', url: 'u' },
    ])
    vi.mocked(getTrackCache).mockResolvedValue(
      new Map([['a|q', { videoId: 'cached-v', videoTitle: 'Cached' }]]),
    )

    const { result } = await drain(runPipeline())

    expect(result.tracks[0]).toMatchObject({ videoId: 'cached-v', videoTitle: 'Cached' })
    expect(result.stats.cacheHits).toBe(1)
    expect(result.stats.youtubeApiCalls).toBe(0)
    expect(searchYouTube).not.toHaveBeenCalled()
  })

  it('skips YouTube for tracks with empty searchQuery (non-music)', async () => {
    vi.mocked(listFeeds).mockResolvedValue([feedRow('f')])
    vi.mocked(fetchFeeds).mockResolvedValue([fetchResult('f')])
    vi.mocked(getUnprocessedArticles).mockResolvedValue([articleRow({ id: 'a' })])
    vi.mocked(generateTracks).mockResolvedValue([
      { articleId: 'a', searchQuery: '', articleTitle: 't', source: 's', url: 'u' },
    ])

    const { result } = await drain(runPipeline())

    expect(result.tracks[0]).toMatchObject({ videoId: null, videoTitle: null })
    expect(searchYouTube).not.toHaveBeenCalled()
    expect(result.stats.youtubeApiCalls).toBe(0)
  })

  it('filters out articles already in DB before saveArticles', async () => {
    vi.mocked(listFeeds).mockResolvedValue([feedRow('f')])
    vi.mocked(fetchFeeds).mockResolvedValue([
      fetchResult('f', [rssItem({ id: 'existing' }), rssItem({ id: 'new' })]),
    ])
    vi.mocked(getExistingArticleIds).mockResolvedValue(new Set(['existing']))
    vi.mocked(getUnprocessedArticles).mockResolvedValue([])

    const { result } = await drain(runPipeline())

    expect(result.stats.newArticles).toBe(1)
    expect(saveArticles).toHaveBeenCalledOnce()
    const savedRows = vi.mocked(saveArticles).mock.calls[0][0]
    expect(savedRows.map((r) => r.id)).toEqual(['new'])
  })
})

describe('runPipeline — type witnesses', () => {
  it('result includes well-typed stats and tracks', async () => {
    vi.mocked(listFeeds).mockResolvedValue([feedRow('f')])
    vi.mocked(fetchFeeds).mockResolvedValue([fetchResult('f')])
    vi.mocked(getUnprocessedArticles).mockResolvedValue([])

    const { result } = await drain(runPipeline())

    const _typed: PipelineResult = result
    const _events: PipelineEvent[] = []
    void _typed
    void _events
    expect(result).toBeDefined()
  })
})
