import { CircleArrowDown, Loader2 } from 'lucide-react'
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
            size="icon"
            variant="ghost"
            disabled={isPending}
            onClick={onRun}
            aria-label={label}
          >
            {isPending ? <Loader2 className="animate-spin" /> : <CircleArrowDown />}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
