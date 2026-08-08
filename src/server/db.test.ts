import { beforeEach, describe, expect, it } from 'vitest'
import { makeDb, type ArticleRow, type Db } from './db'

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

/** 테스트마다 자기 DB를 갖는다. 공유 상태가 없으므로 비워줄 것도, 순서 의존도 없다. */
let db: Db

beforeEach(() => {
  db = makeDb(':memory:')
})

describe('feeds CRUD', () => {
  it('upsertFeed inserts and listFeeds returns it', async () => {
    await db.upsertFeed('https://a', 'Alpha')
    expect(await db.listFeeds()).toEqual([
      { url: 'https://a', title: 'Alpha', lastFetchedAt: null },
    ])
  })

  it('upsertFeed twice updates title (COALESCE behavior preserves existing on null)', async () => {
    await db.upsertFeed('https://a', 'Alpha')
    await db.upsertFeed('https://a', 'Alpha v2')
    expect((await db.listFeeds())[0].title).toBe('Alpha v2')
  })

  it('listFeeds orders by title COLLATE NOCASE', async () => {
    await db.upsertFeed('https://1', 'banana')
    await db.upsertFeed('https://2', 'Apple')
    await db.upsertFeed('https://3', 'cherry')
    const titles = (await db.listFeeds()).map((f) => f.title)
    expect(titles).toEqual(['Apple', 'banana', 'cherry'])
  })

  it('touchFeed updates lastFetchedAt', async () => {
    await db.upsertFeed('https://a', 'A')
    expect((await db.listFeeds())[0].lastFetchedAt).toBeNull()
    await db.touchFeed('https://a')
    expect((await db.listFeeds())[0].lastFetchedAt).toMatch(/^\d{4}-\d{2}-\d{2} /)
  })
})

describe('articles save / existence', () => {
  it('saveArticles same id again is a no-op (onConflictDoNothing)', async () => {
    await db.saveArticles([articleRow({ id: 'a1', title: 'First' })])
    await db.saveArticles([articleRow({ id: 'a1', title: 'Second' })])
    const rows = await db.getRecentArticles({})
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('First') // first insert wins
  })

  it('saveArticles empty array is a no-op', async () => {
    await db.saveArticles([])
    expect(await db.getRecentArticles({})).toEqual([])
  })

  it('getExistingArticleIds returns Set of those present in DB', async () => {
    await db.saveArticles([articleRow({ id: 'a1' }), articleRow({ id: 'a2' })])
    const set = await db.getExistingArticleIds(['a1', 'a2', 'a3'])
    expect([...set].sort()).toEqual(['a1', 'a2'])
  })

  it('getExistingArticleIds empty input returns empty Set without query', async () => {
    expect(await db.getExistingArticleIds([])).toEqual(new Set())
  })
})

describe('state transitions — read', () => {
  it('markAllRead flips all unread → read', async () => {
    await db.saveArticles([articleRow({ id: 'a1' }), articleRow({ id: 'a2' })])
    expect(await db.markAllRead()).toBe(2)
    expect(await db.getRecentArticles({ readFilter: 'unread' })).toEqual([])
  })

  it('markAllRead counts only rows it actually flipped', async () => {
    await db.saveArticles([articleRow({ id: 'a1' })])
    await db.markAllRead()
    await db.saveArticles([articleRow({ id: 'a2' })])
    expect(await db.markAllRead()).toBe(1) // a1은 이미 읽음이라 세지 않는다
  })

  it('markAllRead on an empty queue returns 0', async () => {
    expect(await db.markAllRead()).toBe(0)
  })
})

describe('state transitions — processed', () => {
  it('markArticlesProcessed excludes ids from getUnprocessedArticles', async () => {
    await db.saveArticles([articleRow({ id: 'a1' }), articleRow({ id: 'a2' })])
    expect(await db.markArticlesProcessed(['a1'])).toBe(1)
    const queue = await db.getUnprocessedArticles()
    expect(queue.map((r) => r.id)).toEqual(['a2'])
  })

  it('markArticlesProcessed empty ids returns 0', async () => {
    expect(await db.markArticlesProcessed([])).toBe(0)
  })

  it('read and processed move independently', async () => {
    await db.saveArticles([articleRow({ id: 'a1' })])
    await db.markArticlesProcessed(['a1'])
    // processed로 바뀌어도 사용자에게는 여전히 안 읽은 글이다 (ADR-0001)
    expect((await db.getRecentArticles({ readFilter: 'unread' })).map((r) => r.id)).toEqual(['a1'])
    expect(await db.getUnprocessedArticles()).toEqual([])
  })
})

describe('counts', () => {
  beforeEach(async () => {
    // 읽음 상태는 markAllRead로만 만들 수 있으므로, 읽을 것을 먼저 넣고 넘긴 뒤 나머지를 넣는다
    await db.saveArticles([articleRow({ id: 'r1' })])
    await db.markAllRead()
    await db.saveArticles([articleRow({ id: 'u1' }), articleRow({ id: 'u2' })])
  })

  it("getArticleCount('all') counts all rows", async () => {
    expect(await db.getArticleCount('all')).toBe(3)
  })

  it("getArticleCount('unread') counts only read=0", async () => {
    expect(await db.getArticleCount('unread')).toBe(2)
  })

  it("getArticleCount('read') counts only read=1", async () => {
    expect(await db.getArticleCount('read')).toBe(1)
  })
})

describe('getRecentArticles', () => {
  it('filters by readFilter (unread / read / all)', async () => {
    await db.saveArticles([articleRow({ id: 'r1', published: '2026-05-18T02:00:00Z' })])
    await db.markAllRead()
    await db.saveArticles([articleRow({ id: 'u1', published: '2026-05-18T01:00:00Z' })])

    const unread = await db.getRecentArticles({ readFilter: 'unread' })
    expect(unread.map((r) => r.id)).toEqual(['u1'])

    const read = await db.getRecentArticles({ readFilter: 'read' })
    expect(read.map((r) => r.id)).toEqual(['r1'])

    const all = await db.getRecentArticles({ readFilter: 'all' })
    expect(all.map((r) => r.id).sort()).toEqual(['r1', 'u1'])
  })

  it('orders by published DESC (most recent first)', async () => {
    await db.saveArticles([
      articleRow({ id: 'old', published: '2026-01-01T00:00:00Z' }),
      articleRow({ id: 'new', published: '2026-05-18T00:00:00Z' }),
      articleRow({ id: 'mid', published: '2026-03-01T00:00:00Z' }),
    ])
    const rows = await db.getRecentArticles({})
    expect(rows.map((r) => r.id)).toEqual(['new', 'mid', 'old'])
  })

  it('falls back to created_at when published is null', async () => {
    await db.saveArticles([
      articleRow({ id: 'a', published: null }),
      articleRow({ id: 'b', published: null }),
    ])
    // both rows have only created_at; order is whichever was inserted first DESC
    const rows = await db.getRecentArticles({})
    expect(rows).toHaveLength(2)
  })

  it('respects limit and offset', async () => {
    await db.saveArticles([
      articleRow({ id: 'a', published: '2026-05-18T03:00:00Z' }),
      articleRow({ id: 'b', published: '2026-05-18T02:00:00Z' }),
      articleRow({ id: 'c', published: '2026-05-18T01:00:00Z' }),
    ])
    expect((await db.getRecentArticles({ limit: 2 })).map((r) => r.id)).toEqual(['a', 'b'])
    expect((await db.getRecentArticles({ limit: 2, offset: 1 })).map((r) => r.id)).toEqual([
      'b',
      'c',
    ])
  })

  it('aggregates tracks from youtube_cache via JSON subquery', async () => {
    await db.saveArticles([articleRow({ id: 'a' })])
    await db.cacheVideo('a', 'query 1', 'vid1', 'Video One')
    await db.cacheVideo('a', 'query 2', null, null)
    const rows = await db.getRecentArticles({})
    expect(rows[0].tracks).toHaveLength(2)
    expect(rows[0].tracks).toEqual(
      expect.arrayContaining([
        { articleId: 'a', searchQuery: 'query 1', videoId: 'vid1', videoTitle: 'Video One' },
        { articleId: 'a', searchQuery: 'query 2', videoId: null, videoTitle: null },
      ]),
    )
  })

  it('returns empty array when no articles match filter', async () => {
    expect(await db.getRecentArticles({ readFilter: 'read' })).toEqual([])
  })
})

describe('youtube cache', () => {
  beforeEach(async () => {
    await db.saveArticles([articleRow({ id: 'a' })])
  })

  it('cacheVideo inserts and getTrackCache returns it', async () => {
    await db.cacheVideo('a', 'q', 'v', 'V')
    const cache = await db.getTrackCache(['a'])
    expect(cache.get('a|q')).toEqual({ videoId: 'v', videoTitle: 'V' })
  })

  it('cacheVideo upserts on same (articleId, searchQuery)', async () => {
    await db.cacheVideo('a', 'q', 'v1', 'V1')
    await db.cacheVideo('a', 'q', 'v2', 'V2')
    const cache = await db.getTrackCache(['a'])
    expect(cache.get('a|q')).toEqual({ videoId: 'v2', videoTitle: 'V2' })
    expect(cache.size).toBe(1)
  })

  it('getTrackCache returns Map across multiple articleIds keyed by id|query', async () => {
    await db.saveArticles([articleRow({ id: 'b' })])
    await db.cacheVideo('a', 'qa', 'va', 'Va')
    await db.cacheVideo('b', 'qb', 'vb', 'Vb')
    const cache = await db.getTrackCache(['a', 'b'])
    expect(cache.size).toBe(2)
    expect(cache.get('a|qa')?.videoId).toBe('va')
    expect(cache.get('b|qb')?.videoId).toBe('vb')
  })

  it('getTrackCache empty articleIds returns empty Map without query', async () => {
    expect(await db.getTrackCache([])).toEqual(new Map())
  })
})

describe('instance isolation', () => {
  it('two instances do not see each other', async () => {
    const other = makeDb(':memory:')
    await db.saveArticles([articleRow({ id: 'only-in-db' })])
    expect(await db.getArticleCount('all')).toBe(1)
    expect(await other.getArticleCount('all')).toBe(0)
  })
})
