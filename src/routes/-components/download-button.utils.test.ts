import { describe, expect, it } from 'vitest'

import { formatDownloadError } from './download-button.utils'

describe('formatDownloadError', () => {
  it('extracts the yt-dlp ERROR line and strips the prefix', () => {
    const output = [
      '[youtube] 9q71ywEqJjA: Downloading webpage',
      '[info] 9q71ywEqJjA: Downloading 1 format(s): 398+251',
      'ERROR: unable to download video data: HTTP Error 403: Forbidden',
    ].join('\n')

    expect(formatDownloadError(output)).toBe(
      'unable to download video data: HTTP Error 403: Forbidden',
    )
  })

  it('falls back to the last line when no ERROR line exists', () => {
    expect(formatDownloadError('spawn yt-dlp ENOENT\n')).toBe('spawn yt-dlp ENOENT')
  })

  it('falls back to a default for empty output', () => {
    expect(formatDownloadError('   \n\n')).toBe('Download failed')
  })

  it('truncates very long messages', () => {
    const result = formatDownloadError(`ERROR: ${'x'.repeat(500)}`)
    expect(result).toHaveLength(221)
    expect(result.endsWith('…')).toBe(true)
  })
})
