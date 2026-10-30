/**
 * A look made for one organisation: its palette by role, its faces, its
 * shapes and its art — matched from a reference image or read from a saved
 * brand (`.designsystem.json`), never chosen from the seven stock looks.
 *
 * It lands exactly where a stock look does, as `--slide-*` tokens on the deck
 * root, so every block, check and export reads it without knowing it is
 * custom. What a token cannot hold rides on the root as data:
 *
 * - `data-look="custom"` and `data-look-name` — which look this is.
 * - `data-deck-faces` — the brand's own font files in the package
 *   (`assets/fonts/brand/…woff2`), which the derived type stylesheet turns
 *   into @font-face rules, so a deck in the brand's face travels.
 * - `data-motif-on="all"` — the motif goes behind every slide (a slide opts
 *   out with `data-motif="none"`); otherwise only behind slides that carry
 *   `data-motif` (`cover`, `right`, `left` or `faint`).
 *
 * Data only: names and hex colours are validated, files must sit in the
 * package's assets, and nothing here writes CSS an author typed.
 */
import { bundledFamily, familyStack } from '../fonts/registry'
import { parseStyle } from './inlineStyle'
import { lookTokens, typeScale, MIN_TEXT_PX } from './deckLooks'

export const CUSTOM_LOOK_ID = 'custom'

export type MotifPlacement = 'cover' | 'right' | 'left' | 'faint'

export interface CustomLookColors {
  bg: string
  ink: string
  muted: string
  accent: string
  surface: string
  line: string
  inverse: string
  onInverse: string
  inverseMuted: string
  /** A second accent: a headline's second line, a highlight word. */
  accent2: string
  /** A small bright note: a tag, a node, a rule. */
  highlight: string
}

export interface BrandFace {
  family: string
  /** A CSS weight: one value or a range. */
  weight: string
  style: 'normal' | 'italic'
  /** Inside the package: `assets/fonts/brand/<file>.woff2`. */
  file: string
}

export interface CustomLookSpec {
  name: string
  colors: CustomLookColors
  type: {
    heading: string
    body: string
    mono: string
    /** Which face sets the small tracked labels: the body face, or the brand's mono. */
    label: 'body' | 'mono'
    headingWeight: number
    bodyWeight: number
    strongWeight: number
    labelWeight: number
    headingCase: 'none' | 'upper'
    base: number
    ratio: number
    trackingDisplay: string
    trackingHeadline: string
    trackingLabel: string
  }
  /** Corner radius of cards and panels, px. */
  radius: number
  motif?: {
    /** Inside the package: `assets/…` (png, jpg, webp or svg). */
    file: string
    on: 'all' | 'marked'
    placement: MotifPlacement
    opacity: number
  }
  faces: BrandFace[]
}

const HEX = /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i
const FAMILY = /^[\w][\w\s'-]{0,79}$/
const FACE_FILE = /^assets\/fonts\/brand\/[\w.-]+\.woff2$/
const MOTIF_FILE = /^assets\/(?:[\w.-]+\/)*[\w. -]+\.(png|jpe?g|webp|svg)$/i
const TRACKING = /^-?\d*\.?\d+em$/
const WEIGHT = /^\d{3}(?: \d{3})?$/

export class CustomLookError extends Error {}

function expandHex(value: string): string {
  const hex = value.trim().toLowerCase()
  return hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
}

function rgb(hex: string): [number, number, number] {
  const value = expandHex(hex)
  return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)) as [number, number, number]
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
}

/** `a` moved `amount` (0–1) of the way to `b`. */
export function mix(a: string, b: string, amount: number): string {
  const x = rgb(a)
  const y = rgb(b)
  return toHex(x.map((v, i) => v + (y[i] - v) * amount))
}

export function luminance(hex: string): number {
  const c = rgb(hex)
    .map(v => v / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (hi + 0.05) / (lo + 0.05)
}

export const isDark = (hex: string) => luminance(hex) < 0.18

/** White or near-black, whichever reads on `ground`. */
export const readableOn = (ground: string) => (contrast('#ffffff', ground) >= contrast('#111111', ground) ? '#ffffff' : '#111111')

export interface CustomLookInput {
  name?: string
  colors?: Partial<CustomLookColors>
  type?: Partial<CustomLookSpec['type']>
  radius?: number
  motif?: CustomLookSpec['motif'] | null
  faces?: BrandFace[]
}

/**
 * A complete, valid look from whatever was given: the palette's missing roles
 * are derived from the ones given (a surface a step off the ground, a hairline
 * between them, an inverse panel in the accent), so a brand that names only a
 * ground, a text colour and an accent still gets every role.
 */
export function customLook(input: CustomLookInput): CustomLookSpec {
  const given = input.colors ?? {}
  for (const [role, value] of Object.entries(given)) {
    if (value !== undefined && !HEX.test(String(value)))
      throw new CustomLookError(`${role} must be a hex colour like #0b1220, not "${value}"`)
  }
  const color = (value: string | undefined) => (value ? expandHex(value) : undefined)
  const bg = color(given.bg) ?? '#ffffff'
  const ink = color(given.ink) ?? readableOn(bg)
  const accent = color(given.accent) ?? (isDark(bg) ? '#7aa2ff' : '#2f52c8')
  const dark = isDark(bg)
  const inverse = color(given.inverse) ?? accent
  const onInverse = color(given.onInverse) ?? readableOn(inverse)
  const colors: CustomLookColors = {
    bg,
    ink,
    muted: color(given.muted) ?? mix(ink, bg, dark ? 0.32 : 0.38),
    accent,
    surface: color(given.surface) ?? mix(bg, ink, dark ? 0.07 : 0.05),
    line: color(given.line) ?? mix(bg, ink, dark ? 0.18 : 0.16),
    inverse,
    onInverse,
    inverseMuted: color(given.inverseMuted) ?? mix(onInverse, inverse, 0.25),
    accent2: color(given.accent2) ?? accent,
    highlight: color(given.highlight) ?? accent,
  }

  const t = input.type ?? {}
  const family = (value: string | undefined, fallback: string, role: string) => {
    const name = (value ?? fallback).trim().replace(/^["']|["']$/g, '')
    if (!FAMILY.test(name)) throw new CustomLookError(`${role} must be a font-family name, not "${name}"`)
    return name
  }
  const weight = (value: number | undefined, fallback: number, role: string) => {
    const w = value ?? fallback
    if (!Number.isFinite(w) || w < 100 || w > 1000) throw new CustomLookError(`${role} must be a weight from 100 to 1000`)
    return Math.round(w)
  }
  const tracking = (value: string | undefined, fallback: string, role: string) => {
    const v = (value ?? fallback).trim()
    if (!TRACKING.test(v)) throw new CustomLookError(`${role} must be in em, like -0.03em`)
    return v
  }
  const heading = family(t.heading, 'Inter', 'heading')
  const base = t.base ?? 24
  if (!Number.isFinite(base) || base < MIN_TEXT_PX || base > 40) throw new CustomLookError(`base must be ${MIN_TEXT_PX}–40 px`)
  const ratio = t.ratio ?? 1.333
  if (!Number.isFinite(ratio) || ratio < 1.1 || ratio > 1.7) throw new CustomLookError('ratio must be 1.1–1.7')
  const headingWeight = weight(t.headingWeight, 700, 'headingWeight')
  const type: CustomLookSpec['type'] = {
    heading,
    body: family(t.body, heading, 'body'),
    mono: family(t.mono, 'IBM Plex Mono', 'mono'),
    label: t.label === 'mono' ? 'mono' : 'body',
    headingWeight,
    bodyWeight: weight(t.bodyWeight, 400, 'bodyWeight'),
    strongWeight: weight(t.strongWeight, Math.min(headingWeight, 640), 'strongWeight'),
    labelWeight: weight(t.labelWeight, 600, 'labelWeight'),
    headingCase: t.headingCase === 'upper' ? 'upper' : 'none',
    base: Math.round(base * 10) / 10,
    ratio,
    // Heavy display type wants it tighter than a book face does.
    trackingDisplay: tracking(t.trackingDisplay, headingWeight >= 700 ? '-0.035em' : '-0.02em', 'trackingDisplay'),
    trackingHeadline: tracking(t.trackingHeadline, headingWeight >= 700 ? '-0.025em' : '-0.012em', 'trackingHeadline'),
    trackingLabel: tracking(t.trackingLabel, t.label === 'mono' ? '0.16em' : '0.12em', 'trackingLabel'),
  }

  const radius = input.radius ?? 0
  if (!Number.isFinite(radius) || radius < 0 || radius > 64) throw new CustomLookError('radius must be 0–64 px')

  let motif: CustomLookSpec['motif']
  if (input.motif) {
    const file = input.motif.file.trim()
    if (!MOTIF_FILE.test(file)) throw new CustomLookError(`the motif must be a picture in the package's assets (assets/…png, jpg, webp or svg), not "${file}"`)
    const opacity = input.motif.opacity ?? 1
    if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) throw new CustomLookError('motif opacity must be above 0 and at most 1')
    const placement = input.motif.placement ?? 'cover'
    if (!['cover', 'right', 'left', 'faint'].includes(placement)) throw new CustomLookError('motif placement is cover, right, left or faint')
    motif = { file, on: input.motif.on === 'marked' ? 'marked' : 'all', placement, opacity }
  }

  const faces = (input.faces ?? []).map(face => {
    if (!FAMILY.test(face.family)) throw new CustomLookError(`brand face family "${face.family}" is not a font-family name`)
    if (!FACE_FILE.test(face.file)) throw new CustomLookError(`brand face ${face.family} must be a woff2 in assets/fonts/brand/`)
    if (!WEIGHT.test(face.weight)) throw new CustomLookError(`brand face ${face.family} weight must be like 700 or 100 900`)
    return { family: face.family, weight: face.weight, style: face.style === 'italic' ? 'italic' : 'normal', file: face.file } as BrandFace
  })

  return { name: (input.name ?? 'Custom').trim().slice(0, 80) || 'Custom', colors, type, radius, motif, faces }
}

/** The CSS font-family stack for a face: bundled, the brand's own, or (said plainly by `fontNotes`) a fallback. */
function stack(name: string, faces: BrandFace[], generic: 'sans-serif' | 'monospace'): string {
  if (bundledFamily(name)) return familyStack(name)
  if (faces.some(face => face.family.toLowerCase() === name.toLowerCase()))
    return `'${name}', ${generic === 'monospace' ? 'ui-monospace, monospace' : 'system-ui, sans-serif'}`
  return familyStack(name)
}

/** Faces the deck names but neither ships nor carries: they will fall back on another computer. */
export function fontNotes(spec: CustomLookSpec): string[] {
  const carried = (name: string) => bundledFamily(name) || spec.faces.some(face => face.family.toLowerCase() === name.toLowerCase())
  return [...new Set([spec.type.heading, spec.type.body, spec.type.mono])]
    .filter(name => !carried(name))
    .map(name => `${name} is neither bundled nor among the brand's font files, so it will not travel with the deck: pick the closest bundled face (listLookFonts) or give the brand's woff2.`)
}

/** Every token the look sets, by name without `--slide-`: the stock set, then what only a custom look has. */
export function customLookTokens(spec: CustomLookSpec): Record<string, string> {
  const { colors, type } = spec
  const scale = typeScale(type)
  const heading = stack(type.heading, spec.faces, 'sans-serif')
  const body = stack(type.body, spec.faces, 'sans-serif')
  const mono = stack(type.mono, spec.faces, 'monospace')
  return {
    ...lookTokens('auto'),
    bg: colors.bg,
    ink: colors.ink,
    muted: colors.muted,
    accent: colors.accent,
    surface: colors.surface,
    line: colors.line,
    inverse: colors.inverse,
    'on-inverse': colors.onInverse,
    'inverse-muted': colors.inverseMuted,
    'accent-2': colors.accent2,
    highlight: colors.highlight,
    'heading-font': heading,
    'body-font': body,
    'mono-font': mono,
    'label-font': type.label === 'mono' ? mono : body,
    'heading-weight': String(type.headingWeight),
    'body-weight': String(type.bodyWeight),
    'strong-weight': String(type.strongWeight),
    'label-weight': String(type.labelWeight),
    'heading-case': type.headingCase === 'upper' ? 'uppercase' : 'none',
    'size-label': `${scale.label}px`,
    'size-body': `${scale.body}px`,
    'size-lead': `${scale.lead}px`,
    'size-headline': `${scale.headline}px`,
    'size-display': `${scale.display}px`,
    'size-stat': `${scale.stat}px`,
    'leading-display': type.headingWeight >= 700 ? '1.02' : '1.04',
    'leading-headline': '1.08',
    'leading-lead': '1.34',
    'leading-body': '1.48',
    'tracking-display': type.trackingDisplay,
    'tracking-headline': type.trackingHeadline,
    'tracking-body': '0em',
    'tracking-label': type.trackingLabel,
    radius: `${spec.radius}px`,
    'quote-style': 'normal',
    'quote-weight': String(Math.min(type.headingWeight, 600)),
    ...(spec.motif ? { motif: `url("${spec.motif.file}")`, 'motif-opacity': String(spec.motif.opacity) } : {}),
  }
}

const CUSTOM_ONLY = ['--slide-motif', '--slide-motif-opacity']

function deckRoot(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('[data-deck-id], #deck')
}

/** The deck wearing the custom look. Only tokens and root data change; slides and author styles stay byte-identical. */
export function withCustomLook(html: string, spec: CustomLookSpec): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = deckRoot(doc)
  if (!root) return html
  for (const name of CUSTOM_ONLY) root.style.removeProperty(name)
  for (const [key, value] of Object.entries(customLookTokens(spec))) root.style.setProperty(`--slide-${key}`, value)
  root.dataset.look = CUSTOM_LOOK_ID
  root.setAttribute('data-look-name', spec.name)
  if (spec.faces.length) root.setAttribute('data-deck-faces', JSON.stringify(spec.faces))
  else root.removeAttribute('data-deck-faces')
  if (spec.motif) {
    root.setAttribute('data-motif-on', spec.motif.on)
    root.setAttribute('data-motif-placement', spec.motif.placement)
  } else {
    root.removeAttribute('data-motif-on')
    root.removeAttribute('data-motif-placement')
  }
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
}

/** The brand faces the deck carries, validated; anything malformed is ignored rather than trusted. */
export function deckFaces(root: Element | null): BrandFace[] {
  const raw = root?.getAttribute('data-deck-faces')
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.filter(
      (face): face is BrandFace =>
        face && typeof face === 'object' && FAMILY.test(String(face.family)) && FACE_FILE.test(String(face.file)) && WEIGHT.test(String(face.weight)) && (face.style === 'normal' || face.style === 'italic'),
    )
  } catch {
    return []
  }
}

const first = (value: string | undefined) => value?.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? ''

/** The custom look a deck wears, read back from its root; null for a stock look or no deck. */
export function customLookFromHtml(html: string): CustomLookSpec | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = deckRoot(doc)
  if (!root || root.getAttribute('data-look') !== CUSTOM_LOOK_ID) return null
  const tokens = parseStyle(root.getAttribute('style'))
  const token = (name: string) => tokens.get(`--slide-${name}`)
  const hex = (name: string) => {
    const value = token(name)
    return value && HEX.test(value) ? value : undefined
  }
  const number = (name: string) => {
    const value = Number.parseFloat(token(name) ?? '')
    return Number.isFinite(value) ? value : undefined
  }
  const motifUrl = /url\("?([^")]+)"?\)/.exec(token('motif') ?? '')?.[1]
  const sizes = { body: number('size-body'), lead: number('size-lead') }
  try {
    return customLook({
      name: root.getAttribute('data-look-name') ?? 'Custom',
      colors: {
        bg: hex('bg'),
        ink: hex('ink'),
        muted: hex('muted'),
        accent: hex('accent'),
        surface: hex('surface'),
        line: hex('line'),
        inverse: hex('inverse'),
        onInverse: hex('on-inverse'),
        inverseMuted: hex('inverse-muted'),
        accent2: hex('accent-2'),
        highlight: hex('highlight'),
      },
      type: {
        heading: first(token('heading-font')) || undefined,
        body: first(token('body-font')) || undefined,
        mono: first(token('mono-font')) || undefined,
        label: token('label-font') && token('label-font') === token('mono-font') ? 'mono' : 'body',
        headingWeight: number('heading-weight'),
        bodyWeight: number('body-weight'),
        strongWeight: number('strong-weight'),
        labelWeight: number('label-weight'),
        headingCase: token('heading-case') === 'uppercase' ? 'upper' : 'none',
        base: sizes.body,
        ratio: sizes.body && sizes.lead ? Math.round((sizes.lead / sizes.body) * 1000) / 1000 : undefined,
        trackingDisplay: token('tracking-display'),
        trackingHeadline: token('tracking-headline'),
        trackingLabel: token('tracking-label'),
      },
      radius: number('radius'),
      motif: motifUrl
        ? {
            file: motifUrl,
            on: root.getAttribute('data-motif-on') === 'marked' ? 'marked' : 'all',
            placement: (root.getAttribute('data-motif-placement') as MotifPlacement) ?? 'cover',
            opacity: number('motif-opacity') ?? 1,
          }
        : null,
      faces: deckFaces(root),
    })
  } catch {
    return null
  }
}

/** Pairs that must read, with what they measure: the agent hears about any that do not. */
export function contrastNotes(spec: CustomLookSpec): string[] {
  const { colors } = spec
  const pairs: [string, string, string, number][] = [
    ['text on the ground', colors.ink, colors.bg, 4.5],
    ['muted text on the ground', colors.muted, colors.bg, 4.5],
    ['accent on the ground', colors.accent, colors.bg, 3],
    ['second accent on the ground', colors.accent2, colors.bg, 3],
    ['text on a card', colors.ink, colors.surface, 4.5],
    ['text on the inverse panel', colors.onInverse, colors.inverse, 4.5],
  ]
  return pairs
    .filter(([, fg, bg, min]) => contrast(fg, bg) < min)
    .map(([what, fg, bg, min]) => `${what} is ${contrast(fg, bg).toFixed(2)}:1 (${fg} on ${bg}); it needs ${min}:1`)
}
