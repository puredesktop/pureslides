import type { ReviewScope, ReviewSourceItem } from '@purescience/platform-ui/review/sources'
import { hashDeck } from './deckDoor'
import { slideElementAt, slidesFromHtml } from './slides'

/**
 * The deck as the Review room sees it: each slide an item, known by the same stable id a live deck uses
 * (`data-slide-id`, lib/liveDeck.ts), so a mark stays on its slide when slides move, and a round can tell which changed.
 */

const SLIDE_SELECTOR = '[data-slide]'
const newId = () => `s-${Math.random().toString(36).slice(2, 10)}`
const rootOf = (doc: Document) => doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
const slidesIn = (root: Element) => [...root.children].filter(child => child.matches(SLIDE_SELECTOR))

/**
 * Every slide with an id of its own: the deck as it is when they all have one (nothing to save), otherwise the deck with
 * the missing ones added, as `deckToLive` adds them. `known` is the ids a review saw, in order: a slide that lost its id
 * in a rewrite takes back the one at its place, if no slide still holds it.
 */
export function withSlideIds(html: string, known: readonly string[] = []): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = rootOf(doc)
  if (!root) return html
  const slides = slidesIn(root)
  const held = new Set(slides.map(slide => slide.getAttribute('data-slide-id')).filter(Boolean))
  const seen = new Set<string>()
  let changed = false
  slides.forEach((slide, index) => {
    let id = slide.getAttribute('data-slide-id')
    if (!id || seen.has(id)) {
      const again = known[index]
      id = again && !held.has(again) && !seen.has(again) ? again : newId()
      slide.setAttribute('data-slide-id', id)
      changed = true
    }
    seen.add(id)
  })
  return changed ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n` : html
}

/** A slide written over keeps the id of the one it replaces, so its review carries on. */
export function keepSlideId(html: string, index: number, replacement: string): string {
  if (typeof DOMParser === 'undefined' || /\bdata-slide-id=/.test(replacement.slice(0, replacement.indexOf('>') + 1))) return replacement
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = rootOf(doc)
  const id = root ? slideElementAt(root, index)?.getAttribute('data-slide-id') : null
  return id ? replacement.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1 data-slide-id="${id}"`) : replacement
}

/** The slides to review. Refusals teach, since the assistant reads them. */
export function deckReviewItems(html: string, scope: ReviewScope = {}, selection: readonly number[] = []): ReviewSourceItem[] {
  if (typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = rootOf(doc)
  if (!root) return []
  const elements = slidesIn(root)
  const facts = slidesFromHtml(html)
  const all = elements.map((slide, index): ReviewSourceItem => {
    const words = facts[index]?.headline?.trim()
    return {
      id: slide.getAttribute('data-slide-id') ?? `slide-${index + 1}`,
      name: words || `Slide ${index + 1}`,
      anchor: { index, steps: facts[index]?.steps ?? 0 },
    }
  })
  if (scope.items?.length) {
    const asked = scope.items.map(value => {
      const byNumber = Number(value)
      const found = Number.isInteger(byNumber) && byNumber >= 1 ? all[byNumber - 1] : all.find(item => item.id === value)
      if (!found) throw new Error(`There is no slide "${value}": the deck has ${all.length}. Use slide numbers from listSlides, or item ids from getReviewFeedback.`)
      return found
    })
    return [...new Set(asked)]
  }
  if (scope.scope === 'selection') {
    if (!selection.length) throw new Error('No slides are selected. Use scope "all", or items with slide numbers.')
    return selection.map(index => all[index]).filter(Boolean)
  }
  if (scope.scope && scope.scope !== 'all') throw new Error(`scope must be "all" or "selection", not "${scope.scope}".`)
  return all
}

/** Where a slide is now, and how many build steps it has. Null when it is gone. */
export function findSlide(html: string, id: string): { index: number; steps: number } | null {
  if (typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = rootOf(doc)
  if (!root) return null
  const index = slidesIn(root).findIndex(slide => slide.getAttribute('data-slide-id') === id)
  return index < 0 ? null : { index, steps: slidesFromHtml(html)[index]?.steps ?? 0 }
}

/**
 * Changes when the slide would look different: its own markup, and what every slide shares (the page's styles, the deck
 * root's size and look). Its place in the deck and its id are not part of how it looks. Null when it is gone.
 */
export function slideFingerprint(html: string, id: string): string | null {
  if (typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = rootOf(doc)
  if (!root) return null
  const slide = slidesIn(root).find(each => each.getAttribute('data-slide-id') === id)
  if (!slide) return null
  const own = slide.cloneNode(true) as Element
  own.removeAttribute('data-slide-id')
  for (const name of ['data-pv-style']) own.querySelectorAll(`[${name}]`).forEach(node => node.removeAttribute(name))
  const rootAttributes = [...root.attributes].map(attribute => `${attribute.name}=${attribute.value}`).sort().join(';')
  return hashDeck(`${doc.head?.innerHTML ?? ''}\n${rootAttributes}\n${own.outerHTML}`)
}
