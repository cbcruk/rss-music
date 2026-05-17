import { Link } from '@tanstack/react-router'

interface ArticleTabsProps {
  unreadCount: number
}

const base = 'pb-2 text-sm text-gray-500 hover:text-gray-900'
const active = 'pb-2 text-sm border-b-2 border-black font-medium text-gray-900'

export function ArticleTabs({ unreadCount }: ArticleTabsProps) {
  return (
    <nav className="flex gap-6 border-b mb-6">
      <Link
        to="/"
        className={base}
        activeOptions={{ exact: true }}
        activeProps={{ className: active }}
      >
        Unread ({unreadCount})
      </Link>
      <Link to="/archive" search={{ page: 1 }} className={base} activeProps={{ className: active }}>
        Archive
      </Link>
    </nav>
  )
}
