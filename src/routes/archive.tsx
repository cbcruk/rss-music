import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { ArticleSummary } from './-components/article-summary'
import { ArticleTabs } from './-components/article-tabs'
import { ArticleList } from './-components/article-list'
import { EmptyState } from './-components/empty-state'
import { Pagination } from './-components/pagination'

const PAGE_SIZE = 50

const fetchArchive = createServerFn({ method: 'GET' })
  .inputValidator((page: number) => Math.max(1, Math.floor(page)))
  .handler(async ({ data: page }) => {
    const { getRecentArticles, getArticleCount } = await import('#/server/db')
    return {
      articles: getRecentArticles({
        readFilter: 'read',
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      unreadCount: getArticleCount('unread'),
      total: getArticleCount('read'),
      page,
    }
  })

interface ArchiveSearch {
  page: number
}

export const Route = createFileRoute('/archive')({
  validateSearch: (search: Record<string, unknown>): ArchiveSearch => ({
    page: Number(search.page ?? 1) || 1,
  }),
  loaderDeps: ({ search: { page } }) => ({ page }),
  loader: ({ deps: { page } }) => fetchArchive({ data: page }),
  component: Archive,
})

function Archive() {
  const data = Route.useLoaderData()

  return (
    <div className="mx-auto max-w-4xl p-8">
      <ArticleSummary />
      <ArticleTabs unreadCount={data.unreadCount} />
      {data.articles.length === 0 ? (
        <EmptyState message="아직 읽은 기사가 없습니다." />
      ) : (
        <>
          <ArticleList articles={data.articles} />
          <Pagination page={data.page} pageSize={PAGE_SIZE} total={data.total} />
        </>
      )}
    </div>
  )
}
