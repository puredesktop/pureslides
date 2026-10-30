import { lookDeclarations, lookFromHtml } from './deckLooks'
import { withDeckType } from './deckType'
/**
 * The deck document, and its package.
 *
 * A `.deck` folder holds `index.html` (every slide), `manifest.json` (title,
 * brief, what each asset is) and `assets/`. Geometry lives in the HTML on the
 * deck root, never duplicated in the manifest — one place to read it from,
 * so an edit by hand, by an agent or by the app can never disagree.
 */
import {
  BUILD_CSS,
} from './slideSeek'
import {
  DEFAULT_DECK_ID,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  DEFAULT_SLIDE_SECONDS,
} from '../constants'
import type { AssetNote } from './assetNotes'

export const DEFAULT_DECK_TITLE = 'Untitled deck'

/**
 * True while a deck has never been named.
 *
 * The switcher numbers same-named drafts, so an untouched deck can be
 * "Untitled deck 7" — still unnamed, and still safe to rename from a draft.
 * A title someone typed is never overwritten.
 */
export function isDefaultDeckTitle(title: string): boolean {
  return new RegExp(`^${DEFAULT_DECK_TITLE}(\\s+\\d+)?$`, 'i').test(
    (title ?? '').trim(),
  )
}

export interface DeckDocument {
  title: string
  html: string
}

export interface DeckGeometry {
  width: number
  height: number
  deckId: string
}

function parse(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  return new DOMParser().parseFromString(html, 'text/html')
}

function rootOf(doc: Document): Element | null {
  return doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
}

export function geometryFromHtml(html: string): DeckGeometry {
  const doc = parse(html)
  const root = doc ? rootOf(doc) : null
  const read = (name: string, fallback: number): number => {
    const value = Number(root?.getAttribute(name))
    return Number.isFinite(value) && value > 0 ? value : fallback
  }
  return {
    width: read('data-width', DEFAULT_WIDTH),
    height: read('data-height', DEFAULT_HEIGHT),
    deckId: root?.getAttribute('data-deck-id') || DEFAULT_DECK_ID,
  }
}

export function withGeometry(
  html: string,
  patch: Partial<Omit<DeckGeometry, 'deckId'>>,
): string {
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  if (patch.width && patch.width > 0) {
    root.setAttribute('data-width', String(Math.round(patch.width)))
  }
  if (patch.height && patch.height > 0) {
    root.setAttribute('data-height', String(Math.round(patch.height)))
  }
  const geometry = geometryFromHtml(`<!DOCTYPE html>\n${doc.documentElement.outerHTML}`)
  // Resize the canvas without discarding the author's layout, colors or type.
  const style = (root as HTMLElement).style
  style.width = `${geometry.width}px`
  style.height = `${geometry.height}px`
  style.position = 'relative'
  style.overflow = 'hidden'
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
}

/** Titles are plain text in both the document head and the starter slide. */
function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A starter slide, marked so drafting knows nobody wrote it. */
export function createStarterSlideHtml(title = DEFAULT_DECK_TITLE): string {
  return `<div data-slide data-block="starter" style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 28px; padding: 80px 100px; background: var(--slide-bg, #f8f9fc); color: var(--slide-ink, #192338)">
      <div style="font-family: var(--slide-label-font, var(--slide-body-font, system-ui, sans-serif)); font-size: var(--slide-size-label, 18px); font-weight: var(--slide-label-weight, 600); line-height: 1.2; letter-spacing: var(--slide-tracking-label, 0.12em); text-transform: uppercase; color: var(--slide-accent, #3459d4)">A new perspective</div>
      <h1 style="margin: 0; max-width: var(--slide-measure-display, 16ch); font-family: var(--slide-heading-font, system-ui, sans-serif); font-size: var(--slide-size-display, 76px); font-weight: var(--slide-heading-weight, 700); line-height: var(--slide-leading-display, 1.04); letter-spacing: var(--slide-tracking-display, -0.035em); text-wrap: balance">${escapeHtmlText(title)}</h1>
      <p style="margin: 0; max-width: var(--slide-measure-lead, 36ch); font-family: var(--slide-body-font, system-ui, sans-serif); font-size: var(--slide-size-lead, 32px); line-height: var(--slide-leading-lead, 1.32); color: var(--slide-muted, #53617a); text-wrap: pretty">Your next great story starts here.</p>
    </div>`
}

export function createDefaultDeckDocument(
  title = DEFAULT_DECK_TITLE,
): DeckDocument {
  return {
    title,
    html: withDeckType(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtmlText(title)}</title>
    <style>
      html, body { margin: 0; padding: 0; background: #0e0e11; }
      [data-slide] { box-sizing: border-box; }
${BUILD_CSS}
    </style>
  </head>
  <body>
    <div id="deck" data-deck-id="${DEFAULT_DECK_ID}" data-width="${DEFAULT_WIDTH}" data-height="${DEFAULT_HEIGHT}" data-look="auto" style="${lookDeclarations('auto')} width: ${DEFAULT_WIDTH}px; height: ${DEFAULT_HEIGHT}px; position: relative; overflow: hidden">
    ${createStarterSlideHtml(title)}
    </div>
  </body>
</html>
`),
  }
}

export interface DeckManifest {
  title: string
  contentFile?: string
  brief?: string
  /** The wizard's "Look" choice — absent means the default, `auto`. */
  look?: string
  /** The wizard's "Slides (about)" target — absent means the default. */
  slideCount?: number
  assets?: AssetNote[]
}

export function parsePackageManifest(text: string): DeckManifest {
  const parsed = JSON.parse(text) as Record<string, unknown>
  const assets = Array.isArray(parsed.assets)
    ? (parsed.assets as Record<string, unknown>[])
        .filter(entry => entry && typeof entry.name === 'string')
        .map(entry => ({
          name: String(entry.name),
          description:
            typeof entry.description === 'string' ? entry.description : '',
          ...(entry.described === true ? { described: true } : {}),
          ...(entry.role === 'reference' || entry.role === 'logo'
            ? { role: entry.role as AssetNote['role'] }
            : {}),
        }))
    : undefined
  return {
    title:
      typeof parsed.title === 'string' && parsed.title.trim()
        ? parsed.title
        : DEFAULT_DECK_TITLE,
    ...(typeof parsed.contentFile === 'string'
      ? { contentFile: parsed.contentFile }
      : {}),
    ...(typeof parsed.brief === 'string' ? { brief: parsed.brief } : {}),
    ...(typeof parsed.look === 'string' && parsed.look.trim()
      ? { look: parsed.look }
      : {}),
    ...(typeof parsed.slideCount === 'number' &&
    Number.isFinite(parsed.slideCount) &&
    parsed.slideCount > 0
      ? { slideCount: Math.round(parsed.slideCount) }
      : {}),
    ...(assets ? { assets } : {}),
  }
}

export function serializePackageManifest(manifest: DeckManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/** Seconds the whole deck runs in a timed export. */
export function deckSeconds(perSlide: number[]): number {
  return perSlide.reduce(
    (total, seconds) => total + (seconds > 0 ? seconds : DEFAULT_SLIDE_SECONDS),
    0,
  )
}

/** A one-line summary for the agent, and for the header. */
export function summarizeDeck(
  document: DeckDocument,
  slideCount: number,
): Record<string, unknown> {
  const geometry = geometryFromHtml(document.html)
  return {
    title: document.title,
    slides: slideCount,
    width: geometry.width,
    height: geometry.height,
    look: lookFromHtml(document.html) ?? 'auto',
  }
}
