import { readFileSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'
import { Effect } from 'effect'
import type { OpmlFeed } from './types.js'

export class OpmlReadError extends Error {
  readonly _tag = 'OpmlReadError'
}

export class OpmlParseError extends Error {
  readonly _tag = 'OpmlParseError'
}

interface OpmlOutline {
  '@_text'?: string
  '@_title'?: string
  '@_type'?: string
  '@_xmlUrl'?: string
  outline?: OpmlOutline | OpmlOutline[]
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

function walk(
  node: OpmlOutline | OpmlOutline[] | undefined,
  parentCategory: string | null,
  out: OpmlFeed[],
): void {
  if (!node) return
  const items = Array.isArray(node) ? node : [node]
  for (const item of items) {
    const xmlUrl = item['@_xmlUrl']
    if (xmlUrl) {
      out.push({
        url: xmlUrl,
        title: item['@_title'] ?? item['@_text'] ?? null,
        category: parentCategory,
      })
    } else {
      const nextCategory = item['@_text'] ?? item['@_title'] ?? parentCategory
      walk(item.outline, nextCategory, out)
    }
  }
}

const readOpml = (filePath: string) =>
  Effect.try({
    try: () => readFileSync(filePath, 'utf8'),
    catch: (e) => new OpmlReadError(e instanceof Error ? e.message : String(e)),
  })

const parseXml = (xml: string) =>
  Effect.try({
    try: () =>
      xmlParser.parse(xml) as { opml?: { body?: { outline?: OpmlOutline | OpmlOutline[] } } },
    catch: (e) => new OpmlParseError(e instanceof Error ? e.message : String(e)),
  })

const parseOpmlEffect = (filePath: string) =>
  Effect.gen(function* () {
    const xml = yield* readOpml(filePath)
    const parsed = yield* parseXml(xml)
    const body = parsed?.opml?.body
    if (!body) return [] as OpmlFeed[]
    const out: OpmlFeed[] = []
    walk(body.outline, null, out)
    return out
  })

export function parseOpml(filePath: string): Promise<OpmlFeed[]> {
  return Effect.runPromise(parseOpmlEffect(filePath))
}
