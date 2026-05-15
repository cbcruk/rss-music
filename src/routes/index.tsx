import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const fetchArticles = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRecentArticles, getUnreadCount } = await import('#/db')
  return {
    articles: getRecentArticles(100),
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

      <ul className="space-y-3">
        {data.articles.map((a) => (
          <li
            key={a.id}
            className={`flex gap-3 rounded border p-3 ${a.read === 0 ? 'bg-yellow-50' : ''}`}
          >
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
                {a.source} · {a.published ? new Date(a.published).toLocaleDateString() : '—'}
                {a.read === 0 && <span className="ml-2 text-yellow-700">unread</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
