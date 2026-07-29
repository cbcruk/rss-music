import { readFileSync } from 'fs'
import { XMLParser } from 'fast-xml-parser'
import { Effect } from 'effect'

/** OPML에서 추출한 피드 1건. `category`는 자신을 감싼 상위 outline의 이름. */
export interface OpmlFeed {
  url: string
  title: string | null
  category: string | null
}

/** OPML 파일을 읽지 못했을 때(경로 오류, 권한 등). */
export class OpmlReadError extends Error {
  readonly _tag = 'OpmlReadError'
}

/** OPML XML 파싱에 실패했을 때. */
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

/**
 * OPML 파일에서 피드 목록을 뽑아낸다. 중첩 outline을 재귀 순회하며 상위 폴더명을 카테고리로 물려준다.
 * @returns `xmlUrl`을 가진 outline만 평탄화한 목록. body가 없으면 빈 배열
 */
export function parseOpml(filePath: string): Promise<OpmlFeed[]> {
  return Effect.runPromise(parseOpmlEffect(filePath))
}
