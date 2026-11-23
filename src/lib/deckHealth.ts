/**
 * Deck Health, WCAG Contrast Helpers & 1-Click Deterministic Auto-Fixes.
 *
 * Combines static `checkDeck` (structure + `typeCheck` + `copyCheck`) with live
 * layout `DeckVerification` into a clear 0–100 health score and deterministic,
 * undo-safe auto-fixes.
 */
import { checkDeck, type CheckFinding } from './checkDeck'
import { withDeckLook } from './deckLooks'
import type { DeckVerification } from './deckVerification'
import { deleteSlide, slidesFromHtml, wordsOf } from './slides'

export type WcagRating = 'AAA' | 'AA' | 'AA Large' | 'Fail'

export function wcagBadge(ratio: number): WcagRating {
  if (!Number.isFinite(ratio) || ratio < 3) return 'Fail'
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  return 'AA Large'
}

export interface DeckHealthReport {
  score: number
  findings: CheckFinding[]
  overlapSlides: number[]
  hasStepGaps: boolean
  hasContrastIssues: boolean
  trailingBlankCount: number
}

function isSlideVisuallyBlank(slide: Element): boolean {
  if (slide.querySelector('img, video, svg, canvas, table, iframe')) return false
  const clone = slide.cloneNode(true) as Element
  clone.querySelectorAll('style, script, [data-notes]').forEach(n => n.remove())
  return wordsOf(clone).length === 0
}

export function countTrailingBlankSlides(html: string): number {
  if (typeof DOMParser === 'undefined') return 0
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
  if (!root) return 0
  const slides = [...root.children].filter(el => el.matches('[data-slide]'))
  if (slides.length <= 1) return 0
  let count = 0
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    if (isSlideVisuallyBlank(slides[i])) count += 1
    else break
  }
  return count
}

export function evaluateDeckHealth(
  html: string,
  verification: DeckVerification,
  options: { availableAssets?: readonly string[] } = {},
): DeckHealthReport {
  const findings = checkDeck(html, options)
  const overlapSlides = verification.state === 'failed' ? [...verification.failedSlides] : []
  const trailingBlankCount = countTrailingBlankSlides(html)

  let penalty = 0
  for (const f of findings) {
    penalty += f.severity === 'error' ? 25 : 7
  }
  penalty += overlapSlides.length * 18
  penalty += trailingBlankCount * 5

  const score = Math.max(0, Math.min(100, 100 - penalty))
  return {
    score,
    findings,
    overlapSlides,
    hasStepGaps: findings.some(f => f.code === 'step-gap'),
    hasContrastIssues: findings.some(f => f.code === 'type-contrast'),
    trailingBlankCount,
  }
}

/** Deterministic auto-fix: renumber all `data-step` attributes per slide sequentially from 1. */
export function autoFixRenumberSteps(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
  if (!root) return html
  const slides = [...root.children].filter(el => el.matches('[data-slide]'))
  const targets = slides.length ? slides : [root]
  let changed = false

  for (const slide of targets) {
    const stepped = [...slide.querySelectorAll('[data-step]')]
      .map(el => ({ el, step: Math.floor(Number(el.getAttribute('data-step'))) }))
      .filter(entry => Number.isFinite(entry.step) && entry.step > 0)
    const uniqueSorted = [...new Set(stepped.map(entry => entry.step))].sort((a, b) => a - b)
    const remap = new Map<number, number>()
    uniqueSorted.forEach((oldStep, idx) => remap.set(oldStep, idx + 1))

    for (const entry of stepped) {
      const nextStep = remap.get(entry.step)!
      if (nextStep !== entry.step) {
        entry.el.setAttribute('data-step', String(nextStep))
        changed = true
      }
    }
  }
  return changed ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n` : html
}

/** Deterministic auto-fix: switch to the high-contrast `clear` look. */
export function autoFixHighContrastLook(html: string): string {
  return withDeckLook(html, 'clear')
}

/** Deterministic auto-fix: remove blank trailing slides, always keeping at least one slide. */
export function autoFixTrimBlankSlides(html: string): string {
  let current = html
  const count = countTrailingBlankSlides(current)
  if (count <= 0) return current
  for (let i = 0; i < count; i += 1) {
    const total = slidesFromHtml(current).length
    if (total <= 1) break
    current = deleteSlide(current, total - 1)
  }
  return current
}
