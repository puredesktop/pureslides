/**
 * The deck's type travels with the deck.
 *
 * A look names its faces in tokens on the root; this module writes the one
 * stylesheet that makes those names real — `<style data-deck-type>` in the
 * head, with an @font-face per bundled face the deck uses, pointing at
 * `assets/fonts/<file>` inside the package, and the few typographic
 * defaults every slide should get for free (balanced headlines, pretty
 * paragraphs, real kerning, tabular figures in tables, no faux bold).
 *
 * The rules are wrapped in :where() so they weigh nothing: a block's inline
 * style, or an author's own stylesheet, always wins.
 *
 * It is derived, not authored: the door rewrites it after every edit, so an
 * agent that replaces the whole document cannot leave the deck without its
 * faces, and a deck that changes nothing gets back the same bytes. A deck
 * with no type tokens on its root (one written before looks had type, or
 * by hand) is left exactly as it is.
 */
import { BUNDLED_FAMILIES, FONT_DIR, bundledFamily, type BundledFamily } from '../fonts/registry'
import { DECK_ASSETS_DIR } from '../constants'
import { parseStyle, resolveVars } from './inlineStyle'

const MANAGED = /<style\s+data-deck-type(?:\s[^>]*)?>[\s\S]*?<\/style>\s*/i

/**
 * The starter stylesheet once named a face the app never shipped, by id —
 * which outranks the type defaults. A deck with type tokens drops it.
 */
const LEGACY_FACE = /[ \t]*#deck \{ font-family: Archivo, system-ui, -apple-system, sans-serif; \}\n?/

const BASE_RULES = `:where([data-deck-id]) {
  font-family: var(--slide-body-font, system-ui, sans-serif);
  font-weight: var(--slide-body-weight, 400);
  font-kerning: normal;
  font-optical-sizing: auto;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
:where([data-deck-id]) :where(h1, h2, h3) {
  font-family: var(--slide-heading-font, inherit);
  font-weight: var(--slide-heading-weight, 700);
  text-wrap: balance;
}
:where([data-deck-id]) :where(p, li, blockquote, figcaption, dd) {
  text-wrap: pretty;
  hanging-punctuation: first allow-end last;
}
:where([data-deck-id]) :where(code, kbd, samp, pre) {
  font-family: var(--slide-mono-font, ui-monospace, monospace);
  font-size: 0.92em;
}
:where([data-deck-id]) :where(table, [data-num]) {
  font-variant-numeric: tabular-nums lining-nums;
}`

function firstFamily(stack: string | null | undefined): string | null {
  if (!stack) return null
  const first = stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '')
  return first || null
}

function fontFaceRules(families: BundledFamily[], italic: boolean): string {
  return families
    .flatMap(family =>
      family.faces
        .filter(face => italic || face.style === 'normal')
        .map(
          face =>
            `@font-face { font-family: '${family.family}'; src: url("${DECK_ASSETS_DIR}/${FONT_DIR}/${face.file}") format("woff2"); font-weight: ${face.weight}; font-style: ${face.style}; font-display: block; }`,
        ),
    )
    .join('\n')
}

/** What the deck's type stylesheet should say, or null when the deck has no type tokens. */
export function deckTypeCss(html: string): string | null {
  if (typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector<HTMLElement>('[data-deck-id]') ?? doc.querySelector<HTMLElement>('#deck')
  if (!root) return null
  const tokens = parseStyle(root.getAttribute('style'))
  if (!tokens.has('--slide-body-font')) return null

  // Read what the deck uses with the tokens' own declarations taken out:
  // a look declares a mono face and an italic quote on every deck, and
  // shipping faces nothing shows would only make every preview heavier.
  doc.querySelectorAll('style[data-deck-type]').forEach(node => node.remove())
  doc.querySelectorAll('head style').forEach(node => {
    node.textContent = (node.textContent ?? '').replace(LEGACY_FACE, '')
  })
  const rest = [...tokens].filter(([name]) => !name.startsWith('--slide-'))
  root.setAttribute('style', rest.map(([name, value]) => `${name}: ${value}`).join('; '))
  const used = `${doc.head?.innerHTML ?? ''}\n${doc.body?.innerHTML ?? ''}`

  const wanted = new Set<string>()
  const add = (name: string | null) => {
    const family = name ? bundledFamily(name) : undefined
    if (family) wanted.add(family.family)
  }
  const token = (name: string) => firstFamily(resolveVars(tokens.get(name) ?? '', tokens))
  add(token('--slide-body-font'))
  if (/var\(--slide-heading-font|<h[1-3][\s>]/i.test(used)) add(token('--slide-heading-font'))
  if (/var\(--slide-mono-font|<(code|pre|kbd|samp)[\s>]/i.test(used)) add(token('--slide-mono-font'))
  for (const family of BUNDLED_FAMILIES) {
    const named = new RegExp(`(["']|&quot;|font-family:\\s*)${family.family.replace(/ /g, '\\s+')}\\b`, 'i')
    if (named.test(used)) wanted.add(family.family)
  }
  const italic =
    /italic|<(em|i|cite)[\s>]/i.test(used) ||
    (tokens.get('--slide-quote-style') === 'italic' && used.includes('var(--slide-quote-style'))

  const families = BUNDLED_FAMILIES.filter(family => wanted.has(family.family))
  const faces = fontFaceRules(families, italic)
  return `${faces ? `${faces}\n` : ''}${BASE_RULES}`
}

/**
 * The deck with its type stylesheet current. Returns the input itself when
 * nothing would change, so an edit that does not touch type does not touch
 * the bytes either.
 */
export function withDeckType(html: string): string {
  const css = deckTypeCss(html)
  if (css !== null && LEGACY_FACE.test(html)) html = html.replace(LEGACY_FACE, '')
  const existing = MANAGED.exec(html)
  if (css === null) {
    // A deck that dropped its tokens keeps no stale faces.
    return existing && /data-deck-id|id=["']deck["']/.test(html) && hasNoTokens(html)
      ? html.replace(MANAGED, '')
      : html
  }
  const block = `<style data-deck-type>\n${css}\n</style>\n`
  if (existing) {
    return existing[0] === block ? html : html.replace(MANAGED, () => block)
  }
  const head = /<\/head\s*>/i.exec(html)
  if (!head) return html
  return `${html.slice(0, head.index)}${block}${html.slice(head.index)}`
}

function hasNoTokens(html: string): boolean {
  if (typeof DOMParser === 'undefined') return false
  const root = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('[data-deck-id], #deck')
  return !!root && !parseStyle(root.getAttribute('style')).has('--slide-body-font')
}

/** The bundled font files the deck's stylesheet points at, as `fonts/<file>`. */
export function deckFontFiles(html: string): string[] {
  const block = MANAGED.exec(html)?.[0] ?? ''
  const files = [...block.matchAll(/url\("assets\/(fonts\/[^"]+\.woff2)"\)/g)].map(match => match[1])
  return [...new Set(files)]
}
