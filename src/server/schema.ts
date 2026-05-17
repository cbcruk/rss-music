import { sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const feeds = sqliteTable('feeds', {
  url: text('url').primaryKey(),
  title: text('title'),
  lastFetchedAt: text('last_fetched_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),
  feedUrl: text('feed_url').notNull().default(''),
  title: text('title').notNull(),
  source: text('source').notNull(),
  url: text('url').notNull(),
  summary: text('summary'),
  image: text('image'),
  published: text('published'),
  read: integer('read').notNull().default(0),
  processed: integer('processed').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

export const youtubeCache = sqliteTable(
  'youtube_cache',
  {
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id),
    searchQuery: text('search_query').notNull(),
    videoId: text('video_id'),
    videoTitle: text('video_title'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.articleId, t.searchQuery] }),
  }),
)
