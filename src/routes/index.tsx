import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { ArticleSummary } from './-components/article-summary'
import { ArticleTabs } from './-components/article-tabs'
import { ScrapeAction } from './-components/scrape-action'
import { MarkAllReadButton } from './-components/mark-all-read-button'
import { PipelineResultPanel } from './-components/pipeline-result-panel'
import { ArticleList } from './-components/article-list'
import { EmptyState } from './-components/empty-state'
import { useScrape } from './-hooks/use-scrape'

const fetchUnread = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRecentArticles, getArticleCount } = await import('#/server/db')
  const [articles, unreadCount] = await Promise.all([
    getRecentArticles({ readFilter: 'unread', limit: 10000 }),
    getArticleCount('unread'),
  ])
  return { articles, unreadCount }
})

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => fetchUnread(),
})

function Home() {
  const data = Route.useLoaderData()
  const scrape = useScrape()

  return (
    <div className="mx-auto max-w-4xl p-8">
      <ArticleSummary />
      <ArticleTabs unreadCount={data.unreadCount} />
      <ScrapeAction isPending={scrape.running} error={scrape.error} onRun={scrape.run} />
      <MarkAllReadButton unreadCount={data.unreadCount} />
      {scrape.running && (
        <div className="mb-4 p-3 rounded border border-blue-200 bg-blue-50 text-sm">
          <span className="font-medium">Scraping… </span>
          <span className="text-gray-600">{scrape.events.at(-1)?.message ?? ''}</span>
        </div>
      )}
      {scrape.result && <PipelineResultPanel result={scrape.result} />}
      {data.articles.length === 0 ? (
        <EmptyState message="모두 읽음! 새 글이 들어오면 Run scrape으로 가져오세요." />
      ) : (
        <ArticleList articles={data.articles} />
      )}
    </div>
  )
}
