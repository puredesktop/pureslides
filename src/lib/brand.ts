/**
 * An organisation's brand, as the suite saves it: a `pure-design-system`
 * (version 1) file, `<name>.designsystem.json`, with its files beside it in
 * `<name>.brand/` — fonts (woff2), logos, motifs (generated art, PNG first)
 * and the reference images it was read from. Canvas, PureSite and PureDesign
 * read and write the same format (ps-suite packages/ui/src/design/brief.ts),
 * so a look made here travels to them and back.
 *
 * This reader mirrors the shared validator, field for field, so the app works
 * on desktops whose suite predates the brand fields; anything it cannot
 * validate it refuses rather than guesses. Data only: no CSS, no scripts, no
 * remote URLs, no paths outside the brand's folder.
 */
import { BUNDLED_FAMILIES, bundledFamily } from '../fonts/registry'
import type { BrandFace, CustomLookInput, CustomLookSpec } from './customLook'

export const DESIGN_SYSTEM_SUFFIX = '.designsystem.json'

export const BRAND_PALETTE_ROLES = ['background', 'surface', 'text', 'muted', 'accent', 'accent2', 'highlight', 'border'] as const
export type BrandPaletteRole = (typeof BRAND_PALETTE_ROLES)[number]

export interface BrandFile {
  format: 'pure-design-system'
  version: 1
  id: string
  name: string
  revision: string
  guidelines: string[]
  tokens: {
    colors?: Partial<Record<'background' | 'surface' | 'text' | 'muted' | 'accent' | 'onAccent' | 'border', string>> & {
      palette?: { name: string; hex: string; role?: BrandPaletteRole }[]
    }
    typography?: { body?: string; display?: string; mono?: string; displayWeight?: number; headingCase?: 'none' | 'upper' }
    radius?: number
    spacing?: number
  }
  components: { name: string; source: string; usage: string }[]
  fonts?: { family: string; weight?: number; style?: 'normal' | 'italic'; file: string; licence: string; source?: string }[]
  logos?: { name: string; file: string; onDark?: boolean }[]
  motifs?: { name: string; description: string; file?: string }[]
  references?: { file: string; note?: string }[]
  voice?: string[]
}

export class BrandError extends Error {}

const HEX = /^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i
const FONT = /^[\w\s,'"-]+$/
const IMAGE = ['png', 'jpg', 'jpeg', 'webp', 'svg']

const object = (v: unknown, what: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BrandError(`${what} must be an object`)
  return v as Record<string, unknown>
}
const text = (v: unknown, what: string, limit = 6000): string => {
  if (typeof v !== 'string' || v.length > limit) throw new BrandError(`${what} must be text`)
  return v
}
const list = (v: unknown, what: string, max: number): unknown[] => {
  if (!Array.isArray(v) || v.length > max) throw new BrandError(`${what} must be a list of at most ${max}`)
  return v
}
const hex = (v: unknown, what: string) => {
  const value = text(v, what, 9)
  if (!HEX.test(value)) throw new BrandError(`${what} must be a hex colour`)
  return value
}
const font = (v: unknown, what: string) => {
  const value = text(v, what, 200)
  if (!FONT.test(value)) throw new BrandError(`${what} must be a font-family name, not CSS or a URL`)
  return value
}
const weight = (v: unknown, what: string) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 1000) throw new BrandError(`${what} must be a weight`)
  return v
}

/** A file named relative to the brand file: never absolute, never `..`, never a URL. */
export function brandRelativeFile(v: unknown, what: string, extensions: readonly string[]): string {
  const file = text(v, what, 500).replace(/\\/g, '/')
  if (!file || file.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(file) || file.split('/').some(part => part === '..' || part === ''))
    throw new BrandError(`${what} must be a relative path beside the design system`)
  const extension = file.split('.').pop()?.toLowerCase() ?? ''
  if (!extensions.includes(extension)) throw new BrandError(`${what} must be ${extensions.join(', ')}`)
  return file
}

export function parseBrand(raw: string): BrandFile {
  if (raw.length > 8_000_000) throw new BrandError('the design system is over 8 MB')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new BrandError('the design system is not JSON')
  }
  const v = object(value, 'the design system')
  if (v.format !== 'pure-design-system' || v.version !== 1) throw new BrandError('choose a version 1 Pure design system (.designsystem.json)')
  const source = object(v.tokens ?? {}, 'tokens')
  const tokens: BrandFile['tokens'] = {}
  if (source.colors !== undefined) {
    const colors = object(source.colors, 'tokens.colors')
    tokens.colors = {}
    for (const key of ['background', 'surface', 'text', 'muted', 'accent', 'onAccent', 'border'] as const)
      if (colors[key] !== undefined) tokens.colors[key] = hex(colors[key], `colors.${key}`)
    if (colors.palette !== undefined)
      tokens.colors.palette = list(colors.palette, 'palette', 64).map((entry, i) => {
        const c = object(entry, `palette[${i}]`)
        if (c.role !== undefined && !(BRAND_PALETTE_ROLES as readonly unknown[]).includes(c.role))
          throw new BrandError(`palette roles are ${BRAND_PALETTE_ROLES.join(', ')}`)
        return { name: text(c.name, 'palette name', 100), hex: hex(c.hex, `palette[${i}].hex`), ...(c.role ? { role: c.role as BrandPaletteRole } : {}) }
      })
  }
  if (source.typography !== undefined) {
    const t = object(source.typography, 'tokens.typography')
    tokens.typography = {}
    for (const key of ['body', 'display', 'mono'] as const) if (t[key] !== undefined) tokens.typography[key] = font(t[key], `typography.${key}`)
    if (t.displayWeight !== undefined) tokens.typography.displayWeight = weight(t.displayWeight, 'displayWeight')
    if (t.headingCase !== undefined) {
      if (t.headingCase !== 'none' && t.headingCase !== 'upper') throw new BrandError('headingCase is none or upper')
      tokens.typography.headingCase = t.headingCase
    }
  }
  if (source.radius !== undefined) {
    if (typeof source.radius !== 'number' || source.radius < 0 || source.radius > 100) throw new BrandError('radius must be 0–100')
    tokens.radius = source.radius
  }
  if (source.spacing !== undefined) {
    if (typeof source.spacing !== 'number' || source.spacing < 0 || source.spacing > 200) throw new BrandError('spacing must be 0–200')
    tokens.spacing = source.spacing
  }
  return {
    format: 'pure-design-system',
    version: 1,
    id: text(v.id, 'id', 200),
    name: text(v.name, 'name', 200),
    revision: text(v.revision ?? '1', 'revision', 200),
    tokens,
    guidelines: list(v.guidelines ?? [], 'guidelines', 100).map(g => text(g, 'guideline')),
    components: list(v.components ?? [], 'components', 200).map(c => {
      const item = object(c, 'component')
      return { name: text(item.name, 'component name', 200), source: text(item.source, 'component source', 500), usage: text(item.usage, 'component usage') }
    }),
    ...(v.fonts !== undefined
      ? {
          fonts: list(v.fonts, 'fonts', 32).map(entry => {
            const f = object(entry, 'font')
            if (f.style !== undefined && f.style !== 'normal' && f.style !== 'italic') throw new BrandError('font style is normal or italic')
            return {
              family: font(f.family, 'font family'),
              ...(f.weight !== undefined ? { weight: weight(f.weight, 'font weight') } : {}),
              ...(f.style !== undefined ? { style: f.style as 'normal' | 'italic' } : {}),
              file: brandRelativeFile(f.file, 'font file', ['woff2']),
              licence: text(f.licence, 'font licence', 200),
              ...(f.source !== undefined ? { source: text(f.source, 'font source', 500) } : {}),
            }
          }),
        }
      : {}),
    ...(v.logos !== undefined
      ? {
          logos: list(v.logos, 'logos', 32).map(entry => {
            const l = object(entry, 'logo')
            if (l.onDark !== undefined && typeof l.onDark !== 'boolean') throw new BrandError('onDark is true or false')
            return { name: text(l.name, 'logo name', 200), file: brandRelativeFile(l.file, 'logo file', IMAGE), ...(l.onDark !== undefined ? { onDark: l.onDark as boolean } : {}) }
          }),
        }
      : {}),
    ...(v.motifs !== undefined
      ? {
          motifs: list(v.motifs, 'motifs', 32).map(entry => {
            const m = object(entry, 'motif')
            return {
              name: text(m.name, 'motif name', 200),
              description: text(m.description, 'motif description', 2000),
              ...(m.file !== undefined ? { file: brandRelativeFile(m.file, 'motif file', IMAGE) } : {}),
            }
          }),
        }
      : {}),
    ...(v.references !== undefined
      ? {
          references: list(v.references, 'references', 32).map(entry => {
            const r = object(entry, 'reference')
            return { file: brandRelativeFile(r.file, 'reference file', IMAGE), ...(r.note !== undefined ? { note: text(r.note, 'reference note', 2000) } : {}) }
          }),
        }
      : {}),
    ...(v.voice !== undefined ? { voice: list(v.voice, 'voice', 50).map(line => text(line, 'voice', 1000)) } : {}),
  }
}

/**
 * Commercial and system faces a brand names, and the bundled open face that
 * reads closest to each. A brand that ships its own woff2 keeps its own face.
 */
const NEAREST: [RegExp, string][] = [
  [/^(helvetica( neue)?|arial|sf pro( display| text)?|san francisco|segoe ui|roboto|neue haas( grotesk)?|s[öo]hne|aktiv grotesk|suisse( int'?l)?|untitled sans|graphik)$/i, 'Inter'],
  [/^(futura( pt)?|century gothic|avant ?garde|itc avant garde|tw cen( mt)?|brandon( grotesque)?|circular( std)?|euclid( circular)?)$/i, 'Poppins'],
  [/^(gotham|proxima nova|montserrat|nexa|sofia pro|museo sans)$/i, 'Montserrat'],
  [/^(avenir( next)?|manrope|sf pro rounded|nunito sans)$/i, 'Manrope'],
  [/^(gilroy|tt commons|plus jakarta sans|general sans|satoshi)$/i, 'Plus Jakarta Sans'],
  [/^(dm sans|cera( pro)?|apercu|lato|open sans|source sans( pro| 3)?|noto sans)$/i, 'DM Sans'],
  [/^(gt america|founders grotesk|franklin gothic|libre franklin|akzidenz( grotesk)?|univers|frutiger|myriad( pro)?)$/i, 'Archivo'],
  [/^(georgia|times( new roman)?|tiempos( headline| text)?|garamond|eb garamond|caslon|baskerville|minion( pro)?|merriweather|lora|source serif( pro| 4)?|playfair( display)?)$/i, 'Newsreader'],
  [/^(sf mono|menlo|monaco|consolas|fira (code|mono)|source code pro|roboto mono|courier( new)?|space mono|ubuntu mono|jetbrains mono)$/i, 'JetBrains Mono'],
]

/** The bundled face for a family name: itself when bundled, else the closest, with a note saying so. */
export function nearestBundled(name: string, fallback: string): { family: string; note?: string } {
  const wanted = name.split(',')[0].trim().replace(/^["']|["']$/g, '')
  if (bundledFamily(wanted)) return { family: bundledFamily(wanted)!.family }
  for (const [pattern, family] of NEAREST)
    if (pattern.test(wanted)) return { family, note: `${wanted} is not an open face the deck can carry; using ${family}, the closest bundled face.` }
  return { family: fallback, note: `${wanted || 'The brand face'} is not bundled and has no font file; using ${fallback}. Give the brand's woff2 to use the real face.` }
}

/** The bundled faces, described, for an agent matching a brand's type. */
export function lookFontCatalogue() {
  return BUNDLED_FAMILIES.map(family => ({
    family: family.family,
    generic: family.generic,
    weights: [...new Set(family.faces.map(face => face.weight))].join(', '),
    ...(family.kind ? { like: family.kind } : {}),
  }))
}

export interface BrandCopy {
  /** Absolute source path beside the brand file. */
  from: string
  /** Where it goes inside the deck package. */
  to: string
}

export interface BrandLook {
  input: CustomLookInput
  copies: BrandCopy[]
  logos: { from: string; name: string; onDark: boolean }[]
  /** The motif that has art, if any, to copy and set behind the slides. */
  motif?: { from: string; to: string; name: string; description: string }
  /** Motifs with only a description: generate them (makeMotif) from that description. */
  motifIdeas: { name: string; description: string }[]
  notes: string[]
}

const safeName = (value: string) => value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
const baseName = (path: string) => path.split('/').pop() ?? path
const dirOf = (path: string) => path.replace(/\/[^/]*$/, '')

const roleColor = (brand: BrandFile, role: BrandPaletteRole) => brand.tokens.colors?.palette?.find(entry => entry.role === role)?.hex

/**
 * The look a brand describes, and the files to bring into the deck so it
 * travels: the brand's woff2 into `assets/fonts/brand/`, its motif art into
 * `assets/motifs/`, its logos into `assets/`.
 */
export function lookFromBrand(brand: BrandFile, brandPath: string): BrandLook {
  const dir = dirOf(brandPath)
  const colors = brand.tokens.colors ?? {}
  const t = brand.tokens.typography ?? {}
  const notes: string[] = []
  const copies: BrandCopy[] = []
  const faces: BrandFace[] = []
  for (const f of brand.fonts ?? []) {
    const to = `assets/fonts/brand/${safeName(baseName(f.file))}`
    copies.push({ from: `${dir}/${f.file}`, to })
    faces.push({ family: f.family.split(',')[0].trim().replace(/^["']|["']$/g, ''), weight: String(f.weight ?? 400), style: f.style ?? 'normal', file: to })
  }
  const carried = (name: string) => faces.some(face => face.family.toLowerCase() === name.toLowerCase())
  const face = (value: string | undefined, fallback: string) => {
    if (!value) return fallback
    const first = value.split(',')[0].trim().replace(/^["']|["']$/g, '')
    if (carried(first)) return first
    const near = nearestBundled(first, fallback)
    if (near.note) notes.push(near.note)
    return near.family
  }
  const heading = face(t.display, 'Inter')
  const body = face(t.body ?? t.display, heading)
  const mono = face(t.mono, 'IBM Plex Mono')

  const motifWithArt = (brand.motifs ?? []).find(m => m.file)
  const motif = motifWithArt
    ? { from: `${dir}/${motifWithArt.file}`, to: `assets/motifs/${safeName(baseName(motifWithArt.file!))}`, name: motifWithArt.name, description: motifWithArt.description }
    : undefined

  const input: CustomLookInput = {
    name: brand.name,
    colors: {
      bg: colors.background ?? roleColor(brand, 'background'),
      ink: colors.text ?? roleColor(brand, 'text'),
      muted: colors.muted ?? roleColor(brand, 'muted'),
      accent: colors.accent ?? roleColor(brand, 'accent'),
      surface: colors.surface ?? roleColor(brand, 'surface'),
      line: colors.border ?? roleColor(brand, 'border'),
      accent2: roleColor(brand, 'accent2'),
      highlight: roleColor(brand, 'highlight'),
      ...(colors.accent && colors.onAccent ? { inverse: colors.accent, onInverse: colors.onAccent } : {}),
    },
    type: {
      heading,
      body,
      mono,
      ...(t.mono ? { label: 'mono' as const } : {}),
      ...(t.displayWeight ? { headingWeight: t.displayWeight } : {}),
      ...(t.headingCase ? { headingCase: t.headingCase } : {}),
    },
    ...(brand.tokens.radius !== undefined ? { radius: Math.min(64, brand.tokens.radius) } : {}),
    faces,
    ...(motif ? { motif: { file: motif.to, on: 'all' as const, placement: 'cover' as const, opacity: 1 } } : {}),
  }
  // Short hex (#abc) and 8-digit hex with alpha are valid in a brand, not in a slide token: keep six digits.
  for (const [key, value] of Object.entries(input.colors ?? {})) {
    if (typeof value === 'string' && value.length === 9) (input.colors as Record<string, string>)[key] = value.slice(0, 7)
    if (typeof value === 'string' && value.length === 5) (input.colors as Record<string, string>)[key] = value.slice(0, 4)
  }
  return {
    input,
    copies,
    logos: (brand.logos ?? []).map(l => ({ from: `${dir}/${l.file}`, name: safeName(baseName(l.file)), onDark: Boolean(l.onDark) })),
    motif,
    motifIdeas: (brand.motifs ?? []).filter(m => !m.file).map(({ name, description }) => ({ name, description })),
    notes,
  }
}

export interface BrandSaveInput {
  spec: CustomLookSpec
  /** Where the brand goes: `<folder>/<slug>.designsystem.json`. */
  path: string
  id?: string
  guidelines?: string[]
  voice?: string[]
  /** Package files already in the deck, by role. */
  logos: { file: string; onDark: boolean }[]
  references: { file: string; note?: string }[]
  motifs: { name: string; description: string; file?: string }[]
  revision?: string
}

/**
 * The look written back as a brand, and the package files to copy beside it.
 * Bundled faces the look uses go too (they are OFL-1.1), so another app can
 * embed exactly the type the deck shows.
 */
export function brandFromLook(input: BrandSaveInput): { json: string; copies: { from: string; to: string }[] } {
  if (!input.path.endsWith(DESIGN_SYSTEM_SUFFIX)) throw new BrandError(`the brand file must end in ${DESIGN_SYSTEM_SUFFIX}`)
  const file = baseName(input.path)
  const folder = `${file.slice(0, -DESIGN_SYSTEM_SUFFIX.length)}.brand`
  const { spec } = input
  const { colors, type } = spec
  const copies: { from: string; to: string }[] = []
  const fonts: NonNullable<BrandFile['fonts']> = []
  for (const face of spec.faces) {
    const to = `${folder}/fonts/${baseName(face.file)}`
    copies.push({ from: face.file, to })
    fonts.push({ family: face.family, weight: Number.parseInt(face.weight, 10) || 400, style: face.style, file: to, licence: 'as supplied with the brand' })
  }
  for (const name of new Set([type.heading, type.body, type.mono])) {
    if (spec.faces.some(face => face.family.toLowerCase() === name.toLowerCase())) continue
    const family = bundledFamily(name)
    if (!family) continue
    for (const f of family.faces) {
      const to = `${folder}/fonts/${f.file}`
      if (copies.some(copy => copy.to === to)) continue
      copies.push({ from: `assets/fonts/${f.file}`, to })
      fonts.push({ family: family.family, weight: Number.parseInt(f.weight, 10) || 400, ...(f.style === 'italic' ? { style: 'italic' as const } : {}), file: to, licence: family.licence, source: family.source })
    }
  }
  const logos = input.logos.map(logo => {
    const to = `${folder}/logos/${baseName(logo.file)}`
    copies.push({ from: logo.file, to })
    return { name: baseName(logo.file).replace(/\.[^.]+$/, ''), file: to, ...(logo.onDark ? { onDark: true } : {}) }
  })
  const motifs = input.motifs.map(m => {
    if (!m.file) return { name: m.name, description: m.description }
    const to = `${folder}/motifs/${baseName(m.file)}`
    copies.push({ from: m.file, to })
    return { name: m.name, description: m.description, file: to }
  })
  const references = input.references.map(r => {
    const to = `${folder}/references/${baseName(r.file)}`
    copies.push({ from: r.file, to })
    return { file: to, ...(r.note ? { note: r.note } : {}) }
  })
  const role = (name: string, hex: string, r: BrandPaletteRole) => ({ name, hex, role: r })
  const brand: BrandFile = {
    format: 'pure-design-system',
    version: 1,
    id: input.id ?? safeName(spec.name.toLowerCase()),
    name: spec.name,
    revision: input.revision ?? new Date().toISOString().slice(0, 10),
    guidelines: input.guidelines ?? [],
    tokens: {
      colors: {
        background: colors.bg,
        surface: colors.surface,
        text: colors.ink,
        muted: colors.muted,
        accent: colors.accent,
        onAccent: colors.onInverse,
        border: colors.line,
        palette: [
          role('Ground', colors.bg, 'background'),
          role('Surface', colors.surface, 'surface'),
          role('Text', colors.ink, 'text'),
          role('Muted text', colors.muted, 'muted'),
          role('Accent', colors.accent, 'accent'),
          ...(colors.accent2 !== colors.accent ? [role('Second accent', colors.accent2, 'accent2')] : []),
          ...(colors.highlight !== colors.accent ? [role('Highlight', colors.highlight, 'highlight')] : []),
          role('Hairline', colors.line, 'border'),
        ],
      },
      typography: {
        display: type.heading,
        body: type.body,
        mono: type.mono,
        displayWeight: type.headingWeight,
        headingCase: type.headingCase,
      },
      radius: spec.radius,
    },
    components: [],
    ...(fonts.length ? { fonts } : {}),
    ...(logos.length ? { logos } : {}),
    ...(motifs.length ? { motifs } : {}),
    ...(references.length ? { references } : {}),
    ...(input.voice?.length ? { voice: input.voice } : {}),
  }
  // Written through the same validator it will be read with.
  parseBrand(JSON.stringify(brand))
  return { json: `${JSON.stringify(brand, null, 2)}\n`, copies }
}
