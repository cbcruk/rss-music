import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Archive as ArchiveIcon } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/ui/empty'
import { ArticleList } from './-components/article-list'
import { Pagination } from './-components/pagination'
import { SiteHeader } from './-components/site-header'

const PAGE_SIZE = 50

const fetchArchive = createServerFn({ method: 'GET' })
  .inputValidator((page: number) => Math.max(1, Math.floor(page)))
  .handler(async ({ data: page }) => {
    const { getRecentArticles, getArticleCount } = await import('#/server/db')
    const [articles, total] = await Promise.all([
      getRecentArticles({
        readFilter: 'read',
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      getArticleCount('read'),
    ])
    return { articles, total, page }
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
    <>
      <SiteHeader title={`Archive (${data.total})`} />
      <div className="p-6">
        {data.articles.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ArchiveIcon />
              </EmptyMedia>
              <EmptyTitle>No archived articles</EmptyTitle>
              <EmptyDescription>읽은 기사가 여기에 쌓입니다.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ArticleList articles={data.articles} />
            <Pagination page={data.page} pageSize={PAGE_SIZE} total={data.total} />
          </>
        )}
      </div>
    </>
  )
}
