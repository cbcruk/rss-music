import { sql } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** 구독 중인 피드. 추가/제거 UI가 없어 현재는 DB에서 직접 관리한다. */
export const feeds = sqliteTable('feeds', {
  url: text('url').primaryKey(),
  title: text('title'),
  lastFetchedAt: text('last_fetched_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

/**
 * 수집된 기사. `read`와 `processed`는 의도적으로 분리돼 있다 —
 * `read`는 사용자가 읽음 처리한 것, `processed`는 파이프라인이 트랙 추출까지 끝낸 것.
 */
export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),
  feedUrl: text('feed_url').notNull().default(''),
  title: text('title').notNull(),
  source: text('source').notNull(),
  url: text('url').notNull(),
  summary: text('summary'),
  image: text('image'),
  published: text('published'),
  categories: text('categories').notNull().default('[]'),
  author: text('author'),
  read: integer('read').notNull().default(0),
  processed: integer('processed').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

/**
 * 검색어별 YouTube 매칭 결과 캐시. `(articleId, searchQuery)` 복합키라
 * 기사 하나에서 나온 여러 트랙을 각각 저장할 수 있다.
 * 검색 결과가 없었던 경우도 `videoId: null`로 남겨 재조회를 막는다.
 */
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
