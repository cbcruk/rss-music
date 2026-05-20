import { Link, useLocation } from '@tanstack/react-router'
import { Archive, Inbox, Music, Rss } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '#/ui/sidebar'

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

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Music className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">RSS Music</span>
                <span className="truncate text-xs text-muted-foreground">Aggregator</span>
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
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
