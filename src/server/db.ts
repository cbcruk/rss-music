import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-node'
import * as SqliteDrizzle from '@effect/sql-drizzle/Sqlite'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { join } from 'path'
import { articles, feeds, youtubeCache } from './schema.js'

const DB_PATH = process.env.RSS_DB_PATH ?? join(process.cwd(), 'data', 'cache.db')

const migrate = Effect.gen(function* () {
  const sqlClient = yield* SqlClient.SqlClient

  yield* sqlClient.unsafe(`CREATE TABLE IF NOT EXISTS feeds (
    url TEXT PRIMARY KEY,
    title TEXT,
    last_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  yield* sqlClient.unsafe(`CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    feed_url TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    summary TEXT,
    image TEXT,
    published TEXT,
    categories TEXT NOT NULL DEFAULT '[]',
    author TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  yield* sqlClient.unsafe(`CREATE TABLE IF NOT EXISTS youtube_cache (
    article_id TEXT NOT NULL REFERENCES articles(id),
    search_query TEXT NOT NULL,
    video_id TEXT,
    video_title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (article_id, search_query)
  )`)

  // WAL mode
  yield* sqlClient.unsafe(`PRAGMA journal_mode = WAL`)

  // column migrations
  const articleCols = (yield* sqlClient.unsafe<{ name: string }>(
    `PRAGMA table_info(articles)`,
  )) as ReadonlyArray<{ name: string }>
  const hasCol = (col: string) => articleCols.some((c) => c.name === col)

  if (!hasCol('feed_url')) {
    yield* sqlClient.unsafe(`ALTER TABLE articles ADD COLUMN feed_url TEXT NOT NULL DEFAULT ''`)
  }

  if (!hasCol('read')) {
    if (hasCol('processed')) {
      yield* sqlClient.unsafe(`ALTER TABLE articles RENAME COLUMN processed TO read`)
    } else {
      yield* sqlClient.unsafe(`ALTER TABLE articles ADD COLUMN read INTEGER NOT NULL DEFAULT 0`)
    }
  }

  if (!hasCol('processed')) {
    yield* sqlClient.unsafe(`ALTER TABLE articles ADD COLUMN processed INTEGER NOT NULL DEFAULT 0`)
    yield* sqlClient.unsafe(`UPDATE articles SET processed = 1 WHERE read = 1`)
  }

  if (!hasCol('categories')) {
    yield* sqlClient.unsafe(`ALTER TABLE articles ADD COLUMN categories TEXT NOT NULL DEFAULT '[]'`)
  }

  if (!hasCol('author')) {
    yield* sqlClient.unsafe(`ALTER TABLE articles ADD COLUMN author TEXT`)
  }
})

const DbLive = Layer.effect(
  SqliteDrizzle.SqliteDrizzle,
  Effect.gen(function* () {
    yield* migrate
    return yield* SqliteDrizzle.make()
  }),
).pipe(Layer.provide(SqliteClient.layer({ filename: DB_PATH })))

const runtime = ManagedRuntime.make(DbLive)

export interface FeedRow {
  url: string
  title: string | null
  lastFetchedAt: string | null
}

export interface ArticleRow {
  id: string
  feedUrl: string
  title: string
  source: string
  url: string
  summary: string | null
  image: string | null
  published: string | null
  categories: string[]
  author: string | null
  read: number
}

export interface ArticleWithTracks extends ArticleRow {
  tracks: CachedTrack[]
}

export interface CachedTrack {
  articleId: string
  searchQuery: string
  videoId: string | null
  videoTitle: string | null
}

export interface CachedVideo {
  videoId: string | null
  videoTitle: string | null
}

export type ReadFilter = 'all' | 'unread' | 'read'

function parseCategories(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function listFeeds(): Promise<FeedRow[]> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      return yield* db
        .select({
          url: feeds.url,
          title: feeds.title,
          lastFetchedAt: feeds.lastFetchedAt,
        })
        .from(feeds)
        .orderBy(sql`${feeds.title} COLLATE NOCASE`)
    }),
  )
}

export function upsertFeed(url: string, title: string | null): Promise<void> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      yield* db
        .insert(feeds)
        .values({ url, title })
        .onConflictDoUpdate({
          target: feeds.url,
          set: { title: sql`COALESCE(excluded.title, ${feeds.title})` },
        })
    }),
  )
}

export function removeFeed(url: string): Promise<number> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const before = yield* db
        .select({ count: sql<number>`COUNT(*)` })
        .from(feeds)
        .where(eq(feeds.url, url))
      yield* db.delete(feeds).where(eq(feeds.url, url))
      return before[0]?.count ?? 0
    }),
  )
}

export function touchFeed(url: string): Promise<void> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      yield* db
        .update(feeds)
        .set({ lastFetchedAt: sql`datetime('now')` })
        .where(eq(feeds.url, url))
    }),
  )
}

export function hasArticle(id: string): Promise<boolean> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const rows = (yield* db
        .select({ x: sql`1` })
        .from(articles)
        .where(eq(articles.id, id))
        .limit(1)) as unknown[]
      return rows.length > 0
    }),
  )
}

export function getExistingArticleIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return Promise.resolve(new Set())
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const rows = yield* db
        .select({ id: articles.id })
        .from(articles)
        .where(inArray(articles.id, ids))
      return new Set(rows.map((r) => r.id))
    }),
  )
}

export function saveArticles(rows: ArticleRow[]): Promise<void> {
  if (rows.length === 0) return Promise.resolve()
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const values = rows.map((a) => ({
        id: a.id,
        feedUrl: a.feedUrl,
        title: a.title,
        source: a.source,
        url: a.url,
        summary: a.summary,
        image: a.image,
        published: a.published,
        categories: JSON.stringify(a.categories),
        author: a.author,
        read: a.read,
      }))
      yield* db.insert(articles).values(values).onConflictDoNothing()
    }),
  )
}

export function getUnreadArticles(): Promise<ArticleRow[]> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const rows = yield* db
        .select({
          id: articles.id,
          feedUrl: articles.feedUrl,
          title: articles.title,
          source: articles.source,
          url: articles.url,
          summary: articles.summary,
          image: articles.image,
          published: articles.published,
          categories: articles.categories,
          author: articles.author,
          read: articles.read,
        })
        .from(articles)
        .where(eq(articles.read, 0))
        .orderBy(desc(articles.published), desc(articles.createdAt))
      return rows.map((r) => ({ ...r, categories: parseCategories(r.categories) }))
    }),
  )
}

export function markArticlesRead(ids: string[]): Promise<number> {
  if (ids.length === 0) return Promise.resolve(0)
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const before = yield* db
        .select({ count: sql<number>`COUNT(*)` })
        .from(articles)
        .where(and(inArray(articles.id, ids), eq(articles.read, 0)))
      yield* db.update(articles).set({ read: 1 }).where(inArray(articles.id, ids))
      return before[0]?.count ?? 0
    }),
  )
}

export function markAllRead(): Promise<number> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const before = yield* db
        .select({ count: sql<number>`COUNT(*)` })
        .from(articles)
        .where(eq(articles.read, 0))
      yield* db.update(articles).set({ read: 1 }).where(eq(articles.read, 0))
      return before[0]?.count ?? 0
    }),
  )
}

export function getUnprocessedArticles(): Promise<ArticleRow[]> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const rows = yield* db
        .select({
          id: articles.id,
          feedUrl: articles.feedUrl,
          title: articles.title,
          source: articles.source,
          url: articles.url,
          summary: articles.summary,
          image: articles.image,
          published: articles.published,
          categories: articles.categories,
          author: articles.author,
          read: articles.read,
        })
        .from(articles)
        .where(eq(articles.processed, 0))
        .orderBy(desc(articles.published), desc(articles.createdAt))
      return rows.map((r) => ({ ...r, categories: parseCategories(r.categories) }))
    }),
  )
}

export function markArticlesProcessed(ids: string[]): Promise<number> {
  if (ids.length === 0) return Promise.resolve(0)
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const before = yield* db
        .select({ count: sql<number>`COUNT(*)` })
        .from(articles)
        .where(and(inArray(articles.id, ids), eq(articles.processed, 0)))
      yield* db.update(articles).set({ processed: 1 }).where(inArray(articles.id, ids))
      return before[0]?.count ?? 0
    }),
  )
}

interface GetRecentArticlesOptions {
  limit?: number
  offset?: number
  readFilter?: ReadFilter
}

function readWhere(filter: ReadFilter) {
  if (filter === 'unread') return eq(articles.read, 0)
  if (filter === 'read') return eq(articles.read, 1)
  return undefined
}

export function getRecentArticles(
  opts: GetRecentArticlesOptions = {},
): Promise<ArticleWithTracks[]> {
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0
  const where = readWhere(opts.readFilter ?? 'all')
  const tracksJson = sql<string>`(
    SELECT COALESCE(
      json_group_array(json_object(
        'articleId',   yc.article_id,
        'searchQuery', yc.search_query,
        'videoId',     yc.video_id,
        'videoTitle',  yc.video_title
      )),
      '[]'
    )
    FROM youtube_cache yc
    WHERE yc.article_id = ${articles.id}
  )`

  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const rows = yield* db
        .select({
          id: articles.id,
          feedUrl: articles.feedUrl,
          title: articles.title,
          source: articles.source,
          url: articles.url,
          summary: articles.summary,
          image: articles.image,
          published: articles.published,
          categories: articles.categories,
          author: articles.author,
          read: articles.read,
          tracksJson,
        })
        .from(articles)
        .where(where)
        .orderBy(desc(sql`COALESCE(${articles.published}, ${articles.createdAt})`))
        .limit(limit)
        .offset(offset)
      return rows.map((r) => ({
        id: r.id,
        feedUrl: r.feedUrl,
        title: r.title,
        source: r.source,
        url: r.url,
        summary: r.summary,
        image: r.image,
        published: r.published,
        categories: parseCategories(r.categories),
        author: r.author,
        read: r.read,
        tracks: JSON.parse(r.tracksJson) as CachedTrack[],
      }))
    }),
  )
}

export function getArticleCount(readFilter: ReadFilter = 'all'): Promise<number> {
  const where = readWhere(readFilter)
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const rows = yield* db
        .select({ count: sql<number>`COUNT(*)` })
        .from(articles)
        .where(where)
      return rows[0]?.count ?? 0
    }),
  )
}

/** Bulk-fetch cached videos for the given articleIds, keyed by `${articleId}|${searchQuery}` for O(1) lookup. */
export function getTrackCache(articleIds: string[]): Promise<Map<string, CachedVideo>> {
  if (articleIds.length === 0) return Promise.resolve(new Map())
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      const rows = yield* db
        .select({
          articleId: youtubeCache.articleId,
          searchQuery: youtubeCache.searchQuery,
          videoId: youtubeCache.videoId,
          videoTitle: youtubeCache.videoTitle,
        })
        .from(youtubeCache)
        .where(inArray(youtubeCache.articleId, articleIds))
      const map = new Map<string, CachedVideo>()
      for (const r of rows) {
        map.set(`${r.articleId}|${r.searchQuery}`, {
          videoId: r.videoId,
          videoTitle: r.videoTitle,
        })
      }
      return map
    }),
  )
}

export function cacheVideo(
  articleId: string,
  searchQuery: string,
  videoId: string | null,
  videoTitle: string | null,
): Promise<void> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      yield* db
        .insert(youtubeCache)
        .values({ articleId, searchQuery, videoId, videoTitle })
        .onConflictDoUpdate({
          target: [youtubeCache.articleId, youtubeCache.searchQuery],
          set: { videoId, videoTitle },
        })
    }),
  )
}

/** @internal — 테스트 전용. production 호출 금지. */
export function __truncateAllForTesting(): Promise<void> {
  return runtime.runPromise(
    Effect.gen(function* () {
      const db = yield* SqliteDrizzle.SqliteDrizzle
      yield* db.delete(youtubeCache)
      yield* db.delete(articles)
      yield* db.delete(feeds)
    }),
  )
}
