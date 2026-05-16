function getYouTubeApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    console.error('YOUTUBE_API_KEY is required')
    process.exit(1)
  }
  return key
}

/** YouTube Data API로 검색어에 해당하는 음악 영상을 검색한다. 첫 번째 결과를 반환. */
export async function searchYouTube(
  query: string,
): Promise<{ videoId: string | null; videoTitle: string | null }> {
  const apiKey = getYouTubeApiKey()
  const url =
    'https://www.googleapis.com/youtube/v3/search' +
    `?part=snippet&type=video&videoCategoryId=10&maxResults=1` +
    `&q=${encodeURIComponent(query)}&key=${apiKey}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`YouTube search error: ${res.status}`)

  const data = await res.json()
  const item = data.items?.[0]

  if (!item) return { videoId: null, videoTitle: null }

  return {
    videoId: item.id.videoId,
    videoTitle: item.snippet.title,
  }
}
