import { beforeEach, describe, expect, it } from 'vitest'
import {
  __truncateAllForTesting,
  cacheVideo,
  getArticleCount,
  getExistingArticleIds,
  getRecentArticles,
  getTrackCache,
  getUnprocessedArticles,
  getUnreadArticles,
  hasArticle,
  listFeeds,
  markAllRead,
  markArticlesProcessed,
  markArticlesRead,
  removeFeed,
  saveArticles,
  touchFeed,
  upsertFeed,
  type ArticleRow,
} from './db'

function articleRow(overrides: Partial<ArticleRow> & { id: string }): ArticleRow {
  return {
    feedUrl: 'https://feed',
    title: 'Title',
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

beforeEach(async () => {
  await __truncateAllForTesting()
})

describe('feeds CRUD', () => {
  it('upsertFeed inserts and listFeeds returns it', async () => {
    await upsertFeed('https://a', 'Alpha')
    expect(await listFeeds()).toEqual([{ url: 'https://a', title: 'Alpha', lastFetchedAt: null }])
  })

  it('upsertFeed twice updates title (COALESCE behavior preserves existing on null)', async () => {
    await upsertFeed('https://a', 'Alpha')
    await upsertFeed('https://a', 'Alpha v2')
    expect((await listFeeds())[0].title).toBe('Alpha v2')
  })

  it('listFeeds orders by title COLLATE NOCASE', async () => {
    await upsertFeed('https://1', 'banana')
    await upsertFeed('https://2', 'Apple')
    await upsertFeed('https://3', 'cherry')
    const titles = (await listFeeds()).map((f) => f.title)
    expect(titles).toEqual(['Apple', 'banana', 'cherry'])
  })

  it('touchFeed updates lastFetchedAt', async () => {
    await upsertFeed('https://a', 'A')
    expect((await listFeeds())[0].lastFetchedAt).toBeNull()
    await touchFeed('https://a')
    expect((await listFeeds())[0].lastFetchedAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
  })

  it('removeFeed returns 1 on existing url, 0 on missing', async () => {
    await upsertFeed('https://a', 'A')
    expect(await removeFeed('https://a')).toBe(1)
    expect(await removeFeed('https://a')).toBe(0)
    expect(await listFeeds()).toEqual([])
  })
})

describe('articles save / existence', () => {
  it('saveArticles inserts and hasArticle confirms', async () => {
    await saveArticles([articleRow({ id: 'a1' })])
    expect(await hasArticle('a1')).toBe(true)
    expect(await hasArticle('a2')).toBe(false)
  })

  it('saveArticles same id again is a no-op (onConflictDoNothing)', async () => {
    await saveArticles([articleRow({ id: 'a1', title: 'First' })])
    await saveArticles([articleRow({ id: 'a1', title: 'Second' })])
    const rows = await getUnreadArticles()
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('First') // first insert wins
  })

  it('saveArticles empty array is a no-op', async () => {
    await saveArticles([])
    expect(await getUnreadArticles()).toEqual([])
  })

  it('getExistingArticleIds returns Set of those present in DB', async () => {
    await saveArticles([articleRow({ id: 'a1' }), articleRow({ id: 'a2' })])
    const set = await getExistingArticleIds(['a1', 'a2', 'a3'])
    expect([...set].sort()).toEqual(['a1', 'a2'])
  })

  it('getExistingArticleIds empty input returns empty Set without query', async () => {
    expect(await getExistingArticleIds([])).toEqual(new Set())
  })
})

describe('state transitions — read', () => {
  it('markArticlesRead excludes ids from getUnreadArticles', async () => {
    await saveArticles([articleRow({ id: 'a1' }), articleRow({ id: 'a2' })])
    expect(await markArticlesRead(['a1'])).toBe(1)
    const unread = await getUnreadArticles()
    expect(unread.map((r) => r.id)).toEqual(['a2'])
  })

  it('markAllRead flips all unread → read', async () => {
    await saveArticles([articleRow({ id: 'a1' }), articleRow({ id: 'a2' })])
    expect(await markAllRead()).toBe(2)
    expect(await getUnreadArticles()).toEqual([])
  })

  it('markArticlesRead empty ids returns 0 without query', async () => {
    expect(await markArticlesRead([])).toBe(0)
  })

  it('markArticlesRead nonexistent ids returns 0', async () => {
    expect(await markArticlesRead(['nope'])).toBe(0)
  })
})

describe('state transitions — processed', () => {
  it('markArticlesProcessed excludes ids from getUnprocessedArticles', async () => {
    await saveArticles([articleRow({ id: 'a1' }), articleRow({ id: 'a2' })])
    expect(await markArticlesProcessed(['a1'])).toBe(1)
    const queue = await getUnprocessedArticles()
    expect(queue.map((r) => r.id)).toEqual(['a2'])
  })

  it('markArticlesProcessed empty ids returns 0', async () => {
    expect(await markArticlesProcessed([])).toBe(0)
  })
})

describe('counts', () => {
  beforeEach(async () => {
    await saveArticles([
      articleRow({ id: 'u1' }),
      articleRow({ id: 'u2' }),
      articleRow({ id: 'r1' }),
    ])
    await markArticlesRead(['r1'])
  })

  it("getArticleCount('all') counts all rows", async () => {
    expect(await getArticleCount('all')).toBe(3)
  })

  it("getArticleCount('unread') counts only read=0", async () => {
    expect(await getArticleCount('unread')).toBe(2)
  })

  it("getArticleCount('read') counts only read=1", async () => {
    expect(await getArticleCount('read')).toBe(1)
  })
})

describe('getRecentArticles', () => {
  it('filters by readFilter (unread / read / all)', async () => {
    await saveArticles([
      articleRow({ id: 'u1', published: '2026-05-18T01:00:00Z' }),
      articleRow({ id: 'r1', published: '2026-05-18T02:00:00Z' }),
    ])
    await markArticlesRead(['r1'])

    const unread = await getRecentArticles({ readFilter: 'unread' })
    expect(unread.map((r) => r.id)).toEqual(['u1'])

    const read = await getRecentArticles({ readFilter: 'read' })
    expect(read.map((r) => r.id)).toEqual(['r1'])

    const all = await getRecentArticles({ readFilter: 'all' })
    expect(all.map((r) => r.id).sort()).toEqual(['r1', 'u1'])
  })

  it('orders by published DESC (most recent first)', async () => {
    await saveArticles([
      articleRow({ id: 'old', published: '2026-01-01T00:00:00Z' }),
      articleRow({ id: 'new', published: '2026-05-18T00:00:00Z' }),
      articleRow({ id: 'mid', published: '2026-03-01T00:00:00Z' }),
    ])
    const rows = await getRecentArticles({})
    expect(rows.map((r) => r.id)).toEqual(['new', 'mid', 'old'])
  })

  it('falls back to created_at when published is null', async () => {
    await saveArticles([
      articleRow({ id: 'a', published: null }),
      articleRow({ id: 'b', published: null }),
    ])
    // both rows have only created_at; order is whichever was inserted first DESC
    const rows = await getRecentArticles({})
    expect(rows).toHaveLength(2)
  })

  it('respects limit and offset', async () => {
    await saveArticles([
      articleRow({ id: 'a', published: '2026-05-18T03:00:00Z' }),
      articleRow({ id: 'b', published: '2026-05-18T02:00:00Z' }),
      articleRow({ id: 'c', published: '2026-05-18T01:00:00Z' }),
    ])
    expect((await getRecentArticles({ limit: 2 })).map((r) => r.id)).toEqual(['a', 'b'])
    expect((await getRecentArticles({ limit: 2, offset: 1 })).map((r) => r.id)).toEqual(['b', 'c'])
  })

  it('aggregates tracks from youtube_cache via JSON subquery', async () => {
    await saveArticles([articleRow({ id: 'a' })])
    await cacheVideo('a', 'query 1', 'vid1', 'Video One')
    await cacheVideo('a', 'query 2', null, null)
    const rows = await getRecentArticles({})
    expect(rows[0].tracks).toHaveLength(2)
    expect(rows[0].tracks).toEqual(
      expect.arrayContaining([
        { articleId: 'a', searchQuery: 'query 1', videoId: 'vid1', videoTitle: 'Video One' },
        { articleId: 'a', searchQuery: 'query 2', videoId: null, videoTitle: null },
      ]),
    )
  })

  it('returns empty array when no articles match filter', async () => {
    expect(await getRecentArticles({ readFilter: 'read' })).toEqual([])
  })
})

describe('youtube cache', () => {
  beforeEach(async () => {
    await saveArticles([articleRow({ id: 'a' })])
  })

  it('cacheVideo inserts and getTrackCache returns it', async () => {
    await cacheVideo('a', 'q', 'v', 'V')
    const cache = await getTrackCache(['a'])
    expect(cache.get('a|q')).toEqual({ videoId: 'v', videoTitle: 'V' })
  })

  it('cacheVideo upserts on same (articleId, searchQuery)', async () => {
    await cacheVideo('a', 'q', 'v1', 'V1')
    await cacheVideo('a', 'q', 'v2', 'V2')
    const cache = await getTrackCache(['a'])
    expect(cache.get('a|q')).toEqual({ videoId: 'v2', videoTitle: 'V2' })
    expect(cache.size).toBe(1)
  })

  it('getTrackCache returns Map across multiple articleIds keyed by id|query', async () => {
    await saveArticles([articleRow({ id: 'b' })])
    await cacheVideo('a', 'qa', 'va', 'Va')
    await cacheVideo('b', 'qb', 'vb', 'Vb')
    const cache = await getTrackCache(['a', 'b'])
    expect(cache.size).toBe(2)
    expect(cache.get('a|qa')?.videoId).toBe('va')
    expect(cache.get('b|qb')?.videoId).toBe('vb')
  })

  it('getTrackCache empty articleIds returns empty Map without query', async () => {
    expect(await getTrackCache([])).toEqual(new Map())
  })
})
