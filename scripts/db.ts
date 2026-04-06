import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '..', 'data', 'cache.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    keywords TEXT,
    summary TEXT,
    image TEXT,
    published TEXT,
    processed INTEGER NOT NULL DEFAULT 0,
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

const newColumns: { name: string; type: string; defaultValue?: string }[] = [
  { name: 'keywords', type: 'TEXT' },
  { name: 'summary', type: 'TEXT' },
  { name: 'image', type: 'TEXT' },
  { name: 'published', type: 'TEXT' },
  { name: 'processed', type: 'INTEGER', defaultValue: '0' },
]

for (const col of newColumns) {
  if (!columnExists('articles', col.name)) {
    const def = col.defaultValue ? ` NOT NULL DEFAULT ${col.defaultValue}` : ''
    db.exec(`ALTER TABLE articles ADD COLUMN ${col.name} ${col.type}${def}`)
  }
}

if (!columnExists('youtube_cache', 'article_id')) {
  db.exec('DROP TABLE IF EXISTS youtube_cache')
  db.exec(`
    CREATE TABLE youtube_cache (
      article_id TEXT NOT NULL REFERENCES articles(id),
      search_query TEXT NOT NULL,
      video_id TEXT,
      video_title TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (article_id, search_query)
    )
  `)
}

export interface ArticleRow {
  id: string
  title: string
  source: string
  url: string
  keywords: string | null
  summary: string | null
  image: string | null
  published: string | null
  processed: number
}

/** DB에 기사가 존재하는지 확인한다. */
export function hasArticle(id: string): boolean {
  const row = db.prepare('SELECT 1 FROM articles WHERE id = ?').get(id)
  return !!row
}

/** 기사 목록을 DB에 저장한다. 이미 존재하면 무시. */
export function saveArticles(articles: ArticleRow[]): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO articles (id, title, source, url, keywords, summary, image, published, processed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const tx = db.transaction((items: ArticleRow[]) => {
    for (const a of items) {
      insert.run(
        a.id,
        a.title,
        a.source,
        a.url,
        a.keywords,
        a.summary,
        a.image,
        a.published,
        a.processed,
      )
    }
  })
  tx(articles)
}

/** DB에 저장된 모든 기사를 반환한다. */
export function getAllArticles(): ArticleRow[] {
  return db
    .prepare(
      'SELECT id, title, source, url, keywords, summary, image, published, processed FROM articles ORDER BY created_at DESC',
    )
    .all() as ArticleRow[]
}

/** 기사를 트랙 추출 완료 상태로 마킹한다. */
export function markProcessed(id: string): void {
  db.prepare('UPDATE articles SET processed = 1 WHERE id = ?').run(id)
}

/** 미처리 기사를 모두 처리 완료로 마킹한다. 처리된 건수를 반환. */
export function markAllProcessed(): number {
  const result = db
    .prepare('UPDATE articles SET processed = 1 WHERE processed = 0')
    .run()
  return result.changes
}

/** 기사 ID 기준으로 캐시된 YouTube 결과를 반환한다. 없으면 빈 배열. */
export function getCachedVideos(articleId: string): {
  searchQuery: string
  videoId: string | null
  videoTitle: string | null
}[] {
  const rows = db
    .prepare(
      'SELECT search_query, video_id, video_title FROM youtube_cache WHERE article_id = ?',
    )
    .all(articleId) as {
    search_query: string
    video_id: string | null
    video_title: string | null
  }[]
  return rows.map((r) => ({
    searchQuery: r.search_query,
    videoId: r.video_id,
    videoTitle: r.video_title,
  }))
}

/** YouTube 검색 결과를 캐시에 저장한다. */
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
