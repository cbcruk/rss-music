export interface FeedlyEntry {
  id: string
  title: string
  origin?: { title: string }
  alternate?: { href: string }[]
  keywords?: string[]
  summary?: { content: string }
  visual?: { url: string }
  published?: number
}

export interface TrackInput {
  articleId: string
  searchQuery: string
  articleTitle: string
  source: string
  url: string
}

export interface TrackWithVideo extends TrackInput {
  videoId: string | null
  videoTitle: string | null
}
