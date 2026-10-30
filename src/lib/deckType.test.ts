import { describe, expect, it } from 'vitest'
import { SLIDE_BLOCKS } from './blocks'
import { checkDeck } from './checkDeck'
import { createDefaultDeckDocument } from './deckDocument'
import { planDeckEdit, hashDeck } from './deckDoor'
import { DECK_LOOKS, deckLook, lookTokens, typeScale, withDeckLook } from './deckLooks'
import { deckFontFiles, deckTypeCss, withDeckType } from './deckType'
import { addSlide, clearSlides } from './slides'
import { BUNDLED_FAMILIES } from '../fonts/registry'
import { BUNDLED_FONT_URLS } from '../fonts/urls'
import { inlineAssetUrls } from './packageAssets'

const OLD = `<!DOCTYPE html><html><head><style>#deck { color: red }</style></head><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720" style="--slide-heading-font: Georgia, serif"><div data-slide><h1>Old</h1></div></div></body></html>`

describe('looks are type voices', () => {
  it('every look pairs bundled faces, and no two looks sound the same', () => {
    const voices = new Set<string>()
    for (const look of DECK_LOOKS) {
      for (const face of [look.type.heading, look.type.body, look.type.mono]) {
        expect(BUNDLED_FAMILIES.some(family => family.family === face), `${look.id}: ${face}`).toBe(true)
      }
      voices.add(`${look.type.heading}/${look.type.body}/${look.bg}`)
    }
    expect(voices.size).toBe(DECK_LOOKS.length)
    expect(DECK_LOOKS.length).toBeGreaterThanOrEqual(7)
  })

  it('climbs a modular scale, and no label falls under 18px', () => {
    for (const look of DECK_LOOKS) {
      const scale = typeScale(look.type)
      expect(scale.label, look.id).toBeGreaterThanOrEqual(18)
      expect(scale.label).toBeLessThan(scale.body)
      expect(scale.body).toBeLessThan(scale.lead)
      expect(scale.lead).toBeLessThan(scale.headline)
      expect(scale.headline).toBeLessThan(scale.display)
      expect(scale.display).toBeLessThan(scale.stat)
      expect(scale.headline / scale.body).toBeCloseTo(look.type.ratio ** 3, 1)
    }
  })

  it('sets family, weight, size, leading, tracking and measure tokens', () => {
    const tokens = lookTokens('paper')
    for (const name of ['heading-font', 'body-font', 'mono-font', 'size-headline', 'leading-body', 'tracking-label', 'measure-body', 'quote-style'])
      expect(tokens[name], name).toBeTruthy()
    expect(tokens['heading-font']).toContain('Newsreader Display')
    expect(deckLook('nope').id).toBe('auto')
  })
})

describe('the type stylesheet', () => {
  it('a new deck carries its faces from the package and the defaults', () => {
    const html = createDefaultDeckDocument('A deck').html
    const css = deckTypeCss(html)!
    expect(html).toContain('<style data-deck-type>')
    expect(css).toContain(`font-family: 'Inter'`)
    expect(css).toContain('url("assets/fonts/inter.woff2")')
    expect(css).toContain('text-wrap: balance')
    expect(css).toContain('text-wrap: pretty')
    expect(css).toContain('tabular-nums')
    expect(css).toContain('hanging-punctuation')
    // Only what the deck shows: no mono without code, no italics without italic.
    expect(css).not.toContain('IBM Plex Mono')
    expect(css).not.toContain('italic.woff2')
    expect(deckFontFiles(html)).toEqual(['fonts/inter.woff2'])
  })

  it('is idempotent: a deck that changes nothing keeps its bytes', () => {
    const html = createDefaultDeckDocument('Same').html
    expect(withDeckType(html)).toBe(html)
  })

  it('follows the look: Paper brings Newsreader, and its italic once a quote is on a slide', () => {
    const paper = withDeckType(withDeckLook(createDefaultDeckDocument('Paper').html, 'paper'))
    expect(deckFontFiles(paper)).toEqual(['fonts/newsreader-display.woff2', 'fonts/newsreader.woff2'])
    const quote = SLIDE_BLOCKS.find(block => block.id === 'quote')!
    const quoted = withDeckType(addSlide(paper, quote.html))
    expect(deckFontFiles(quoted)).toContain('fonts/newsreader-display-italic.woff2')
  })

  it('brings the mono face in when the deck shows code', () => {
    const deck = withDeckType(addSlide(createDefaultDeckDocument('Code').html, '<div data-slide><h1>Run</h1><p><code>npm test</code></p></div>'))
    expect(deckFontFiles(deck)).toContain('fonts/ibm-plex-mono-400.woff2')
  })

  it('leaves a deck with no type tokens exactly as it is', () => {
    expect(withDeckType(OLD)).toBe(OLD)
  })

  it('is rewritten by the door, so a whole-document rewrite cannot drop it', () => {
    const html = createDefaultDeckDocument('Door').html
    const stripped = html.replace(/<style data-deck-type>[\s\S]*?<\/style>\s*/, '')
    const plan = planDeckEdit({ transform: () => stripped, origin: 'agent' }, { html, hash: hashDeck(html) })
    expect(plan.ok).toBe(true)
    if (plan.ok) expect(plan.html).toContain('<style data-deck-type>')
  })

  it('drops the starter stylesheet face the app never shipped', () => {
    const legacy = createDefaultDeckDocument('Old starter').html.replace(
      '[data-slide] { box-sizing: border-box; }',
      '#deck { font-family: Archivo, system-ui, -apple-system, sans-serif; }\n      [data-slide] { box-sizing: border-box; }',
    )
    expect(withDeckType(legacy)).not.toContain('font-family: Archivo, system-ui')
  })

  it('every bundled face is in the preview map, so a frame with no package still shows it', () => {
    for (const family of BUNDLED_FAMILIES)
      for (const face of family.faces) expect(BUNDLED_FONT_URLS[`fonts/${face.file}`], face.file).toMatch(/^data:font\/woff2;base64,/)
    const html = createDefaultDeckDocument('Preview').html
    expect(inlineAssetUrls(html, {})).toContain('url("data:font/woff2;base64,')
  })
})

describe('blocks read right in every look', () => {
  it('no block trips a typographic check in any look', () => {
    for (const look of DECK_LOOKS) {
      const empty = clearSlides(withDeckLook(createDefaultDeckDocument('Blocks').html, look.id))
      for (const block of SLIDE_BLOCKS) {
        const findings = checkDeck(withDeckType(addSlide(empty, block.html))).filter(finding => finding.code.startsWith('type-'))
        expect(findings, `${look.id} / ${block.id}`).toEqual([])
      }
    }
  })
})
