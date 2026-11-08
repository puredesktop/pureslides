// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reviewToolDeclarations } from '@purescience/platform-ui/review/tools'
import { deckFromLive, deckToLive } from './liveDeck'
import { deckReviewItems, findSlide, keepSlideId, slideFingerprint, withSlideIds } from './reviewDeck'

const deck = (slides: string, head = '<style>h1{color:red}</style>') => `<!DOCTYPE html><html><head>${head}</head><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720">${slides}</div></body></html>`
const two = deck('<div data-slide><h1>One</h1></div><div data-slide><h1>Two</h1><p data-step="1">x</p></div>')
const idsOf = (html: string) => [...html.matchAll(/data-slide-id="([^"]+)"/g)].map(m => m[1])

describe('slide ids for a review', () => {
  it('gives each slide one id, and leaves a deck that has them alone', () => {
    const once = withSlideIds(two)
    expect(idsOf(once)).toHaveLength(2)
    expect(new Set(idsOf(once)).size).toBe(2)
    expect(withSlideIds(once)).toBe(once)
  })

  it('separates a duplicated slide', () => {
    const dup = deck('<div data-slide data-slide-id="a"></div><div data-slide data-slide-id="a"></div>')
    const ids = idsOf(withSlideIds(dup))
    expect(ids[0]).toBe('a')
    expect(ids[1]).not.toBe('a')
  })

  it('gives a rewritten slide back the id at its place, unless another slide holds it', () => {
    const rewritten = deck('<div data-slide data-slide-id="a"></div><div data-slide></div>')
    expect(idsOf(withSlideIds(rewritten, ['a', 'b']))).toEqual(['a', 'b'])
    const moved = deck('<div data-slide></div><div data-slide data-slide-id="a"></div>')
    const ids = idsOf(withSlideIds(moved, ['a', 'b']))
    expect(ids[1]).toBe('a')
    expect(ids[0]).not.toBe('a')
  })

  it('does not disturb a live deck: the same ids, merged slide by slide', () => {
    const ided = withSlideIds(two)
    const live = deckToLive({ title: 'T', html: ided })
    expect(live?.html.match(/data-slide-id/g)).toHaveLength(2)
    expect(live?.live.slides.map(s => s.id)).toEqual(idsOf(ided))
    const back = deckFromLive(live?.live as unknown as Record<string, unknown>, 'T')
    expect(idsOf(back?.html ?? '')).toEqual(idsOf(ided))
  })

  it('keeps the id when a slide is written over', () => {
    const html = deck('<div data-slide data-slide-id="keep"><h1>Old</h1></div>')
    expect(keepSlideId(html, 0, '<div data-slide><h1>New</h1></div>')).toBe('<div data-slide-id="keep" data-slide><h1>New</h1></div>')
    expect(keepSlideId(html, 0, '<div data-slide data-slide-id="own"></div>')).toBe('<div data-slide data-slide-id="own"></div>')
    expect(keepSlideId(two, 0, '<div data-slide></div>')).toBe('<div data-slide></div>')
  })
})

describe('an odd id', () => {
  it('stays text when a slide is written over', () => {
    const held = '$& a"b'
    const html = deck(`<div data-slide data-slide-id="$&amp; a&quot;b"><h1>Old</h1></div>`)
    const written = keepSlideId(html, 0, '<div data-slide><h1>New</h1></div>')
    const back = new DOMParser().parseFromString(written, 'text/html').querySelector('[data-slide]')
    expect(back?.getAttribute('data-slide-id')).toBe(held)
    expect(back?.querySelector('h1')?.textContent).toBe('New')
  })
})

describe('slides as review items', () => {
  const html = withSlideIds(two)
  const ids = idsOf(html)

  it('names each slide, in order, with where it is and how far it builds', () => {
    const items = deckReviewItems(html)
    expect(items.map(i => i.name)).toEqual(['One', 'Two'])
    expect(items[1]).toMatchObject({ id: ids[1], anchor: { index: 1, steps: 1 } })
  })

  it('takes particular slides by number or id, and a selection', () => {
    expect(deckReviewItems(html, { items: ['2'] }).map(i => i.id)).toEqual([ids[1]])
    expect(deckReviewItems(html, { items: [ids[0]] }).map(i => i.id)).toEqual([ids[0]])
    expect(deckReviewItems(html, { scope: 'selection' }, [1]).map(i => i.id)).toEqual([ids[1]])
  })

  it('refuses in words that teach', () => {
    expect(() => deckReviewItems(html, { items: ['9'] })).toThrow(/deck has 2/)
    expect(() => deckReviewItems(html, { scope: 'selection' })).toThrow(/No slides are selected/)
    expect(() => deckReviewItems(html, { scope: 'odd' })).toThrow(/"all" or "selection"/)
  })

  it('finds a slide wherever it has moved', () => {
    expect(findSlide(html, ids[1])).toEqual({ index: 1, steps: 1 })
    expect(findSlide(html, 'nope')).toBeNull()
  })
})

describe('whether a slide changed', () => {
  const html = deck('<div data-slide data-slide-id="a"><h1>One</h1></div><div data-slide data-slide-id="b"><h1>Two</h1></div>')

  it('is the same when another slide changes or the slides move', () => {
    const other = html.replace('<h1>Two</h1>', '<h1>Changed</h1>')
    expect(slideFingerprint(other, 'a')).toBe(slideFingerprint(html, 'a'))
    expect(slideFingerprint(other, 'b')).not.toBe(slideFingerprint(html, 'b'))
    const moved = deck('<div data-slide data-slide-id="b"><h1>Two</h1></div><div data-slide data-slide-id="a"><h1>One</h1></div>')
    expect(slideFingerprint(moved, 'a')).toBe(slideFingerprint(html, 'a'))
  })

  it('differs for every slide when the look changes', () => {
    const relooked = html.replace('color:red', 'color:blue')
    expect(slideFingerprint(relooked, 'a')).not.toBe(slideFingerprint(html, 'a'))
    expect(slideFingerprint(html, 'gone')).toBeNull()
  })
})

describe('the deck\'s files', () => {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), 'plugin.json'), 'utf8'))

  it('declares the four review tools from the one template', () => {
    const declared = manifest.app.agents.tools.filter((tool: { name: string }) => ['openReview', 'getReviewFeedback', 'viewReviewItem', 'settleReviewNote'].includes(tool.name))
    expect(declared).toEqual(reviewToolDeclarations({ noun: 'slide', plural: 'slides' }))
  })

  it('offers /review, which opens the room and sends nothing', () => {
    const review = manifest.app.commands.find((command: { trigger: string }) => command.trigger === '/review')
    expect(review).toMatchObject({ command: 'review' })
    expect(review.help.wont).toMatch(/submit/i)
  })
})
