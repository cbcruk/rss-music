import { Link } from '@tanstack/react-router'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
}

const linkBase = 'px-3 py-1 rounded border text-sm'
const linkDisabled =
  'px-3 py-1 rounded border text-sm text-gray-300 border-gray-200 pointer-events-none'

export function Pagination({ page, pageSize, total }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const isFirst = page <= 1
  const isLast = page >= totalPages
  return (
    <nav className="flex items-center justify-between mt-6">
      <Link
        to="/archive"
        search={{ page: Math.max(1, page - 1) }}
        className={isFirst ? linkDisabled : linkBase}
        aria-disabled={isFirst}
      >
        ← Prev
      </Link>
      <span className="text-sm text-gray-500">
        Page {page} of {totalPages} ({total} total)
      </span>
      <Link
        to="/archive"
        search={{ page: Math.min(totalPages, page + 1) }}
        className={isLast ? linkDisabled : linkBase}
        aria-disabled={isLast}
      >
        Next →
      </Link>
    </nav>
  )
}
