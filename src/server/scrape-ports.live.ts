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
} from './db.js'
import { generateTracks } from './gemini.js'
import { fetchFeeds } from './rss.js'
import { appendScrapeLog } from './scrape-log.js'
import type { ScrapePorts } from './scrape-ports.js'
import { searchYouTube } from './youtube.js'

/**
 * 실제 SQLite · Gemini · RSS · YouTube · 로그 파일에 닿는 {@link ScrapePorts} 구현.
 *
 * 이 모듈이 collaborator를 직접 import하는 유일한 자리다. `pipeline.ts`는 타입만
 * 가져가므로 Scrape와 이 모듈들 사이에 모듈 그래프 간선이 없다.
 */
export const livePorts: ScrapePorts = {
  listFeeds,
  fetchFeeds,

  async recordFeed(feedUrl, feedTitle) {
    if (feedTitle) await upsertFeed(feedUrl, feedTitle)
    await touchFeed(feedUrl)
  },

  findKnownArticleIds: getExistingArticleIds,
  saveArticles,
  takeUnprocessed: getUnprocessedArticles,
  extractTracks: generateTracks,
  loadMatchCache: getTrackCache,
  searchMatch: searchYouTube,

  saveMatch(articleId, searchQuery, match) {
    return cacheVideo(articleId, searchQuery, match.videoId, match.videoTitle)
  },

  markProcessed: markArticlesProcessed,
  log: appendScrapeLog,
}
