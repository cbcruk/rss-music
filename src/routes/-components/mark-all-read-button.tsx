import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '#/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/ui/tooltip'

const markAllAsRead = createServerFn({ method: 'POST' }).handler(async () => {
  const { markAllRead } = await import('#/server/db')
  return markAllRead()
})

interface MarkAllReadButtonProps {
  unreadCount: number
}

/** 안 읽은 기사를 모두 읽음 처리하는 버튼. 안 읽은 기사가 없으면 렌더링하지 않는다. */
export function MarkAllReadButton({ unreadCount }: MarkAllReadButtonProps) {
  const router = useRouter()
  const mutation = useMutation({
    mutationFn: () => markAllAsRead(),
    onSuccess: () => {
      void router.invalidate()
    },
  })

  if (unreadCount === 0) return null

  const label = mutation.isPending ? 'Marking…' : `Mark all ${unreadCount} read`

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            aria-label={label}
          >
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
