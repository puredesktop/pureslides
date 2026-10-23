import type { DeckDocument } from './deckDocument'

/**
 * A deck as it is kept live (editing/live/useLiveJson): its page without the slides (head, styles, the deck's own
 * attributes) and its slides, each by a stable id, so two people changing different slides both keep their change.
 * A slide gets its id (`data-slide-id`) the first time the deck goes live, and keeps it in the file after.
 */
export interface LiveDeck {
  title: string
  /** The page, its slides taken out and a marker where they go. */
  shell: string
  slides: Array<{ id: string; html: string }>
}

const MARKER = 'pure-live-slides'
const SLIDE_SELECTOR = '[data-slide]'
const serialize = (doc: Document) => `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
const newId = () => `s-${Math.random().toString(36).slice(2, 10)}`

/** The deck kept live, and its HTML with every slide's id in it (to adopt, so this tab and the live copy agree). */
export function deckToLive(deck: DeckDocument): { live: LiveDeck; html: string } | null {
  if (typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(deck.html, 'text/html')
  const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
  if (!root) return null
  const slides = [...root.children].filter(child => child.matches(SLIDE_SELECTOR))
  const seen = new Set<string>()
  for (const slide of slides) {
    let id = slide.getAttribute('data-slide-id')
    if (!id || seen.has(id)) slide.setAttribute('data-slide-id', (id = newId()))
    seen.add(id)
  }
  const html = serialize(doc)
  const live: LiveDeck = { title: deck.title, shell: '', slides: slides.map(slide => ({ id: slide.getAttribute('data-slide-id')!, html: slide.outerHTML })) }
  slides.forEach((slide, index) => (index === 0 ? slide.replaceWith(doc.createComment(MARKER)) : slide.remove()))
  if (!slides.length) root.append(doc.createComment(MARKER))
  live.shell = serialize(doc)
  return { live, html }
}

/** The deck from what the live copy holds. */
export function deckFromLive(live: Record<string, unknown>, fallbackTitle: string): DeckDocument | null {
  const shell = typeof live.shell === 'string' ? live.shell : null
  if (!shell) return null
  const slides = Array.isArray(live.slides) ? (live.slides as Array<{ html?: unknown }>).map(s => (typeof s.html === 'string' ? s.html : '')).join('\n') : ''
  return { title: typeof live.title === 'string' ? live.title : fallbackTitle, html: shell.replace(`<!--${MARKER}-->`, slides) }
}
