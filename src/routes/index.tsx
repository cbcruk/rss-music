import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { HomeHeader, HomeHeaderButton } from './-components/home-header'
import { ScrapeError } from './-components/scrape-error'
import { PipelineResultPanel } from './-components/pipeline-result-panel'
import { ArticleList } from './-components/article-list'

const fetchArticles = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRecentArticles, getUnreadCount, getTracksByArticleIds } = await import('#/db')
  const articles = getRecentArticles(100)
  const tracks = getTracksByArticleIds(articles.map((a) => a.id))

  return {
    articles,
    tracks,
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

export type ScrapeResult = Awaited<ReturnType<typeof runScrape>>

export const Route = createFileRoute('/')({
  component: Home,
  loader: () => fetchArticles(),
})

function Home() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const scrape = useMutation<ScrapeResult, Error, void>({
    mutationFn: () => runScrape(),
    onSuccess: () => {
      router.invalidate()
    },
  })

  return (
    <div className="mx-auto max-w-4xl p-8">
      <HomeHeader articleCount={data.articles.length} unreadCount={data.unreadCount}>
        <HomeHeaderButton disabled={scrape.isPending} onClick={() => scrape.mutate()}>
          {scrape.isPending ? 'Scraping…' : 'Run scrape'}
        </HomeHeaderButton>
      </HomeHeader>
      {scrape.isError && <ScrapeError message={scrape.error.message} />}
      {scrape.isSuccess && <PipelineResultPanel result={scrape.data} />}
      <ArticleList articles={data.articles} tracks={data.tracks} />
    </div>
  )
}
