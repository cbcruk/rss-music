import type { ScrapeResult } from '../-hooks/use-scrape'

interface PipelineResultPanelProps {
  result: ScrapeResult
}

export function PipelineResultPanel({ result }: PipelineResultPanelProps) {
  return (
    <details className="mb-6 rounded-md border border-border bg-card p-3 text-sm" open>
      <summary className="cursor-pointer font-medium">
        Pipeline log ({result.events.length} events) · {result.trackCount} tracks ·{' '}
        {result.stats.processed} processed
      </summary>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
        {result.events.map((e) => `[${e.kind}] ${e.message}`).join('\n')}
      </pre>
    </details>
  )
}
