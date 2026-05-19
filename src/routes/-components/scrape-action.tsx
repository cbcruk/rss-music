interface ScrapeActionProps {
  isPending: boolean
  error: string | null
  onRun: () => void
}

export function ScrapeAction({ isPending, error, onRun }: ScrapeActionProps) {
  return (
    <div className="mb-4">
      <button
        onClick={onRun}
        disabled={isPending}
        className="px-4 py-2 rounded bg-black text-white text-sm font-medium disabled:bg-gray-400"
      >
        {isPending ? 'Scraping…' : 'Run scrape'}
      </button>
      {error && <div className="mt-2 p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>}
    </div>
  )
}
