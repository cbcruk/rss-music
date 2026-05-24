import { Link, useLocation } from '@tanstack/react-router'
import { Archive, AudioWaveform, Inbox, Rss, Settings } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '#/ui/sidebar'
import { feedColorClass } from './feed-color'

interface NavItem {
  to: '/' | '/archive' | '/feeds'
  label: string
  icon: typeof Inbox
}

const navItems: NavItem[] = [
  { to: '/', label: 'Unread', icon: Inbox },
  { to: '/archive', label: 'Archive', icon: Archive },
  { to: '/feeds', label: 'Feeds', icon: Rss },
]

function isActive(pathname: string, to: NavItem['to']): boolean {
  if (to === '/') return pathname === '/'
  return pathname.startsWith(to)
}

interface AppSidebarProps {
  feeds: { url: string; title: string | null }[]
  unreadCount: number
}

export function AppSidebar({ feeds, unreadCount }: AppSidebarProps) {
  const location = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-zinc-900 text-amber-400">
                <AudioWaveform className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">RSS Music</span>
                <span className="truncate text-xs text-sidebar-foreground/60">Aggregator</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={isActive(location.pathname, item.to)}
                    tooltip={item.label}
                    render={
                      <Link
                        to={item.to}
                        {...(item.to === '/archive' ? { search: { page: 1 } } : {})}
                      />
                    }
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {item.to === '/' && unreadCount > 0 && (
                    <SidebarMenuBadge>{unreadCount}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {feeds.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Feeds</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {feeds.map((feed) => (
                  <SidebarMenuItem key={feed.url}>
                    <SidebarMenuButton
                      tooltip={feed.title ?? feed.url}
                      render={<Link to="/feeds" />}
                    >
                      <span
                        className={`inline-block size-1.5 shrink-0 rounded-full ${feedColorClass(feed.url)}`}
                        aria-hidden
                      />
                      <span className="truncate">{feed.title ?? feed.url}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" render={<Link to="/feeds" />}>
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
