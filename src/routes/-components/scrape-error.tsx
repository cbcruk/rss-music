interface ScrapeErrorProps {
  message: string
}

export function ScrapeError({ message }: ScrapeErrorProps) {
  return (
    <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
      {message}
    </div>
  )
}
