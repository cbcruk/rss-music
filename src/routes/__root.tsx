import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createServerFn } from '@tanstack/react-start'
import { SidebarInset, SidebarProvider } from '#/ui/sidebar'
import { TooltipProvider } from '#/ui/tooltip'
import { AppSidebar } from './-components/app-sidebar/app-sidebar'
import appCss from '../styles.css?url'

interface RouterContext {
  queryClient: QueryClient
}

const fetchSidebarData = createServerFn({ method: 'GET' }).handler(async () => {
  const { listFeeds, getArticleCount } = await import('#/server/db')
  const [feeds, unreadCount] = await Promise.all([listFeeds(), getArticleCount('unread')])
  return { feeds, unreadCount }
})

const themeInitScript = `try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.remove('dark');else document.documentElement.classList.add('dark');}catch(e){}`

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'RSS Music',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  loader: () => fetchSidebarData(),
  shellComponent: RootDocument,
  component: AppLayout,
})

function AppLayout() {
  const { feeds, unreadCount } = Route.useLoaderData()
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar feeds={feeds} unreadCount={unreadCount} />
        <SidebarInset>
          <Outlet />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { queryClient } = Route.useRouteContext()
  return (
    <html lang="ko" className="dark">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          {children}
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
