import { describe, expect, it } from 'vitest'
import { DECK_LOOKS, deckLook, lookFromHtml, withDeckLook } from './deckLooks'
import { createDefaultDeckDocument, geometryFromHtml } from './deckDocument'
import { addSlide, slidesFromHtml } from './slides'
import { findBlock } from './blocks'
import { deckDesignGuide } from './draftDeck'

const parse = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html')
describe('portable presentation styles', () => {
  it('changes palette and typography without changing slide content, geometry, builds or media', () => {
    const before = addSlide(
      createDefaultDeckDocument('Launch').html,
      findBlock('compare')!.html,
    )
    const rootBefore = parse(before).querySelector('[data-deck-id]')!
    const after = withDeckLook(before, 'paper')
    const rootAfter = parse(after).querySelector<HTMLElement>('[data-deck-id]')!
    expect(rootAfter.innerHTML).toBe(rootBefore.innerHTML)
    expect(slidesFromHtml(after)).toEqual(slidesFromHtml(before))
    expect(geometryFromHtml(after)).toEqual(geometryFromHtml(before))
    expect(rootAfter.style.getPropertyValue('--slide-heading-font')).toContain(
      'Georgia',
    )
    expect(rootAfter.style.getPropertyValue('--slide-bg')).toBe(
      deckLook('paper').bg,
    )
    expect(lookFromHtml(after)).toBe('paper')
  })

  it('preserves custom styles, unrelated root properties and references on legacy decks', () => {
    const before =
      '<html><body><div id="deck" style="width:1280px; --brand: red"><div data-slide><h1 style="color:purple">Custom</h1><img src="assets/photo.png"></div></div></body></html>'
    const after = parse(withDeckLook(before, 'ink'))
    expect(
      after
        .querySelector<HTMLElement>('#deck')!
        .style.getPropertyValue('--brand'),
    ).toBe('red')
    expect(after.querySelector<HTMLElement>('h1')!.style.color).toBe('purple')
    expect(after.querySelector('img')!.getAttribute('src')).toBe(
      'assets/photo.png',
    )
  })

  it('round-trips through saved HTML and lets restoration recover the prior style', () => {
    const original = withDeckLook(createDefaultDeckDocument().html, 'ink')
    const changed = withDeckLook(original, 'paper')
    expect(lookFromHtml(changed)).toBe('paper')
    expect(lookFromHtml(original)).toBe('ink')
    expect(withDeckLook(changed, 'paper')).toBe(changed)
    expect(withDeckLook('<p>No deck</p>', 'paper')).toBe('<p>No deck</p>')
    expect(lookFromHtml(withDeckLook(changed, 'unknown'))).toBe('auto')
  })

  it('gives the drafting guide the exact palette used by the visual previews', () => {
    for (const look of DECK_LOOKS) {
      const guide = deckDesignGuide(look.id)
      expect(guide).toContain(`--slide-bg: ${look.bg}`)
      expect(guide).toContain(`--slide-heading-font: ${look.font}`)
    }
  })

  it('keeps primary, supporting and accent text readable on their intended surfaces', () => {
    const luminance = (hex: string) => {
      const c = hex
        .match(/[a-f\d]{2}/gi)!
        .map(v => parseInt(v, 16) / 255)
        .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    }
    for (const look of DECK_LOOKS) {
      for (const [fg, bg] of [
        [look.ink, look.bg],
        [look.muted, look.bg],
        [look.accent, look.bg],
        [look.ink, look.surface],
        [look.muted, look.surface],
        [look.onInverse, look.inverse],
        [look.inverseMuted, look.inverse],
      ]) {
        const a = luminance(fg),
          b = luminance(bg)
        expect(
          (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
          `${look.id}: ${fg} on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
