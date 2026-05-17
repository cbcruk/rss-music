import type { ScrapeResult } from '../index'

interface PipelineResultPanelProps {
  result: ScrapeResult
}

export function PipelineResultPanel({ result }: PipelineResultPanelProps) {
  return (
    <details className="mb-6 rounded border p-3 text-sm" open>
      <summary className="cursor-pointer font-medium">
        Pipeline log ({result.events.length} events) · {result.trackCount} tracks ·{' '}
        {result.stats.processed} processed
      </summary>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-gray-700">
        {result.events.map((e) => `[${e.kind}] ${e.message}`).join('\n')}
      </pre>
    </details>
  )
}
