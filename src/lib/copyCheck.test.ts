import { describe, expect, it } from 'vitest'
import { checkDeck, hasBlockingFinding } from './checkDeck'
import { SLIDE_BLOCKS } from './blocks'

const deck = (body: string): string =>
  `<!DOCTYPE html><html><head></head><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720">${body}</div></body></html>`
const card = (text: string) => `<div style="padding: 24px; background: var(--slide-surface, #eaf0fb)">${text}</div>`
const row = (...cards: string[]) => `<div data-slide><h1 style="font-size: 57px">Move research into print</h1><div style="display: grid; grid-template-columns: repeat(${cards.length}, 1fr); gap: 20px">${cards.join('')}</div></div>`
const thin = (html: string) => checkDeck(deck(html)).filter(f => f.code === 'copy-thin-card')

describe('copy-thin-card', () => {
  it('flags cards that hold only a word or two, as a warning that never blocks', () => {
    const findings = checkDeck(deck(row(card('<div>01</div><div>Shape</div>'), card('<div>02</div><div>Learn</div>'), card('<div>03</div><div>Roll out</div>'))))
    const found = findings.filter(f => f.code === 'copy-thin-card')
    expect(found).toHaveLength(1)
    expect(found[0].message).toBe('slide 1 has 3 cards holding only a word or two ("01 Shape", "02 Learn", "03 Roll out")')
    expect(found[0].severity).toBe('warning')
    expect(found[0].fix).toMatch(/claim from the brief/)
    expect(hasBlockingFinding(findings)).toBe(false)
  })

  it('names a single thin card', () => {
    expect(thin(row(card('<div>Shape</div>'), card('<div>Review</div><div>Editors check every change before it ships.</div>')))[0].message).toBe(
      'slide 1 has a card holding only "Shape"',
    )
  })

  it('leaves cards that carry a claim, stat cards, pictures and plain columns alone', () => {
    expect(thin(row(card('<div>Review</div><div>Editors check every change.</div>'), card('<div>Publish</div><div>One click to every format.</div>')))).toEqual([])
    expect(thin(row(card('<div>80%</div><div>faster</div>'), card('<div>3×</div><div>fewer rounds</div>')))).toEqual([])
    expect(thin(row(card('<img src="assets/logo.png"><div>Acme</div>'), card('<img src="assets/b.png"><div>Beta</div>')))).toEqual([])
    expect(thin('<div data-slide><div style="display: flex; gap: 40px"><div>Shape</div><div>Learn</div></div></div>')).toEqual([])
  })

  it('reads a card classed as one, for a deck styled from its stylesheet', () => {
    expect(thin('<div data-slide><div class="grid"><div class="feature-card"><h3>Shape</h3></div></div></div>')[0].message).toBe(
      'slide 1 has a card holding only "Shape"',
    )
  })

  it("says nothing about the starter blocks' own placeholder cards", () => {
    for (const block of SLIDE_BLOCKS) expect(thin(block.html), block.id).toEqual([])
  })
})
