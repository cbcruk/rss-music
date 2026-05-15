import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const fetchArticles = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRecentArticles, getUnreadCount, getTracksByArticleIds } = await import('#/db')
  const articles = getRecentArticles(100)
  const tracks = getTracksByArticleIds(articles.map((a) => a.id))
  const tracksByArticle: Record<string, typeof tracks> = {}
  for (const t of tracks) {
    if (!tracksByArticle[t.articleId]) tracksByArticle[t.articleId] = []
    tracksByArticle[t.articleId].push(t)
  }
  return {
    articles,
    tracksByArticle,
    unreadCount: getUnreadCount(),
  }
})

const runScrape = createServerFn({ method: 'POST' }).handler(async () => {
  const { runPipeline } = await import('#/pipeline')
  const events: Array<{ kind: string; message: string }> = []
  const generator = runPipeline({ useApi: true })
  while (true) {
    const { value, done } = await generator.next()
    if (done) {
      return { events, stats: value.stats, trackCount: value.tracks.length }
    }
    if (value.type === 'log') {
      events.push({ kind: value.level, message: value.message })
    } else {
      events.push({ kind: `stage:${value.stage}`, message: value.message })
    }
  }
})

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => fetchArticles(),
})

function Home() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof runScrape>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onRun() {
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const r = await runScrape()
      setResult(r)
      router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="flex items-center justify-between border-b pb-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">RSS Music</h1>
          <p className="text-sm text-gray-500 mt-1">
            Recent: {data.articles.length} · Unread: {data.unreadCount}
          </p>
        </div>
        <button
          onClick={onRun}
          disabled={running}
          className="px-4 py-2 rounded bg-black text-white text-sm font-medium disabled:bg-gray-400"
        >
          {running ? 'Scraping…' : 'Run scrape'}
        </button>
      </header>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {result && (
        <details className="mb-6 rounded border p-3 text-sm" open>
          <summary className="cursor-pointer font-medium">
            Pipeline log ({result.events.length} events) · {result.trackCount} tracks · {result.stats.markedRead} marked read
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-700">
            {result.events.map((e) => `[${e.kind}] ${e.message}`).join('\n')}
          </pre>
        </details>
      )}

      <ul className="space-y-4">
        {data.articles.map((a) => {
          const tracks = data.tracksByArticle[a.id] ?? []
          return (
            <li
              key={a.id}
              className={`rounded border p-3 ${a.read === 0 ? 'bg-yellow-50' : ''}`}
            >
              <div className="flex gap-3">
                {a.image && (
                  <img
                    src={a.image}
                    alt=""
                    className="w-20 h-20 object-cover rounded shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:underline line-clamp-2"
                  >
                    {a.title}
                  </a>
                  <p className="text-xs text-gray-500 mt-1">
                    {a.source} · {a.published ? a.published.slice(0, 10) : '—'}
                    {a.read === 0 && <span className="ml-2 text-yellow-700">unread</span>}
                  </p>
                </div>
              </div>
              {tracks.length > 0 && <TrackGrid tracks={tracks} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TrackGrid({
  tracks,
}: {
  tracks: { searchQuery: string; videoId: string | null; videoTitle: string | null }[]
}) {
  return (
    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {tracks.map((t, i) => (
        <TrackCard key={`${t.searchQuery}-${i}`} track={t} />
      ))}
    </div>
  )
}

function TrackCard({
  track,
}: {
  track: { searchQuery: string; videoId: string | null; videoTitle: string | null }
}) {
  const [playing, setPlaying] = useState(false)

  if (!track.videoId) {
    return (
      <a
        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(track.searchQuery)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block aspect-video rounded bg-gray-100 hover:bg-gray-200 p-2 text-xs text-gray-600"
        title={`Search YouTube: ${track.searchQuery}`}
      >
        🔍 {track.searchQuery}
      </a>
    )
  }

  if (playing) {
    return (
      <div className="aspect-video rounded overflow-hidden bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${track.videoId}?autoplay=1`}
          title={track.videoTitle ?? track.searchQuery}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>
    )
  }

  return (
    <button
      onClick={() => setPlaying(true)}
      className="group relative aspect-video rounded overflow-hidden bg-black text-left"
      title={track.videoTitle ?? track.searchQuery}
    >
      <img
        src={`https://i.ytimg.com/vi/${track.videoId}/mqdefault.jpg`}
        alt={track.videoTitle ?? ''}
        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition"
      />
      <span className="absolute inset-0 flex items-center justify-center text-white text-3xl drop-shadow-lg">
        ▶
      </span>
      <span className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-1 text-xs text-white line-clamp-1">
        {track.videoTitle ?? track.searchQuery}
      </span>
    </button>
  )
}
