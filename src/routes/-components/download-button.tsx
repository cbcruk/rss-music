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
