import { execFile } from 'node:child_process'
import { runPipeline, type PipelineResult } from './pipeline.js'

function ts(): string {
  return new Date().toISOString()
}

function notify(title: string, message: string): void {
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`
  execFile('/usr/bin/osascript', ['-e', script], () => {})
}

async function main(): Promise<void> {
  const started = Date.now()
  console.log(`[${ts()}] scrape: start`)

  const generator = runPipeline()
  let result: PipelineResult | undefined

  while (true) {
    const { value, done } = await generator.next()
    if (done) {
      result = value
      break
    }
    if (value.type === 'log') {
      console.log(`[${ts()}] ${value.level}: ${value.message}`)
    } else {
      console.log(`[${ts()}] stage:${value.stage}: ${value.message}`)
    }
  }

  const s = result.stats
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `[${ts()}] scrape: done in ${elapsed}s — ${s.newArticles} new, ${s.processed} processed, ` +
      `${s.trackCount} tracks, ${s.feedErrors} feed errors, ${s.youtubeApiCalls} yt calls`,
  )
  if (s.newArticles > 0) {
    notify('rss-music', `${s.newArticles} new ${s.newArticles === 1 ? 'article' : 'articles'}`)
  }
  process.exit(0)
}

main().catch((e: unknown) => {
  const detail = e instanceof Error ? (e.stack ?? e.message) : String(e)
  console.error(`[${ts()}] scrape: FAILED — ${detail}`)
  process.exit(1)
})
