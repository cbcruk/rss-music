import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '#/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/ui/tooltip'

interface ScrapeActionProps {
  isPending: boolean
  error: string | null
  onRun: () => void
}

export function ScrapeAction({ isPending, error, onRun }: ScrapeActionProps) {
  const label = isPending ? 'Scraping…' : error ? `Failed: ${error}` : 'Run scrape'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={isPending}
            onClick={onRun}
            aria-label={label}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
