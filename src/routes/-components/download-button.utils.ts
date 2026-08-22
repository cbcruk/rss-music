const MAX_MESSAGE_LENGTH = 220

export function formatDownloadError(output: string): string {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const errorLine = lines.filter((line) => line.startsWith('ERROR:')).at(-1)
  const message = (errorLine ?? lines.at(-1) ?? 'Download failed').replace(/^ERROR:\s*/, '')

  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message
}
