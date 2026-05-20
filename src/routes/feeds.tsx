import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { SiteHeader } from './-components/site-header'

const fetchFeeds = createServerFn({ method: 'GET' }).handler(async () => {
  const { listFeeds } = await import('#/server/db')
  return listFeeds()
})

export const Route = createFileRoute('/feeds')({
  component: Feeds,
  loader: () => fetchFeeds(),
})

function Feeds() {
  const feeds = Route.useLoaderData()

  return (
    <>
      <SiteHeader title="Feeds" />
      <div className="p-6">
        {feeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No feeds yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {feeds.map((feed) => (
              <li key={feed.url} className="flex items-center justify-between gap-4 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{feed.title ?? feed.url}</div>
                  <div className="truncate text-xs text-muted-foreground">{feed.url}</div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {feed.lastFetchedAt
                    ? new Date(feed.lastFetchedAt).toISOString().slice(0, 10)
                    : '—'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
