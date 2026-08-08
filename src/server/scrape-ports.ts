import type { ArticleRow, CachedVideo, FeedRow } from './db.js'
import type { GeminiProgressCallback, TrackInput } from './gemini.js'
import type { FetchResult } from './rss.js'
import type { ScrapeLogRecord } from './scrape-log.js'

/**
 * Scrape가 바깥 세계에 닿기 위해 필요로 하는 것 전부. 결정은 담지 않는다 —
 * 신규 Article 판별, 캐시를 쓸지 검색할지, 실패를 어디서 흡수할지는 Scrape가 정하고
 * 여기에는 그 결정을 실행할 I/O만 둔다. 그래야 in-memory adapter로 갈아끼워도
 * 검증하려는 로직이 그대로 실행된다.
 *
 * 결정이 끼어 있지 않은 I/O만 묶었다({@link ScrapePorts.recordFeed}).
 *
 * @see `docs/adr/0002-scrape-ports-plain-object.md` 이웃 모듈과 달리 Effect Layer를 쓰지 않는 이유
 */
export interface ScrapePorts {
  /** 구독 중인 Feed 목록. */
  listFeeds(): Promise<FeedRow[]>

  /** Feed들을 동시에 수집한다. 개별 실패는 {@link FetchResult.error}로 담겨 돌아온다. */
  fetchFeeds(feedUrls: string[]): Promise<FetchResult[]>

  /**
   * Feed의 제목과 마지막 수집 시각을 갱신한다. 어느 Feed인지 알고 나면 둘 사이에
   * 판단이 없어 하나로 묶었다.
   * @param feedTitle `null`이면 기존 제목을 지우지 않는다
   */
  recordFeed(feedUrl: string, feedTitle: string | null): Promise<void>

  /** 주어진 id 중 이미 저장된 것. 무엇이 신규인지 판단하는 것은 Scrape의 몫이다. */
  findKnownArticleIds(ids: string[]): Promise<Set<string>>

  /** Article을 일괄 저장한다. */
  saveArticles(articles: ArticleRow[]): Promise<void>

  /** 아직 처리하지 않은 Article. */
  takeUnprocessed(): Promise<ArticleRow[]>

  /** Article에서 Track 후보를 뽑는다. */
  extractTracks(articles: ArticleRow[], onProgress?: GeminiProgressCallback): Promise<TrackInput[]>

  /** 이미 알고 있는 Match를 한 번에 불러온다. 키는 `${articleId}|${searchQuery}`. */
  loadMatchCache(articleIds: string[]): Promise<Map<string, CachedVideo>>

  /** Search Query로 Match를 찾는다. 마땅한 영상이 없으면 빈 Match. */
  searchMatch(searchQuery: string): Promise<CachedVideo>

  /** 찾은 Match를 기록한다. 빈 Match도 확정된 결과이므로 함께 기록된다. */
  saveMatch(articleId: string, searchQuery: string, match: CachedVideo): Promise<void>

  /** Article들을 처리 완료로 표시하고, 이번에 상태가 바뀐 수를 돌려준다. */
  markProcessed(articleIds: string[]): Promise<number>

  /** 실행 기록을 남긴다. 실패해도 Scrape를 멈추지 않는다. */
  log(record: ScrapeLogRecord): Promise<void>
}
