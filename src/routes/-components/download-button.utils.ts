const MAX_MESSAGE_LENGTH = 220

/**
 * yt-dlp 로그 꼬리에서 사용자에게 보여줄 한 줄을 뽑는다. 꼬리는 대부분 진행률 출력이라
 * 그대로 띄우면 원인이 묻히므로, `ERROR:` 줄이 있으면 그걸 쓰고 없으면 마지막 줄로 물러선다.
 *
 * 프로세스를 띄우지도 못한 경우(`spawn ... ENOENT`)에는 `ERROR:` 줄이 없어서 후자를 탄다.
 * @returns 토스트에 넣을 한 줄. 220자를 넘으면 잘라내고 `…`를 붙인다
 */
export function formatDownloadError(output: string): string {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const errorLine = lines.filter((line) => line.startsWith('ERROR:')).at(-1)
  const message = (errorLine ?? lines.at(-1) ?? 'Download failed').replace(/^ERROR:\s*/, '')

  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message
}
