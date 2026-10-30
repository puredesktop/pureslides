/**
 * Typography a room will notice.
 *
 * These read the markup, not a layout: a size, a colour, a measure is
 * resolved from inline styles and the look's tokens on the deck root, the
 * way the slide declares it. Where a declaration cannot be resolved (a
 * class from the author's own stylesheet, a calc()) the element is left
 * alone rather than guessed at, and where a check has to estimate — how
 * many characters fit on a line — it estimates generously, so a warning
 * means something. Every finding is a warning: none blocks presenting.
 */
import type { CheckFinding } from './checkDeck'
import { MIN_TEXT_PX } from './deckLooks'
import { bundledFamily } from '../fonts/registry'
import { parseStyle, resolveVars } from './inlineStyle'

/** More than this on one slide is read, not heard. */
export const MAX_SLIDE_WORDS = 60
/** Past this many characters a line is hard to follow back to its start. */
export const MAX_LINE_CHARS = 75
/** The average advance of a character, in em, for a text face. */
const CHAR_EM = 0.5

const SKIP = 'script, style, template, video, audio, [data-bg], [aria-hidden="true"], [hidden]'
const GENERIC = /^(inherit|initial|unset|revert|system-ui|-apple-system|blinkmacsystemfont|sans-serif|serif|monospace|cursive|fantasy|ui-sans-serif|ui-serif|ui-monospace|ui-rounded|emoji|math)$/i

type Styles = Map<Element, Map<string, string>>

interface Context {
  tokens: Map<string, string>
  styles: Styles
  width: number
}

function styleOf(element: Element, context: Context): Map<string, string> {
  let style = context.styles.get(element)
  if (!style) {
    style = parseStyle(element.getAttribute('style'))
    context.styles.set(element, style)
  }
  return style
}

function declared(element: Element, property: string, context: Context): string | null {
  const value = styleOf(element, context).get(property)
  return value == null ? null : resolveVars(value, context.tokens)
}

/** The nearest declared value up the tree, stopping at the deck root. */
function inherited(element: Element, property: string, context: Context): { value: string; from: Element } | null {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const value = declared(node, property, context)
    if (value) return { value, from: node }
    if (node.matches('[data-deck-id], #deck')) break
  }
  return null
}

function px(value: string | null, relativeTo: number | null): number | null {
  if (!value) return null
  const match = /^(-?[\d.]+)(px|em|rem|%)?$/.exec(value.trim())
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const unit = match[2] ?? 'px'
  if (unit === 'px') return amount
  if (unit === 'rem') return amount * 16
  if (relativeTo == null) return null
  return unit === '%' ? (amount / 100) * relativeTo : amount * relativeTo
}

/** The font size an element renders at, or null when its declaration cannot be read. */
function fontSize(element: Element, context: Context): number | null {
  const found = inherited(element, 'font-size', context)
  if (!found) return null
  const raw = found.value.trim()
  if (/(em|%)$/.test(raw) && !/rem$/.test(raw)) {
    const parent = found.from.parentElement
    const base = parent ? fontSize(parent, context) : null
    return px(raw, base ?? 16)
  }
  return px(raw, null)
}

function fontWeight(element: Element, context: Context): number {
  const value = inherited(element, 'font-weight', context)?.value ?? ''
  if (/bold/i.test(value)) return 700
  const number = Number(value)
  if (Number.isFinite(number) && number > 0) return number
  return /^H[1-3]$/.test(element.tagName) ? 700 : 400
}

function ownText(element: Element): string {
  return [...element.childNodes]
    .filter(node => node.nodeType === 3)
    .map(node => node.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function textElements(slide: Element): Element[] {
  return [slide, ...slide.querySelectorAll('*')].filter(
    element => !element.closest(SKIP) && ownText(element).length > 0,
  )
}

function visibleText(slide: Element): string {
  const copy = slide.cloneNode(true) as Element
  copy.querySelectorAll(SKIP).forEach(node => node.remove())
  // Text nodes joined with a space: a headline and the line under it are two words, not one.
  const parts: string[] = []
  const walk = (node: Node) => {
    if (node.nodeType === 3) parts.push(node.textContent ?? '')
    node.childNodes.forEach(walk)
  }
  walk(copy)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

// ── colour ──────────────────────────────────────────────────────────────

type Rgba = [number, number, number, number]

const NAMED: Record<string, Rgba> = {
  white: [255, 255, 255, 1],
  black: [0, 0, 0, 1],
  transparent: [0, 0, 0, 0],
}

function parseColor(value: string | null): Rgba | null {
  if (!value) return null
  const text = value.trim().toLowerCase()
  if (NAMED[text]) return NAMED[text]
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)
  if (hex) {
    let digits = hex[1]
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map(d => d + d).join('')
    if (digits.length !== 6 && digits.length !== 8) return null
    const channel = (at: number) => parseInt(digits.slice(at, at + 2), 16)
    return [channel(0), channel(2), channel(4), digits.length === 8 ? channel(6) / 255 : 1]
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text)
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(part => (part.endsWith('%') ? (Number(part.slice(0, -1)) / 100) * 255 : Number(part)))
    if (parts.length < 3 || parts.slice(0, 3).some(part => !Number.isFinite(part))) return null
    const alpha = parts[3] === undefined ? 1 : parts[3] > 1 ? parts[3] / 255 : parts[3]
    return [parts[0], parts[1], parts[2], alpha]
  }
  return null
}

function luminance([r, g, b]: Rgba): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The solid ground behind an element, or null when it is a picture, a gradient or unknown. */
function groundOf(element: Element, context: Context): Rgba | null {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const background = declared(node, 'background-color', context) ?? declared(node, 'background', context)
    if (background) {
      if (/gradient|url\(/i.test(background)) return null
      const color = parseColor(background)
      if (!color) return null
      if (color[3] >= 1) return color
      if (color[3] > 0) return null
    }
    if (node.matches('[data-deck-id], #deck')) break
  }
  return parseColor(resolveVars('var(--slide-bg, #ffffff)', context.tokens))
}

// ── measure ─────────────────────────────────────────────────────────────

function horizontalPadding(style: Map<string, string>, tokens: Map<string, string>): number {
  const read = (name: string) => px(resolveVars(style.get(name) ?? '', tokens), null) ?? 0
  const padding = resolveVars(style.get('padding') ?? '', tokens)?.split(/\s+/).filter(Boolean) ?? []
  const fromShorthand =
    padding.length === 0
      ? 0
      : padding.length === 1
        ? 2 * (px(padding[0], null) ?? 0)
        : padding.length <= 3
          ? 2 * (px(padding[1], null) ?? 0)
          : (px(padding[1], null) ?? 0) + (px(padding[3], null) ?? 0)
  return fromShorthand + read('padding-left') + read('padding-right') + read('padding-inline') * 2
}

function widthLimit(value: string | null, size: number, available: number): number | null {
  if (!value) return null
  const ch = /^([\d.]+)ch$/.exec(value.trim())
  if (ch) return Number(ch[1]) * size * 0.55
  return px(value, available)
}

/** How wide an element's lines can run, estimated down the tree from the slide. */
function lineWidth(element: Element, slide: Element, context: Context): number {
  const chain: Element[] = []
  for (let node: Element | null = element; node && node !== slide.parentElement; node = node.parentElement) chain.unshift(node)
  let available = context.width
  for (const node of chain) {
    const style = styleOf(node, context)
    const parent = node.parentElement
    if (parent && node !== chain[0]) {
      const parentStyle = styleOf(parent, context)
      const display = resolveVars(parentStyle.get('display') ?? '', context.tokens) ?? ''
      const direction = parentStyle.get('flex-direction') ?? 'row'
      const siblings = [...parent.children].filter(child => !child.matches(SKIP))
      if (/grid/.test(display)) {
        const columns = parentStyle.get('grid-template-columns') ?? ''
        const repeat = /repeat\(\s*(\d+)/.exec(columns)
        const count = repeat ? Number(repeat[1]) : columns.split(/\s+(?![^(]*\))/).filter(Boolean).length || 1
        available /= Math.max(1, count)
      } else if (/flex/.test(display) && !/column/.test(direction) && siblings.length > 1) {
        const grow = (child: Element) => Number(/^([\d.]+)/.exec(styleOf(child, context).get('flex') ?? '')?.[1] ?? 1) || 1
        const total = siblings.reduce((sum, child) => sum + grow(child), 0)
        available *= grow(node) / total
      }
    }
    const size = fontSize(node, context) ?? 16
    for (const property of ['width', 'max-width']) {
      const limit = widthLimit(declared(node, property, context), size, available)
      if (limit != null && limit > 0) available = Math.min(available, limit)
    }
    available -= horizontalPadding(style, context.tokens)
  }
  return Math.max(0, available)
}

function wrapLines(words: string[], width: number, size: number): string[][] {
  const lines: string[][] = [[]]
  let used = 0
  for (const word of words) {
    const advance = (word.length + (lines.at(-1)!.length ? 1 : 0)) * size * 0.55
    if (lines.at(-1)!.length && used + advance > width) {
      lines.push([word])
      used = word.length * size * 0.55
    } else {
      lines.at(-1)!.push(word)
      used += advance
    }
  }
  return lines
}

/** "80%", "3×", "$1.2m", "12 d" — a number shown as a number, not a sentence. */
function isFigure(text: string): boolean {
  return text.length <= 10 && /\d/.test(text) && /^[\p{Sc}+\-−–]?[\d\s.,:/]+\s?(%|×|x|[\p{L}]{0,3})$/u.test(text)
}

// ── families ────────────────────────────────────────────────────────────

function isMonospace(stack: string): boolean {
  const first = stack.split(',')[0].trim().replace(/^["']|["']$/g, '')
  return bundledFamily(first)?.generic === 'monospace' || /\bmono|code\b|courier|consolas|menlo/i.test(first) || /,\s*(ui-)?monospace\s*$/i.test(stack)
}

function familiesUsed(doc: Document, root: Element, tokens: Map<string, string>): string[] {
  const stacks: string[] = []
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element.closest(SKIP)) continue
    const value = parseStyle(element.getAttribute('style')).get('font-family')
    if (value) stacks.push(resolveVars(value, tokens) ?? '')
  }
  for (const style of doc.querySelectorAll('style:not([data-deck-type])')) {
    for (const match of (style.textContent ?? '').matchAll(/font-family\s*:\s*([^;}]+)/gi)) stacks.push(resolveVars(match[1], tokens) ?? '')
  }
  // The type stylesheet sets the look's faces on every heading and paragraph.
  if (doc.querySelector('style[data-deck-type]')) {
    stacks.push(resolveVars('var(--slide-body-font, sans-serif)', tokens) ?? '')
    if (root.querySelector('h1, h2, h3')) stacks.push(resolveVars('var(--slide-heading-font, sans-serif)', tokens) ?? '')
  }
  const names = new Map<string, string>()
  for (const stack of stacks) {
    if (!stack || isMonospace(stack)) continue
    const first = stack.split(',')[0].trim().replace(/^["']|["']$/g, '')
    if (!first || GENERIC.test(first)) continue
    names.set(first.toLowerCase(), first)
  }
  return [...names.values()]
}

// ── the checks ──────────────────────────────────────────────────────────

export function typographyFindings(doc: Document, root: Element, slides: Element[]): CheckFinding[] {
  const findings: CheckFinding[] = []
  const tokens = parseStyle(root.getAttribute('style'))
  const width = Number(root.getAttribute('data-width')) || 1280
  const context: Context = { tokens, styles: new Map(), width }
  const minimum = Math.round(MIN_TEXT_PX * (width / 1280))
  const balancedByDefault = !!doc.querySelector('style[data-deck-type]')

  const families = familiesUsed(doc, root, tokens)
  if (families.length > 2) {
    findings.push({
      severity: 'warning',
      code: 'type-families',
      message: `the deck uses ${families.length} typefaces (${families.join(', ')})`,
      fix: 'keep to two — one for headings, one for text — through var(--slide-heading-font) and var(--slide-body-font); a monospace face for code does not count',
    })
  }

  slides.forEach((slide, index) => {
    const n = index + 1
    const texts = textElements(slide)

    const words = visibleText(slide).split(' ').filter(word => /[\p{L}\p{N}]/u.test(word)).length
    if (words > MAX_SLIDE_WORDS) {
      findings.push({
        severity: 'warning',
        code: 'type-words',
        slide: index,
        message: `slide ${n} has ${words} words on it`,
        fix: `a slide is heard, not read: keep it under ${MAX_SLIDE_WORDS} words and move the rest into the speaker notes`,
      })
    }

    const sized = texts
      .map(element => ({ element, size: fontSize(element, context) }))
      .filter((entry): entry is { element: Element; size: number } => entry.size != null)

    const smallest = sized.reduce<{ element: Element; size: number } | null>((low, entry) => (!low || entry.size < low.size ? entry : low), null)
    if (smallest && smallest.size < minimum - 0.5) {
      findings.push({
        severity: 'warning',
        code: 'type-too-small',
        slide: index,
        message: `slide ${n} has text at ${Math.round(smallest.size)}px, below the ${minimum}px a room can read`,
        fix: `set it to var(--slide-size-label) or larger; nothing on a slide ${width} wide reads under ${minimum}px from the back`,
      })
    }

    const headlines = sized.filter(entry => entry.element.tagName === 'H1')
    // A figure is meant to be the biggest thing on its slide; body text is not.
    const others = sized.filter(entry => !entry.element.closest('h1') && !isFigure(ownText(entry.element)))
    const headline = headlines.reduce<{ size: number } | null>((high, entry) => (!high || entry.size > high.size ? entry : high), null)
    const largest = others.reduce<{ size: number } | null>((high, entry) => (!high || entry.size > high.size ? entry : high), null)
    if (headline && largest && largest.size > headline.size + 0.5) {
      findings.push({
        severity: 'warning',
        code: 'type-hierarchy',
        slide: index,
        message: `the headline on slide ${n} (${Math.round(headline.size)}px) is smaller than text under it (${Math.round(largest.size)}px)`,
        fix: 'make the <h1> the largest words on the slide — var(--slide-size-headline) — or make the big words the headline',
      })
    }

    let longest = 0
    for (const { element, size } of sized) {
      if (/^H[1-6]$/.test(element.tagName) || element.closest('h1, h2, h3')) continue
      const text = ownText(element)
      if (text.length <= MAX_LINE_CHARS) continue
      const perLine = Math.min(text.length, lineWidth(element, slide, context) / (size * CHAR_EM))
      longest = Math.max(longest, Math.round(perLine))
    }
    if (longest > MAX_LINE_CHARS) {
      findings.push({
        severity: 'warning',
        code: 'type-measure',
        slide: index,
        message: `slide ${n} sets lines about ${longest} characters long`,
        fix: `cap the text at max-width: var(--slide-measure-body) (58ch) or split it; past ${MAX_LINE_CHARS} characters the eye loses the next line`,
      })
    }

    for (const { element, size } of headlines) {
      const wrap = declared(element, 'text-wrap', context) ?? declared(element, 'text-wrap-style', context)
      if (wrap ? /balance|pretty/.test(wrap) : balancedByDefault) continue
      const words = ownText(element).split(' ').filter(Boolean)
      if (words.length < 3) continue
      const lines = wrapLines(words, lineWidth(element, slide, context), size)
      if (lines.length > 1 && lines.at(-1)!.length === 1) {
        findings.push({
          severity: 'warning',
          code: 'type-widow',
          slide: index,
          message: `the headline on slide ${n} ends on one word ("${lines.at(-1)![0]}")`,
          fix: 'add text-wrap: balance to the <h1>, or join its last two words with &nbsp;',
        })
        break
      }
    }

    let weakest: { ratio: number; needed: number } | null = null
    for (const { element, size } of sized) {
      const color = parseColor(inherited(element, 'color', context)?.value ?? null)
      const ground = groundOf(element, context)
      if (!color || !ground || color[3] < 1) continue
      const large = size >= 24 || (size >= 18.66 && fontWeight(element, context) >= 700)
      const needed = large ? 3 : 4.5
      const ratio = contrastRatio(color, ground)
      if (ratio < needed && (!weakest || ratio / needed < weakest.ratio / weakest.needed)) weakest = { ratio, needed }
    }
    if (weakest) {
      findings.push({
        severity: 'warning',
        code: 'type-contrast',
        slide: index,
        message: `slide ${n} has text at ${weakest.ratio.toFixed(1)}:1 against its background, under the ${weakest.needed}:1 it needs`,
        fix: 'use var(--slide-ink) or var(--slide-muted) on the light ground and var(--slide-on-inverse) on the dark one; small text needs 4.5:1, large 3:1',
      })
    }
  })

  return findings
}
