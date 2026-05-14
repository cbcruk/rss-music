import {
  scrape,
  markAllRead,
  importOpml,
  addFeed,
  removeFeedCmd,
  listFeedsCmd,
} from './commands.js'

const args = process.argv.slice(2)

function flagValue(name: string): string | undefined {
  const idx = args.indexOf(name)
  if (idx === -1) return undefined
  return args[idx + 1]
}

const noApi = args.includes('--no-api')
const markReadFlag = args.includes('--mark-read')
const listFeedsFlag = args.includes('--list-feeds')
const opmlPath = flagValue('--import-opml')
const addFeedUrl = flagValue('--add-feed')
const removeFeedUrl = flagValue('--remove-feed')
const category = flagValue('--category') ?? null

if (opmlPath) {
  importOpml(opmlPath, category)
} else if (addFeedUrl) {
  addFeed(addFeedUrl)
} else if (removeFeedUrl) {
  removeFeedCmd(removeFeedUrl)
} else if (listFeedsFlag) {
  listFeedsCmd()
} else if (markReadFlag) {
  markAllRead()
} else {
  scrape({ useApi: !noApi })
}
