import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const YT_DLP = process.env.YT_DLP_PATH ?? '/opt/homebrew/bin/yt-dlp'
const EXTRA_PATH = '/opt/homebrew/bin'
const DOWNLOAD_DIR = process.env.RSS_DOWNLOAD_DIR ?? join(homedir(), 'Downloads')
const LOG_PATH = join(process.cwd(), 'data', 'download.log')

export interface DownloadResult {
  ok: boolean
  videoId: string
  output: string
}

function logDownload(videoId: string, code: number | null, tail: string): void {
  try {
    const record = {
      ts: new Date().toISOString(),
      videoId,
      ok: code === 0,
      code,
      downloadDir: DOWNLOAD_DIR,
      tail,
    }
    appendFileSync(LOG_PATH, JSON.stringify(record) + '\n')
  } catch {
    // Logging must never break the download.
  }
}

export function downloadVideo(videoId: string): Promise<DownloadResult> {
  if (!/^[\w-]{11}$/.test(videoId)) {
    return Promise.resolve({ ok: false, videoId, output: 'Invalid video id.' })
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`

  return new Promise((resolve) => {
    const child = spawn(YT_DLP, ['-S', 'height:720', url], {
      cwd: DOWNLOAD_DIR,
      env: { ...process.env, PATH: `${EXTRA_PATH}:${process.env.PATH ?? ''}` },
    })

    let output = ''
    const onData = (chunk: Buffer): void => {
      output += chunk.toString()
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('error', (e) => {
      logDownload(videoId, null, e.message)
      resolve({ ok: false, videoId, output: e.message })
    })
    child.on('close', (code) => {
      const tail = output.trim().split('\n').slice(-4).join('\n')
      logDownload(videoId, code, tail)
      resolve({ ok: code === 0, videoId, output: tail })
    })
  })
}
