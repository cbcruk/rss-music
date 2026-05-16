import type { ComponentProps, ReactNode } from 'react'

interface HomeHeaderProps {
  articleCount: number
  unreadCount: number
  children: ReactNode
}

export function HomeHeader({ articleCount, unreadCount, children }: HomeHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b pb-4 mb-6">
      <div>
        <h1 className="text-3xl font-bold">RSS Music</h1>
        <p className="text-sm text-gray-500 mt-1">
          Recent: {articleCount} · Unread: {unreadCount}
        </p>
      </div>
      {children}
    </header>
  )
}

export function HomeHeaderButton({ children, ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className="px-4 py-2 rounded bg-black text-white text-sm font-medium disabled:bg-gray-400"
    >
      {children}
    </button>
  )
}
