interface EmptyStateProps {
  message: string
}

export function EmptyState({ message }: EmptyStateProps) {
  return <div className="rounded border border-dashed p-8 text-center text-gray-500">{message}</div>
}
