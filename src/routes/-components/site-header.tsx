import { SidebarTrigger } from '#/ui/sidebar'
import { Separator } from '#/ui/separator'

interface SiteHeaderProps {
  title: string
  actions?: React.ReactNode
}

export function SiteHeader({ title, actions }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-2 h-4" />
      <h1 className="text-base font-medium">{title}</h1>
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}
