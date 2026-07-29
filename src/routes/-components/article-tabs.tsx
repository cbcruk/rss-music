import { useLocation, useRouter } from '@tanstack/react-router'
import { Tabs, TabsList, TabsTrigger } from '#/ui/tabs'

interface ArticleTabsProps {
  unreadCount: number
}

/** Unread / Archive 전환 탭. 선택 상태는 별도 state 없이 현재 경로에서 파생된다. */
export function ArticleTabs({ unreadCount }: ArticleTabsProps) {
  const router = useRouter()
  const location = useLocation()
  const selected = location.pathname.startsWith('/archive') ? 'archive' : 'unread'

  const onValueChange = (value: unknown) => {
    if (value === 'unread') void router.navigate({ to: '/' })
    else if (value === 'archive') void router.navigate({ to: '/archive', search: { page: 1 } })
  }

  return (
    <Tabs value={selected} onValueChange={onValueChange}>
      <TabsList aria-label="Articles">
        <TabsTrigger value="unread">Unread ({unreadCount})</TabsTrigger>
        <TabsTrigger value="archive">Archive</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
