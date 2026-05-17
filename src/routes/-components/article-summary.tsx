interface ArticleSummaryProps {
  articleCount: number
  unreadCount: number
}

export function ArticleSummary({ articleCount, unreadCount }: ArticleSummaryProps) {
  return (
    <header className="border-b pb-4 mb-6">
      <h1 className="text-3xl font-bold">RSS Music</h1>
      <p className="text-sm text-gray-500 mt-1">
        Recent: {articleCount} · Unread: {unreadCount}
      </p>
    </header>
  )
}
