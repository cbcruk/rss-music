import { SidebarTrigger } from '#/ui/sidebar'
import { Separator } from '#/ui/separator'
import { ThemeToggle } from './theme-toggle'

interface SiteHeaderProps {
  title: string
  count?: number
  actions?: React.ReactNode
}

export function SiteHeader({ title, count, actions }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <div className="flex items-center gap-2">
        <h1 className="text-base font-medium">{title}</h1>
        {count !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {count.toLocaleString()} articles
          </span>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  )
}
