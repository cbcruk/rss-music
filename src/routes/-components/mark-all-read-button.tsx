import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Button } from '#/ui/button'

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
    <div className="mb-4">
      <Button variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Marking…' : `Mark all ${unreadCount} read`}
      </Button>
    </div>
  )
}
