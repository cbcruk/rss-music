import type { TrackWithVideo } from './types.js'

/** 트랙 목록을 기사별로 그룹핑하여 YouTube iframe이 포함된 다크 테마 HTML 페이지를 생성한다. */
export function generateHtml(tracks: TrackWithVideo[]): string {
  const grouped = new Map<string, TrackWithVideo[]>()
  for (const track of tracks) {
    const key = track.articleTitle
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(track)
  }

  const cards = [...grouped.entries()]
    .map(
      ([articleTitle, items]) => `
    <div class="card">
      <div class="article-header">
        <a href="${items[0].url}" target="_blank">${articleTitle}</a>
        <span class="source">${items[0].source}</span>
      </div>
      <div class="tracks">
        ${items
          .map((t) =>
            t.videoId
              ? `<div class="track">
                  <p class="query">
                    ${t.searchQuery}
                    <a class="yt-search" href="https://www.youtube.com/results?search_query=${encodeURIComponent(t.searchQuery)}" target="_blank">YouTube search</a>
                  </p>
                  <iframe src="https://www.youtube.com/embed/${t.videoId}" frameborder="0" allowfullscreen></iframe>
                </div>`
              : t.searchQuery
                ? `<div class="track not-found">
                    <p>${t.searchQuery} — <a class="yt-search" href="https://www.youtube.com/results?search_query=${encodeURIComponent(t.searchQuery)}" target="_blank">YouTube search</a></p>
                  </div>`
                : '',
          )
          .join('\n')}
      </div>
    </div>`,
    )
    .join('\n')

  const matched = tracks.filter((t) => t.videoId).length

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Feedly Music</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0f0f0f; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 2rem; }
  h1 { margin-bottom: 0.5rem; }
  .stats { color: #888; margin-bottom: 2rem; }
  .card { background: #1a1a1a; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
  .article-header a { color: #fff; font-size: 1.1rem; font-weight: 600; text-decoration: none; }
  .article-header a:hover { text-decoration: underline; }
  .source { display: block; color: #888; font-size: 0.85rem; margin-top: 0.25rem; }
  .tracks { margin-top: 1rem; }
  .track { margin-bottom: 1rem; }
  .track .query { margin-bottom: 0.5rem; color: #aaa; font-size: 0.9rem; }
  .track iframe { width: 100%; max-width: 560px; height: 315px; border-radius: 8px; }
  .not-found p { color: #666; }
  .yt-search { color: #e53935; font-size: 0.8rem; margin-left: 0.5rem; text-decoration: none; }
  .yt-search:hover { text-decoration: underline; }
</style>
</head>
<body>
  <h1>Feedly Music – musicexplo</h1>
  <p class="stats">${grouped.size} articles / ${tracks.length} tracks / ${matched} matched</p>
  ${cards}
</body>
</html>`
}
