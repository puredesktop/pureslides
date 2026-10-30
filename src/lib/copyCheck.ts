/**
 * Copy a client will notice: a card that holds only a word or two.
 *
 * The suite's copy rule ("Copy comes from the brief", in the design skills
 * and the Matching a house style skill) says every card carries a real claim
 * or is removed. A card left with one or two words — "Shape", "Learn" — is
 * filler. This reads the markup the way typeCheck does: a card is a box (a
 * background, a border or a shadow) sitting beside others in a grid or a
 * row. It is a warning only: it never blocks presenting or exporting.
 */
import type { CheckFinding } from './checkDeck'
import { parseStyle } from './inlineStyle'

/** A card with this many words or fewer holds a label, not a claim. */
export const THIN_CARD_WORDS = 2

const SKIP = 'script, style, template, [aria-hidden="true"], [hidden]'
const MEDIA = 'img, picture, video, svg, canvas, iframe, [data-bg]'
const BOX = ['background', 'background-color', 'border', 'border-top', 'border-left', 'box-shadow']

function isBox(style: Map<string, string>): boolean {
  return BOX.some(property => {
    const value = style.get(property)?.trim()
    return !!value && !/^(none|transparent|0|0px)$/i.test(value)
  })
}

/** The cells of a grid or of a row: the children laid out beside each other. */
function isRowOrGrid(style: Map<string, string>): boolean {
  const display = style.get('display') ?? ''
  if (/grid/.test(display)) return true
  return /flex/.test(display) && !/column/.test(style.get('flex-direction') ?? '')
}

function textOf(element: Element): string {
  const copy = element.cloneNode(true) as Element
  copy.querySelectorAll(SKIP).forEach(node => node.remove())
  const parts: string[] = []
  const walk = (node: Node) => {
    if (node.nodeType === 3) parts.push(node.textContent ?? '')
    node.childNodes.forEach(walk)
  }
  walk(copy)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** A card's words, leaving out its number ("01", "2."): a number over a word is still one word. */
function words(text: string): string[] {
  return text.split(' ').filter(word => /\p{L}/u.test(word))
}

/** A figure ("80%", "3×", "$1.2m") makes a stat card: its label may be short. */
function holdsFigure(text: string): boolean {
  return text.split(' ').some(token => /\d/.test(token) && !/^\d{1,2}[.):]?$/.test(token))
}

/** A class named for a card ("card", "feature-card", "tile"), for decks styled from a stylesheet. */
const CARD_CLASS = /^(?:[\w-]+-)?(?:card|tile)$/i

/** The slide's cards: boxes laid out beside each other inline, and anything classed as a card. */
function cardsOf(slide: Element): Element[] {
  const cards = new Set<Element>()
  for (const element of [slide, ...slide.querySelectorAll('*')]) {
    if (element.closest(SKIP)) continue
    if ((element.getAttribute('class') ?? '').split(/\s+/).some(name => CARD_CLASS.test(name))) cards.add(element)
    if (!isRowOrGrid(parseStyle(element.getAttribute('style')))) continue
    const cells = [...element.children].filter(child => !child.matches(SKIP))
    if (cells.length < 2) continue
    for (const cell of cells) if (isBox(parseStyle(cell.getAttribute('style')))) cards.add(cell)
  }
  return [...cards]
}

export function copyFindings(slides: Element[]): CheckFinding[] {
  const findings: CheckFinding[] = []
  slides.forEach((slide, index) => {
    const thin: string[] = []
    for (const card of cardsOf(slide)) {
      if (card.matches(MEDIA) || card.querySelector(MEDIA)) continue
      const text = textOf(card)
      const count = words(text).length
      if (count === 0 || count > THIN_CARD_WORDS || holdsFigure(text)) continue
      thin.push(text)
    }
    if (!thin.length) return
    const shown = thin.slice(0, 3).map(text => `"${text.length > 40 ? `${text.slice(0, 39)}…` : text}"`).join(', ')
    findings.push({
      severity: 'warning',
      code: 'copy-thin-card',
      slide: index,
      message:
        thin.length === 1
          ? `slide ${index + 1} has a card holding only ${shown}`
          : `slide ${index + 1} has ${thin.length} cards holding only a word or two (${shown}${thin.length > 3 ? ', …' : ''})`,
      fix: "a card carries a claim from the brief: give it the claim's words (a close restatement or a punchy cut is fine), or remove the card. Read Copy comes from the brief in the Matching a house style skill",
    })
  })
  return findings
}
