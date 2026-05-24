import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  fetchFeedEffect,
  fetchFeedsEffect,
  pickId,
  pickImage,
  RssParser,
  RssParserError,
  type ParsedFeed,
  type ParsedItem,
} from './rss'

function item(overrides: Partial<ParsedItem> = {}): ParsedItem {
  return overrides as ParsedItem
}

describe('pickImage', () => {
  it('prefers media:content url', () => {
    expect(pickImage(item({ 'media:content': { $: { url: 'https://a/x.jpg' } } }))).toBe(
      'https://a/x.jpg',
    )
  })

  it('handles media:content as array, takes first with url', () => {
    expect(
      pickImage(item({ 'media:content': [{ $: {} }, { $: { url: 'https://b/y.jpg' } }] })),
    ).toBe('https://b/y.jpg')
  })

  it('falls back to media:thumbnail', () => {
    expect(pickImage(item({ 'media:thumbnail': { $: { url: 'https://c/z.jpg' } } }))).toBe(
      'https://c/z.jpg',
    )
  })

  it('uses image enclosure', () => {
    expect(pickImage(item({ enclosure: { url: 'https://d/e.png', type: 'image/png' } }))).toBe(
      'https://d/e.png',
    )
  })

  it('ignores non-image enclosure', () => {
    expect(pickImage(item({ enclosure: { url: 'https://d/e.mp3', type: 'audio/mpeg' } }))).toBe(
      null,
    )
  })

  it('extracts first <img src> from content:encoded', () => {
    expect(
      pickImage(
        item({ 'content:encoded': '<p>x</p><img src="https://e/inline.jpg" /><img src="x.jpg"/>' }),
      ),
    ).toBe('https://e/inline.jpg')
  })

  it('returns null when no image source available', () => {
    expect(pickImage(item({}))).toBe(null)
  })
})

describe('pickId', () => {
  it('prefers guid', () => {
    expect(pickId(item({ guid: 'g', id: 'i', link: 'l' }), 'feed')).toBe('g')
  })

  it('falls back to id when guid missing', () => {
    expect(pickId(item({ id: 'i', link: 'l' }), 'feed')).toBe('i')
  })

  it('falls back to link when guid/id missing', () => {
    expect(pickId(item({ link: 'l' }), 'feed')).toBe('l')
  })

  it('falls back to synthetic feedUrl#title when nothing else', () => {
    expect(pickId(item({ title: 'T' }), 'https://feed')).toBe('https://feed#T')
  })

  it('synthetic fallback uses empty title when missing', () => {
    expect(pickId(item({}), 'https://feed')).toBe('https://feed#')
  })
})

function parserLayer(byUrl: Record<string, ParsedFeed | RssParserError>): Layer.Layer<RssParser> {
  return Layer.succeed(RssParser, {
    parseURL: (url) => {
      const r = byUrl[url]
      if (r instanceof RssParserError) return Effect.fail(r)
      return Effect.succeed(r ?? { items: [] })
    },
  })
}

describe('fetchFeedEffect', () => {
  it('maps parsed items to RssItem with derived id/image/published', async () => {
    const parsed: ParsedFeed = {
      title: 'My Feed',
      items: [
        item({
          guid: 'g1',
          title: 'Article',
          link: 'https://x.com/a',
          contentSnippet: 'snip',
          'media:content': { $: { url: 'https://x.com/cover.jpg' } },
          isoDate: '2026-05-18T00:00:00.000Z',
        }),
      ],
    }
    const layer = parserLayer({ 'https://x.com/feed': parsed })

    const result = await Effect.runPromise(
      fetchFeedEffect('https://x.com/feed').pipe(Effect.provide(layer)),
    )

    expect(result.feedTitle).toBe('My Feed')
    expect(result.items).toEqual([
      {
        id: 'g1',
        feedUrl: 'https://x.com/feed',
        feedTitle: 'My Feed',
        title: 'Article',
        url: 'https://x.com/a',
        summary: 'snip',
        image: 'https://x.com/cover.jpg',
        published: '2026-05-18T00:00:00.000Z',
        categories: [],
        author: null,
      },
    ])
  })

  it('uses feedUrl as feedTitle when feed.title missing', async () => {
    const layer = parserLayer({ 'https://x.com/feed': { items: [] } })
    const result = await Effect.runPromise(
      fetchFeedEffect('https://x.com/feed').pipe(Effect.provide(layer)),
    )
    expect(result.feedTitle).toBe('https://x.com/feed')
  })

  it('maps dc:creator (item.creator) to author; null when missing', async () => {
    const layer = parserLayer({
      f: {
        items: [
          item({ guid: 'with-author', creator: 'Margaret Farrell' }),
          item({ guid: 'no-author' }),
        ],
      },
    })
    const result = await Effect.runPromise(fetchFeedEffect('f').pipe(Effect.provide(layer)))
    expect(result.items[0].author).toBe('Margaret Farrell')
    expect(result.items[1].author).toBeNull()
  })

  it('maps item.categories through; defaults to [] when missing', async () => {
    const layer = parserLayer({
      f: {
        items: [
          item({ guid: 'with-cats', categories: ['New Music', 'Josh Conway'] }),
          item({ guid: 'no-cats' }),
        ],
      },
    })
    const result = await Effect.runPromise(fetchFeedEffect('f').pipe(Effect.provide(layer)))
    expect(result.items[0].categories).toEqual(['New Music', 'Josh Conway'])
    expect(result.items[1].categories).toEqual([])
  })

  it('converts pubDate to ISO when isoDate missing', async () => {
    const layer = parserLayer({
      f: {
        items: [item({ guid: 'g', pubDate: 'Wed, 21 Oct 2015 07:28:00 GMT' })],
      },
    })
    const result = await Effect.runPromise(fetchFeedEffect('f').pipe(Effect.provide(layer)))
    expect(result.items[0].published).toBe('2015-10-21T07:28:00.000Z')
  })

  it('wraps RssParserError into RssFetchError tagged with feedUrl', async () => {
    const layer = parserLayer({ broken: new RssParserError('parse fail') })
    const exit = await Effect.runPromise(
      Effect.exit(fetchFeedEffect('broken').pipe(Effect.provide(layer))),
    )
    expect(exit._tag).toBe('Failure')
    if (exit._tag === 'Failure') {
      const error = exit.cause._tag === 'Fail' ? exit.cause.error : null
      expect(error?._tag).toBe('RssFetchError')
      expect(error?.feedUrl).toBe('broken')
      expect(error?.message).toBe('parse fail')
    }
  })
})

describe('fetchFeedsEffect — aggregation', () => {
  it('returns per-url result, mixing success/failure without aborting', async () => {
    const layer = parserLayer({
      'ok-1': { title: 'A', items: [item({ guid: 'a1', link: 'https://a/1' })] },
      fail: new RssParserError('boom'),
      'ok-2': { title: 'B', items: [] },
    })

    const results = await Effect.runPromise(
      fetchFeedsEffect(['ok-1', 'fail', 'ok-2']).pipe(Effect.provide(layer)),
    )

    expect(results).toHaveLength(3)
    expect(results[0]).toMatchObject({ feedUrl: 'ok-1', feedTitle: 'A', error: null })
    expect(results[0].items).toHaveLength(1)
    expect(results[1]).toMatchObject({
      feedUrl: 'fail',
      feedTitle: null,
      items: [],
      error: 'boom',
    })
    expect(results[2]).toMatchObject({ feedUrl: 'ok-2', feedTitle: 'B', error: null })
    expect(results[2].items).toHaveLength(0)
  })

  it('returns empty array for empty input', async () => {
    const layer = parserLayer({})
    const results = await Effect.runPromise(fetchFeedsEffect([]).pipe(Effect.provide(layer)))
    expect(results).toEqual([])
  })
})
