import { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-node'
import * as SqliteDrizzle from '@effect/sql-drizzle/Sqlite'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { Effect, Layer, ManagedRuntime } from 'effect'
import { join } from 'path'
import { articles, feeds, youtubeCache } from './schema.js'

const DEFAULT_DB_PATH = process.env.RSS_DB_PATH ?? join(process.cwd(), 'data', 'cache.db')

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

const dbLayer = (filename: string) =>
  Layer.effect(
    SqliteDrizzle.SqliteDrizzle,
    Effect.gen(function* () {
      yield* migrate
      return yield* SqliteDrizzle.make()
    }),
  ).pipe(Layer.provide(SqliteClient.layer({ filename })))

/** `feeds` 테이블 행 중 앱이 읽는 컬럼. */
export interface FeedRow {
  url: string
  title: string | null
  lastFetchedAt: string | null
}

/**
 * `articles` 테이블 행. `categories`는 DB에 JSON 문자열로 저장되지만 여기서는 파싱된 배열이다.
 * `read`(사용자가 읽음 처리)와 `processed`(파이프라인이 처리 완료)는 별개 개념이라
 * 이 타입에는 사용자 관점의 `read`만 노출한다.
 */
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

/** 기사 + 그 기사에서 뽑힌 트랙들. 목록 화면이 쓰는 형태. */
export interface ArticleWithTracks extends ArticleRow {
  tracks: CachedTrack[]
}

/** `youtube_cache` 테이블 행. 검색어별 YouTube 매칭 결과를 캐싱한다. */
export interface CachedTrack {
  articleId: string
  searchQuery: string
  videoId: string | null
  videoTitle: string | null
}

/** 매칭된 영상 정보. 검색 결과가 없으면 두 필드 모두 `null`. */
export interface CachedVideo {
  videoId: string | null
  videoTitle: string | null
}

/** 기사 목록 조회 시 읽음 상태 필터. */
export type ReadFilter = 'all' | 'unread' | 'read'

/** `ArticleRow`를 만드는 데 필요한 컬럼 전부. 두 조회가 공유하므로 한 곳에서만 바꾼다. */
const ARTICLE_COLUMNS = {
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
}

function parseCategories(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
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

/**
 * 주어진 파일에 묶인 저장소 인스턴스를 만든다. 인스턴스마다 자기 runtime을 가지므로
 * 서로의 상태를 보지 못한다 — 테스트가 `makeDb(':memory:')`로 격리된 DB를 갖는 근거다.
 *
 * 앱은 아래 {@link defaultDb}에서 뽑아낸 이름들을 그대로 쓰면 되고, 이 팩토리를 직접
 * 부를 일은 테스트뿐이다.
 *
 * @param filename SQLite 파일 경로. `':memory:'`면 프로세스 메모리 안에서만 산다
 * @see `docs/adr/0003-db-factory-not-context-tag.md` 다른 외부 의존과 달리 Context.Tag가 아닌 이유
 */
export function makeDb(filename: string) {
  const runtime = ManagedRuntime.make(dbLayer(filename))

  return {
    /** 등록된 피드를 제목 기준(대소문자 무시) 오름차순으로 반환한다. */
    listFeeds(): Promise<FeedRow[]> {
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
    },

    /**
     * 피드를 등록하거나 제목을 갱신한다.
     * @param title `null`이면 기존 제목을 지우지 않고 그대로 둔다.
     */
    upsertFeed(url: string, title: string | null): Promise<void> {
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
    },

    /** 피드의 `lastFetchedAt`을 현재 시각으로 갱신한다. */
    touchFeed(url: string): Promise<void> {
      return runtime.runPromise(
        Effect.gen(function* () {
          const db = yield* SqliteDrizzle.SqliteDrizzle
          yield* db
            .update(feeds)
            .set({ lastFetchedAt: sql`datetime('now')` })
            .where(eq(feeds.url, url))
        }),
      )
    },

    /**
     * 주어진 id 중 이미 저장된 것만 골라낸다. 신규 기사 판별에 쓰는 벌크 조회.
     * @returns 존재하는 id 집합. 입력이 비면 빈 Set
     */
    getExistingArticleIds(ids: string[]): Promise<Set<string>> {
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
    },

    /**
     * 기사를 일괄 저장한다. id가 겹치면 기존 행을 건드리지 않고 건너뛰므로(`ON CONFLICT DO NOTHING`)
     * 이미 읽은 기사가 되살아나지 않는다.
     */
    saveArticles(rows: ArticleRow[]): Promise<void> {
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
    },

    /**
     * 안 읽은 기사를 모두 읽음 처리한다.
     * @returns 이번 호출로 상태가 바뀐 기사 수
     */
    markAllRead(): Promise<number> {
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
    },

    /**
     * 파이프라인이 아직 처리하지 않은(`processed = 0`) 기사를 발행일 최신순으로 반환한다.
     * 사용자 읽음 상태(`read`)와는 무관하다.
     */
    getUnprocessedArticles(): Promise<ArticleRow[]> {
      return runtime.runPromise(
        Effect.gen(function* () {
          const db = yield* SqliteDrizzle.SqliteDrizzle
          const rows = yield* db
            .select(ARTICLE_COLUMNS)
            .from(articles)
            .where(eq(articles.processed, 0))
            .orderBy(desc(articles.published), desc(articles.createdAt))
          return rows.map((r) => ({ ...r, categories: parseCategories(r.categories) }))
        }),
      )
    },

    /**
     * 기사들을 처리 완료로 표시해 다음 실행에서 다시 큐에 들어오지 않게 한다.
     * @returns 이번 호출로 상태가 바뀐 기사 수
     */
    markArticlesProcessed(ids: string[]): Promise<number> {
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
    },

    /**
     * 기사 목록을 트랙까지 한 번에 조회한다(서브쿼리 JSON 집계라 N+1이 없다).
     * 정렬은 발행일, 없으면 수집일 기준 내림차순.
     * @param opts `limit` 기본 100, `offset` 기본 0, `readFilter` 기본 `'all'`
     */
    getRecentArticles(opts: GetRecentArticlesOptions = {}): Promise<ArticleWithTracks[]> {
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
            .select({ ...ARTICLE_COLUMNS, tracksJson })
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
    },

    /** 필터 조건에 맞는 기사 총 개수. 페이지네이션에 쓴다. */
    getArticleCount(readFilter: ReadFilter = 'all'): Promise<number> {
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
    },

    /** Bulk-fetch cached videos for the given articleIds, keyed by `${articleId}|${searchQuery}` for O(1) lookup. */
    getTrackCache(articleIds: string[]): Promise<Map<string, CachedVideo>> {
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
    },

    /**
     * 검색어별 YouTube 매칭 결과를 저장한다. 같은 `(articleId, searchQuery)`면 덮어쓴다.
     * 검색 결과가 없었다는 사실도 `null`로 캐싱해 재조회를 막는다.
     */
    cacheVideo(
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
    },
  }
}

/** {@link makeDb}가 만드는 저장소 인스턴스. */
export type Db = ReturnType<typeof makeDb>

/** `RSS_DB_PATH`(없으면 `data/cache.db`)에 묶인 앱 기본 인스턴스. */
const defaultDb = makeDb(DEFAULT_DB_PATH)

export const {
  listFeeds,
  upsertFeed,
  touchFeed,
  getExistingArticleIds,
  saveArticles,
  markAllRead,
  getUnprocessedArticles,
  markArticlesProcessed,
  getRecentArticles,
  getArticleCount,
  getTrackCache,
  cacheVideo,
} = defaultDb
