import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', 'data', 'cache.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS feeds (
    url TEXT PRIMARY KEY,
    title TEXT,
    last_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    feed_url TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    summary TEXT,
    image TEXT,
    published TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS youtube_cache (
    article_id TEXT NOT NULL REFERENCES articles(id),
    search_query TEXT NOT NULL,
    video_id TEXT,
    video_title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (article_id, search_query)
  );
`)

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string
  }[]
  return cols.some((c) => c.name === column)
}

if (!columnExists('articles', 'feed_url')) {
  db.exec(`ALTER TABLE articles ADD COLUMN feed_url TEXT NOT NULL DEFAULT ''`)
}

if (!columnExists('articles', 'read')) {
  if (columnExists('articles', 'processed')) {
    db.exec(`ALTER TABLE articles RENAME COLUMN processed TO read`)
  } else {
    db.exec(`ALTER TABLE articles ADD COLUMN read INTEGER NOT NULL DEFAULT 0`)
  }
}

// `processed` is the pipeline-side marker (gemini + youtube done). Distinct from `read` which is user-driven.
// Backfill: legacy rows marked read=1 were necessarily processed by the old pipeline that read=1 implied success.
if (!columnExists('articles', 'processed')) {
  db.exec(`ALTER TABLE articles ADD COLUMN processed INTEGER NOT NULL DEFAULT 0`)
  db.exec(`UPDATE articles SET processed = 1 WHERE read = 1`)
}

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
  read: number
}

export interface ArticleWithTracks extends ArticleRow {
  tracks: CachedTrack[]
}

interface ArticleRowSql {
  id: string
  feed_url: string
  title: string
  source: string
  url: string
  summary: string | null
  image: string | null
  published: string | null
  read: number
}

function mapArticleRow(r: ArticleRowSql): ArticleRow {
  return {
    id: r.id,
    feedUrl: r.feed_url,
    title: r.title,
    source: r.source,
    url: r.url,
    summary: r.summary,
    image: r.image,
    published: r.published,
    read: r.read,
  }
}

export function listFeeds(): FeedRow[] {
  const rows = db
    .prepare('SELECT url, title, last_fetched_at FROM feeds ORDER BY title COLLATE NOCASE')
    .all() as { url: string; title: string | null; last_fetched_at: string | null }[]
  return rows.map((r) => ({
    url: r.url,
    title: r.title,
    lastFetchedAt: r.last_fetched_at,
  }))
}

export function upsertFeed(url: string, title: string | null): void {
  db.prepare(
    `INSERT INTO feeds (url, title) VALUES (?, ?)
     ON CONFLICT(url) DO UPDATE SET title = COALESCE(excluded.title, feeds.title)`,
  ).run(url, title)
}

export function removeFeed(url: string): number {
  const result = db.prepare('DELETE FROM feeds WHERE url = ?').run(url)
  return result.changes
}

export function touchFeed(url: string): void {
  db.prepare("UPDATE feeds SET last_fetched_at = datetime('now') WHERE url = ?").run(url)
}

export function hasArticle(id: string): boolean {
  const row = db.prepare('SELECT 1 FROM articles WHERE id = ?').get(id)
  return !!row
}

export function saveArticles(articles: ArticleRow[]): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO articles (id, feed_url, title, source, url, summary, image, published, read)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const tx = db.transaction((items: ArticleRow[]) => {
    for (const a of items) {
      insert.run(a.id, a.feedUrl, a.title, a.source, a.url, a.summary, a.image, a.published, a.read)
    }
  })
  tx(articles)
}

export function getUnreadArticles(): ArticleRow[] {
  const rows = db
    .prepare(
      `SELECT id, feed_url, title, source, url, summary, image, published, read
       FROM articles WHERE read = 0 ORDER BY published DESC, created_at DESC`,
    )
    .all() as ArticleRowSql[]
  return rows.map(mapArticleRow)
}

export function markArticlesRead(ids: string[]): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  const result = db
    .prepare(`UPDATE articles SET read = 1 WHERE id IN (${placeholders})`)
    .run(...ids)
  return result.changes
}

export function markAllRead(): number {
  const result = db.prepare('UPDATE articles SET read = 1 WHERE read = 0').run()
  return result.changes
}

export function getUnprocessedArticles(): ArticleRow[] {
  const rows = db
    .prepare(
      `SELECT id, feed_url, title, source, url, summary, image, published, read
       FROM articles WHERE processed = 0 ORDER BY published DESC, created_at DESC`,
    )
    .all() as ArticleRowSql[]
  return rows.map(mapArticleRow)
}

export function markArticlesProcessed(ids: string[]): number {
  if (ids.length === 0) return 0
  const placeholders = ids.map(() => '?').join(',')
  const result = db
    .prepare(`UPDATE articles SET processed = 1 WHERE id IN (${placeholders})`)
    .run(...ids)
  return result.changes
}

export type ReadFilter = 'all' | 'unread' | 'read'

interface GetRecentArticlesOptions {
  limit?: number
  offset?: number
  readFilter?: ReadFilter
}

function readWhereClause(filter: ReadFilter): string {
  if (filter === 'unread') return 'WHERE a.read = 0'
  if (filter === 'read') return 'WHERE a.read = 1'
  return ''
}

export function getRecentArticles(opts: GetRecentArticlesOptions = {}): ArticleWithTracks[] {
  const limit = opts.limit ?? 100
  const offset = opts.offset ?? 0
  const where = readWhereClause(opts.readFilter ?? 'all')
  const rows = db
    .prepare(
      `SELECT
         a.id, a.feed_url, a.title, a.source, a.url, a.summary, a.image, a.published, a.read,
         (
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
           WHERE yc.article_id = a.id
         ) AS tracks_json
       FROM articles a
       ${where}
       ORDER BY COALESCE(a.published, a.created_at) DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as (ArticleRowSql & { tracks_json: string })[]
  return rows.map((r) => ({
    ...mapArticleRow(r),
    tracks: JSON.parse(r.tracks_json) as CachedTrack[],
  }))
}

export function getArticleCount(readFilter: ReadFilter = 'all'): number {
  const where =
    readFilter === 'unread' ? 'WHERE read = 0' : readFilter === 'read' ? 'WHERE read = 1' : ''
  const row = db.prepare(`SELECT COUNT(*) as count FROM articles ${where}`).get() as {
    count: number
  }
  return row.count
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

/** Bulk-fetch cached videos for the given articleIds, keyed by `${articleId}|${searchQuery}` for O(1) lookup. */
export function getTrackCache(articleIds: string[]): Map<string, CachedVideo> {
  const map = new Map<string, CachedVideo>()
  if (articleIds.length === 0) return map
  const placeholders = articleIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT article_id, search_query, video_id, video_title
       FROM youtube_cache WHERE article_id IN (${placeholders})`,
    )
    .all(...articleIds) as {
    article_id: string
    search_query: string
    video_id: string | null
    video_title: string | null
  }[]
  for (const r of rows) {
    map.set(`${r.article_id}|${r.search_query}`, {
      videoId: r.video_id,
      videoTitle: r.video_title,
    })
  }
  return map
}

export function cacheVideo(
  articleId: string,
  searchQuery: string,
  videoId: string | null,
  videoTitle: string | null,
): void {
  db.prepare(
    'INSERT OR REPLACE INTO youtube_cache (article_id, search_query, video_id, video_title) VALUES (?, ?, ?, ?)',
  ).run(articleId, searchQuery, videoId, videoTitle)
}
