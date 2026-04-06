import { scrape, searchAndOutput, markAllRead } from './commands.js'

const args = process.argv.slice(2)
const noApi = args.includes('--no-api')
const markRead = args.includes('--mark-read')
const jsonArg = args.find((a) => !a.startsWith('--'))

if (markRead) {
  markAllRead()
} else if (!jsonArg) {
  scrape()
} else {
  searchAndOutput(jsonArg, { useApi: false || !noApi })
}
