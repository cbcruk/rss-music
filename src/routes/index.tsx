import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { CheckCircle2 } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/ui/empty'
import { ScrapeAction } from './-components/scrape-action'
import { MarkAllReadButton } from './-components/mark-all-read-button'
import { PipelineResultPanel } from './-components/pipeline-result-panel'
import { ArticleList } from './-components/article-list'
import { SiteHeader } from './-components/site-header'
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
    <>
      <SiteHeader
        title={`Unread (${data.unreadCount})`}
        actions={
          <>
            <MarkAllReadButton unreadCount={data.unreadCount} />
            <ScrapeAction isPending={scrape.running} error={scrape.error} onRun={scrape.run} />
          </>
        }
      />
      <div className="p-6">
        {scrape.running && (
          <div className="mb-4 rounded-md border border-border bg-muted/50 p-3 text-sm">
            <span className="font-medium">Scraping… </span>
            <span className="text-muted-foreground">{scrape.events.at(-1)?.message ?? ''}</span>
          </div>
        )}
        {scrape.result && <PipelineResultPanel result={scrape.result} />}
        {data.articles.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CheckCircle2 />
              </EmptyMedia>
              <EmptyTitle>All caught up</EmptyTitle>
              <EmptyDescription>새 글이 들어오면 Run scrape으로 가져오세요.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ArticleList articles={data.articles} />
        )}
      </div>
    </>
  )
}
