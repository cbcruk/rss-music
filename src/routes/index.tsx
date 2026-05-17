import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { ArticleSummary } from './-components/article-summary'
import { ArticleTabs } from './-components/article-tabs'
import { ScrapeAction } from './-components/scrape-action'
import { MarkAllReadButton } from './-components/mark-all-read-button'
import { PipelineResultPanel } from './-components/pipeline-result-panel'
import { ArticleList } from './-components/article-list'
import { EmptyState } from './-components/empty-state'

const fetchUnread = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRecentArticles, getArticleCount } = await import('#/server/db')
  const [articles, unreadCount] = await Promise.all([
    getRecentArticles({ readFilter: 'unread', limit: 10000 }),
    getArticleCount('unread'),
  ])
  return { articles, unreadCount }
})

const runScrape = createServerFn({ method: 'POST' }).handler(async () => {
  const { runPipeline } = await import('#/server/pipeline')
  const events: Array<{ kind: string; message: string }> = []
  const generator = runPipeline()

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

export type ScrapeResult = Awaited<ReturnType<typeof runScrape>>

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => fetchUnread(),
})

function Home() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const scrape = useMutation<ScrapeResult, Error, void>({
    mutationFn: () => runScrape(),
    onSuccess: () => {
      void router.invalidate()
    },
  })

  return (
    <div className="mx-auto max-w-4xl p-8">
      <ArticleSummary />
      <ArticleTabs unreadCount={data.unreadCount} />
      <ScrapeAction
        isPending={scrape.isPending}
        error={scrape.error}
        onRun={() => scrape.mutate()}
      />
      <MarkAllReadButton unreadCount={data.unreadCount} />
      {scrape.isSuccess && <PipelineResultPanel result={scrape.data} />}
      {data.articles.length === 0 ? (
        <EmptyState message="모두 읽음! 새 글이 들어오면 Run scrape으로 가져오세요." />
      ) : (
        <ArticleList articles={data.articles} />
      )}
    </div>
  )
}
