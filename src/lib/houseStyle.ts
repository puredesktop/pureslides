/**
 * The organisation's house style, as this app uses it.
 *
 * A desktop in an organisation managed by PureServer carries the org's
 * brands, one of them the default ("house style"). A NEW deck that nobody
 * gave a look or a reference starts in it; a deck that already has a look,
 * a reference, or a look somebody chose is never changed. These are the
 * rules, kept apart from the bridge so they can be tested on their own.
 */
import { lookFromHtml } from './deckLooks'
import { CUSTOM_LOOK_ID } from './customLook'
import { DESIGN_SYSTEM_SUFFIX } from './brand'

/** The organisation's default brand, as much of it as the app needs to show and apply it. */
export interface HouseStyle {
  id: string
  name: string
  /** The .designsystem.json file (absolute). */
  path: string
  organisation?: string
  /** Sample images (references), absolute paths: what an agent looks at first. */
  samples: string[]
}

/** A brand from the bridge's list, shaped for the agent: what it is, where, and whether it is the default. */
export interface BrandListing {
  id: string
  name: string
  source: string
  default: boolean
  path: string
  organisation?: string
  team?: string
  palette?: string[]
  fonts?: string[]
  logos?: number
  motifs?: number
  samples?: number
}

interface MaterialLike {
  role?: string | null
}

/**
 * Whether a deck should start in the house style: it wears a stock look
 * (a new deck wears `auto`), has no design reference, and nobody chose a
 * look for it.
 */
export function deckTakesHouseStyle(input: {
  html: string
  material: readonly MaterialLike[]
  chosen?: boolean
}): boolean {
  if (input.chosen) return false
  if (input.material.some(item => item.role === 'reference')) return false
  const look = lookFromHtml(input.html)
  if (!look) return false
  return look !== CUSTOM_LOOK_ID
}

/** The words that say which brand the deck is in. */
export function houseStyleCaption(name: string): string {
  return `In ${name}, your organisation’s house style.`
}

/** Whether the deck's custom look is the house style (by the name the look carries). */
export function wearsHouseStyle(
  lookName: string | null | undefined,
  houseStyle: Pick<HouseStyle, 'name'> | null | undefined,
): boolean {
  return Boolean(lookName && houseStyle && lookName.trim() === houseStyle.name.trim())
}

/** What the agent passed as `brand`: nothing, "none" (a stock look), a file path, or an id from listBrands. */
export type BrandArgument =
  | { kind: 'none' }
  | { kind: 'path'; path: string }
  | { kind: 'id'; id: string }

export function readBrandArgument(value: unknown): BrandArgument | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const text = value.trim()
  if (text.toLowerCase() === 'none') return { kind: 'none' }
  if (text.startsWith('/')) return { kind: 'path', path: text }
  return { kind: 'id', id: text }
}

/** A path argument that is a brand file, or the words that say what is wrong with it. */
export function brandPathProblem(path: string): string | null {
  if (!path.startsWith('/')) return 'brand must be an id from listBrands or the absolute path of a .designsystem.json file'
  if (!path.endsWith(DESIGN_SYSTEM_SUFFIX)) return `brand must be a ${DESIGN_SYSTEM_SUFFIX} file`
  return null
}

/** The bridge's brand entries, shaped for the agent: the default first, then as listed. */
export function brandListing(
  entries: readonly {
    id: string
    name: string
    source: string
    default: boolean
    path: string
    organisation?: string
    team?: string
    summary?: {
      palette?: { name: string; hex: string; role?: string }[]
      fonts?: string[]
      logos?: number
      motifs?: number
      samples?: number
    } | null
  }[],
): BrandListing[] {
  const sorted = [...entries].sort((a, b) => Number(b.default) - Number(a.default))
  return sorted.map(entry => ({
    id: entry.id,
    name: entry.name,
    source: entry.source,
    default: entry.default,
    path: entry.path,
    ...(entry.organisation ? { organisation: entry.organisation } : {}),
    ...(entry.team ? { team: entry.team } : {}),
    ...(entry.summary?.palette?.length
      ? { palette: entry.summary.palette.slice(0, 8).map(c => (c.role ? `${c.role} ${c.hex}` : `${c.name} ${c.hex}`)) }
      : {}),
    ...(entry.summary?.fonts?.length ? { fonts: entry.summary.fonts } : {}),
    ...(typeof entry.summary?.logos === 'number' ? { logos: entry.summary.logos } : {}),
    ...(typeof entry.summary?.motifs === 'number' ? { motifs: entry.summary.motifs } : {}),
    ...(typeof entry.summary?.samples === 'number' ? { samples: entry.summary.samples } : {}),
  }))
}

/** The most sample images one proposal carries (the bridge's limit). */
export const MAX_SAMPLE_IMAGES = 12

/**
 * The exported slide pictures to send, in slide order: the slides asked for
 * (zero-based), or the first twelve. Names are `slide-<n>.png`, numbered from 1.
 */
export function pickSlideImages(files: readonly string[], indexes?: readonly number[]): string[] {
  const numbered = files
    .map(file => ({ file, n: Number(/slide-(\d+)\.png$/i.exec(file)?.[1]) }))
    .filter(entry => Number.isInteger(entry.n) && entry.n > 0)
    .sort((a, b) => a.n - b.n)
  const wanted = indexes?.length ? numbered.filter(entry => indexes.includes(entry.n - 1)) : numbered
  return wanted.slice(0, MAX_SAMPLE_IMAGES).map(entry => entry.file)
}

/** The file name for a brand saved from a deck, inside its package: `brand/<slug>.designsystem.json`. */
export function deckBrandFile(packagePath: string, lookName: string): string {
  const slug = lookName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'brand'
  return `${packagePath.replace(/\/+$/, '')}/brand/${slug}${DESIGN_SYSTEM_SUFFIX}`
}
