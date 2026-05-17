import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const markAllAsRead = createServerFn({ method: 'POST' }).handler(async () => {
  const { markAllRead } = await import('#/server/db')
  return markAllRead()
})

interface MarkAllReadButtonProps {
  unreadCount: number
}

export function MarkAllReadButton({ unreadCount }: MarkAllReadButtonProps) {
  const router = useRouter()
  const mutation = useMutation({
    mutationFn: () => markAllAsRead(),
    onSuccess: () => {
      void router.invalidate()
    },
  })

  if (unreadCount === 0) return null

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="mb-4 px-4 py-2 rounded border text-sm font-medium hover:bg-gray-50 disabled:text-gray-400"
    >
      {mutation.isPending ? 'Marking…' : `Mark all ${unreadCount} read`}
    </button>
  )
}
