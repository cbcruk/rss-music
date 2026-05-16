export interface RssItem {
  id: string;
  feedUrl: string;
  feedTitle: string;
  title: string;
  url: string;
  summary: string | null;
  image: string | null;
  published: string | null;
}

export interface TrackInput {
  articleId: string;
  searchQuery: string;
  articleTitle: string;
  source: string;
  url: string;
}

export interface TrackWithVideo extends TrackInput {
  videoId: string | null;
  videoTitle: string | null;
}

export interface OpmlFeed {
  url: string;
  title: string | null;
  category: string | null;
}
