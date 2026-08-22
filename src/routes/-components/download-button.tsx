import { useMutation } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { Check, Download, Loader2, X } from 'lucide-react'

import { useToast } from '#/ui/toast'
import { formatDownloadError } from './download-button.utils'

const runDownload = createServerFn({ method: 'POST' })
  .inputValidator((videoId: string) => videoId)
  .handler(async ({ data }) => {
    const { downloadVideo } = await import('#/server/download')
    return downloadVideo(data)
  })

interface DownloadButtonProps {
  videoId: string
  className: string
  title?: string
  showLabel?: boolean
}

/**
 * 서버에서 yt-dlp를 실행해 영상을 내려받는 버튼. 진행/성공/실패 상태를 아이콘으로 표시하고,
 * 같은 결과를 토스트로도 띄운다.
 *
 * 토스트가 따로 필요한 이유는 이 버튼이 Popover 안에 있기 때문 — 팝오버가 닫히면 아이콘과
 * 라벨이 통째로 사라져서 실패가 조용히 묻힌다. 실패 토스트는 놓치지 않도록 자동으로 닫지 않는다.
 * @param title 토스트에 표시할 이름. 없으면 `videoId`를 그대로 쓴다
 * @param showLabel 아이콘 옆에 텍스트 라벨도 함께 보일지 여부
 */
export function DownloadButton({ videoId, className, title, showLabel }: DownloadButtonProps) {
  const toast = useToast()
  const subject = title ?? videoId

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await runDownload({ data: id })
      if (!res.ok) throw new Error(formatDownloadError(res.output))
      return res
    },
    onSuccess: () => {
      toast.add({
        type: 'success',
        title: 'Saved to ~/Downloads',
        description: subject,
      })
    },
    onError: (error) => {
      toast.add({
        type: 'error',
        priority: 'high',
        timeout: 0,
        title: `Download failed — ${subject}`,
        description: error.message,
      })
    },
  })

  const icon = mutation.isPending ? (
    <Loader2 className="size-4 animate-spin" />
  ) : mutation.isSuccess ? (
    <Check className="size-4" />
  ) : mutation.isError ? (
    <X className="size-4" />
  ) : (
    <Download className="size-4" />
  )

  const tooltip = mutation.isPending
    ? 'Downloading…'
    : mutation.isSuccess
      ? 'Saved to ~/Downloads'
      : mutation.isError
        ? `Failed: ${mutation.error.message}`
        : 'Download to ~/Downloads (yt-dlp)'

  const label = mutation.isPending
    ? 'Downloading…'
    : mutation.isSuccess
      ? 'Saved to Downloads'
      : mutation.isError
        ? 'Download failed'
        : 'Download'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (!mutation.isPending) mutation.mutate(videoId)
      }}
      title={tooltip}
      aria-label={tooltip}
      className={className}
    >
      {icon}
      {showLabel && <span>{label}</span>}
    </button>
  )
}
