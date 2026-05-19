import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseOpml } from './opml'

let tmpDir: string

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'opml-test-'))
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function writeOpml(name: string, content: string): string {
  const p = join(tmpDir, name)
  writeFileSync(p, content)
  return p
}

describe('parseOpml — feed extraction', () => {
  it('parses single feed at root level with no category', async () => {
    const xml = `<?xml version="1.0"?><opml><body>
      <outline type="rss" text="Feed A" xmlUrl="https://a/rss" />
    </body></opml>`
    expect(await parseOpml(writeOpml('single.opml', xml))).toEqual([
      { url: 'https://a/rss', title: 'Feed A', category: null },
    ])
  })

  it('extracts multiple feeds inside a category', async () => {
    const xml = `<?xml version="1.0"?><opml><body>
      <outline text="News">
        <outline type="rss" text="A" xmlUrl="https://a" />
        <outline type="rss" text="B" xmlUrl="https://b" />
      </outline>
    </body></opml>`
    expect(await parseOpml(writeOpml('category.opml', xml))).toEqual([
      { url: 'https://a', title: 'A', category: 'News' },
      { url: 'https://b', title: 'B', category: 'News' },
    ])
  })

  it('handles category with single nested feed (non-array shape)', async () => {
    const xml = `<?xml version="1.0"?><opml><body>
      <outline text="Solo">
        <outline type="rss" text="OnlyOne" xmlUrl="https://only" />
      </outline>
    </body></opml>`
    expect(await parseOpml(writeOpml('solo.opml', xml))).toEqual([
      { url: 'https://only', title: 'OnlyOne', category: 'Solo' },
    ])
  })

  it('uses innermost category when nested', async () => {
    const xml = `<?xml version="1.0"?><opml><body>
      <outline text="Outer">
        <outline text="Inner">
          <outline type="rss" text="X" xmlUrl="https://x" />
        </outline>
      </outline>
    </body></opml>`
    const result = await parseOpml(writeOpml('nested.opml', xml))
    expect(result[0].category).toBe('Inner')
  })
})

describe('parseOpml — title fallback', () => {
  it('prefers @_title over @_text', async () => {
    const xml = `<?xml version="1.0"?><opml><body>
      <outline type="rss" text="text-name" title="title-name" xmlUrl="https://a" />
    </body></opml>`
    expect((await parseOpml(writeOpml('title-pref.opml', xml)))[0].title).toBe('title-name')
  })

  it('falls back to @_text when @_title missing', async () => {
    const xml = `<?xml version="1.0"?><opml><body>
      <outline type="rss" text="just-text" xmlUrl="https://a" />
    </body></opml>`
    expect((await parseOpml(writeOpml('text-only.opml', xml)))[0].title).toBe('just-text')
  })

  it('returns null title when neither @_title nor @_text present', async () => {
    const xml = `<?xml version="1.0"?><opml><body>
      <outline type="rss" xmlUrl="https://a" />
    </body></opml>`
    expect((await parseOpml(writeOpml('no-title.opml', xml)))[0].title).toBeNull()
  })
})

describe('parseOpml — edge cases', () => {
  it('returns empty array when opml body missing', async () => {
    const xml = `<?xml version="1.0"?><opml></opml>`
    expect(await parseOpml(writeOpml('no-body.opml', xml))).toEqual([])
  })

  it('returns empty array when body has no outlines', async () => {
    const xml = `<?xml version="1.0"?><opml><body></body></opml>`
    expect(await parseOpml(writeOpml('empty-body.opml', xml))).toEqual([])
  })

  it('rejects with file read error when file not found', async () => {
    await expect(parseOpml(join(tmpDir, 'does-not-exist.opml'))).rejects.toThrow(
      /ENOENT|no such file/i,
    )
  })
})
