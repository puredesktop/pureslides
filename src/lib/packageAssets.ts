/**
 * Preview/render asset parity.
 *
 * The package holds real files under `assets/`, and the document on disk
 * references them relatively — `assets/logo.png`, `assets/demo.mp4`. The
 * print and frame renderers load the document from the package, so those
 * paths resolve natively.
 *
 * The board cannot: every slide frame is a sandboxed srcDoc iframe with an
 * opaque origin, and a relative path in one resolves against the app's dev
 * server — a 404. So the frames inline. The rule this module fixes is WHAT
 * they inline: every asset the document references, read from disk
 * deterministically, capped by size with an explicit "too large to preview"
 * state, so what the board shows is what the render captures — and when it
 * is not, the app says so.
 *
 * The inlining is view-time only and must be undone before anything a frame
 * hands back is written to the document: an inline edit serializes from the
 * inlined DOM, and without `deinlineAssetUrls` every element typed into by
 * hand would commit megabytes of base64 into index.html.
 */
import { DECK_ASSETS_DIR } from '../constants'
import { BUNDLED_FONT_URLS } from '../fonts/urls'

/** Per-asset ceiling for inlining a picture into the preview. */
export const PREVIEW_ASSET_MAX_BYTES = 12 * 1024 * 1024
/** Videos are bigger by nature; past this they are named, not shown. */
export const PREVIEW_VIDEO_MAX_BYTES = 96 * 1024 * 1024

const VIDEO_NAME = /\.(mp4|webm|mov|m4v)$/i

/** The cap for one asset, by what it is. */
export function previewCapFor(name: string): number {
  return VIDEO_NAME.test(name) ? PREVIEW_VIDEO_MAX_BYTES : PREVIEW_ASSET_MAX_BYTES
}

// Scan source ranges rather than serializing a DOM: unrelated saved markup stays
// byte-for-byte intact. Consume whole attributes so copy in alt/title is not CSS.
const OPEN_TAG = /<[a-z][a-z0-9:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>/i
const HTML_PARTS = /<!--[\s\S]*?(?:-->|$)|<(script|textarea|title)(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1\s*>|<style(?=[\s/>])(?:[^"'<>]|"[^"]*"|'[^']*')*>[\s\S]*?<\/style\s*>|<[a-z][a-z0-9:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi
const ATTRIBUTES = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/g
const CSS_URLS = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\(\s*(?:"([^"]*)"|'([^']*)'|&(?:quot|#34|#x22);([^&]*)&(?:quot|#34|#x22);|&(?:apos|#39|#x27);([^&]*)&(?:apos|#39|#x27);|([^\s"'()]+))\s*\)/gi

type AssetReference = { path: string; raw: string; name: string; start: number; end: number; unquoted: boolean }

function assetReference(path: string, start: number, unquoted = false): AssetReference | null {
  // Attribute and function names ignore case; package paths do not.
  if (!/^(?:\.\/)?assets\//.test(path)) return null
  const raw = path.replace(/^(?:\.\/)?assets\//, '').split(/[?#]/)[0]
  let name = raw
  try {
    name = decodeURIComponent(raw)
  } catch {
    /* keep it as written */
  }
  return { path, raw, name, start, end: start + path.length, unquoted }
}

function* cssReferences(css: string, offset: number): Generator<AssetReference> {
  for (const match of css.matchAll(CSS_URLS)) {
    const path = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5]
    if (!path) continue
    const reference = assetReference(path, offset + match.index! + match[0].indexOf(path))
    if (reference) yield reference
  }
}

/** Discovery and replacement use the same source ranges, in document order. */
function* assetReferences(html: string): Generator<AssetReference> {
  for (const part of html.matchAll(HTML_PARTS)) {
    if (part[0].startsWith('<!--') || part[1]) continue
    const tag = part[0].match(OPEN_TAG)![0]
    const head = tag.match(/^<[a-z][a-z0-9:-]*/i)![0].length
    for (const attr of tag.slice(head, -1).matchAll(ATTRIBUTES)) {
      const value = attr[2] ?? attr[3] ?? attr[4]
      if (!value) continue
      const prefix = attr[0].match(/^[^=]+=\s*["']?/)![0].length
      const offset = part.index! + head + attr.index! + prefix
      if (/^(?:src|href|poster|xlink:href)$/i.test(attr[1])) {
        const reference = assetReference(value, offset, attr[4] !== undefined)
        if (reference) yield reference
      } else if (/^style$/i.test(attr[1])) {
        yield* cssReferences(value, offset)
      }
    }
    if (/^<style(?=[\s/>])/i.test(tag)) {
      yield* cssReferences(part[0].slice(tag.length, part[0].search(/<\/style\s*>$/i)), part.index! + tag.length)
    }
  }
}

/** Every package asset referenced by src, href, poster or CSS url(). */
export function referencedAssetNames(html: string): string[] {
  return [...new Set([...assetReferences(html)].map(reference => reference.name).filter(Boolean))]
}

/** Data URLs by asset name — the map the preview inlines from. */
export type PreviewAssetMap = Record<string, string>

/**
 * The map without its clips. A card, a measurement, a print preview show
 * a clip's box, not the clip: inlining tens of megabytes of video into
 * every frame of the strip costs memory the renderer does not have, and
 * a frame that does not play has no use for the bytes. Only a live frame
 * — the stage, presenting — gets the whole map.
 */
export function picturesOnly(previews: PreviewAssetMap): PreviewAssetMap {
  const kept: PreviewAssetMap = {}
  for (const [name, url] of Object.entries(previews)) {
    if (!VIDEO_NAME.test(name)) kept[name] = url
  }
  return kept
}

/** Why an asset is not in the preview map. */
export type PreviewAssetIssue = {
  name: string
  reason: 'too-large' | 'missing' | 'unreadable'
  bytes?: number
}

export interface PreviewAssets {
  inlined: PreviewAssetMap
  issues: PreviewAssetIssue[]
}

/**
 * Resolve the referenced assets from disk into data URLs, deterministically.
 *
 * `sizeOf` answers a file's size (or `null` when it is not there) so a file
 * past its cap is skipped without reading it; `read` fetches the data URL.
 * Already-loaded entries in `known` are reused so a re-resolve after an
 * edit costs nothing for files it has seen.
 */
export async function resolvePreviewAssets(
  html: string,
  options: {
    sizeOf: (name: string) => Promise<number | null>
    read: (name: string, maxBytes: number) => Promise<string>
    known?: PreviewAssetMap
    capFor?: (name: string) => number
  },
): Promise<PreviewAssets> {
  const capFor = options.capFor ?? previewCapFor
  const inlined: PreviewAssetMap = {}
  const issues: PreviewAssetIssue[] = []
  for (const name of referencedAssetNames(html)) {
    const known = options.known?.[name]
    if (known) {
      inlined[name] = known
      continue
    }
    const bytes = await options.sizeOf(name).catch(() => null)
    if (bytes === null) {
      issues.push({ name, reason: 'missing' })
      continue
    }
    const cap = capFor(name)
    if (bytes > cap) {
      issues.push({ name, reason: 'too-large', bytes })
      continue
    }
    try {
      inlined[name] = await options.read(name, cap)
    } catch {
      issues.push({ name, reason: 'unreadable', bytes })
    }
  }
  return { inlined, issues }
}

/**
 * The package holds real files; the preview inlines them.
 *
 * At view time only, `assets/<name>` references are swapped for data URLs.
 * The document on disk keeps its clean relative paths.
 */
export function inlineAssetUrls(html: string, previews: PreviewAssetMap): string {
  // The app ships the deck's faces, so every frame can show them without
  // reading the package: they are in the map before anything is read.
  previews = { ...BUNDLED_FONT_URLS, ...previews }
  let result = ''
  let cursor = 0
  for (const reference of assetReferences(html)) {
    const data = previews[reference.name] ?? previews[reference.raw]
    if (!data) continue
    // Data URLs contain '=' padding, so unquoted HTML values need quotes.
    const value = reference.unquoted ? `"${data}"` : data
    result += html.slice(cursor, reference.start) + value
    cursor = reference.end
  }
  return result + html.slice(cursor)
}

export interface DeinlineResult {
  html: string
  /** Data URLs that were NOT ours — genuinely pasted content, kept as is. */
  unknownDataUrls: number
  /** Asset names that were mapped back. */
  restored: string[]
}

/**
 * Undo `inlineAssetUrls` on markup a frame hands back: every data URL that
 * came from the preview map goes back to its `assets/<name>` path. A data
 * URL the map does not know is genuinely pasted content and stays —
 * counted, so the status can say so rather than silently keeping base64.
 */
export function deinlineAssetUrls(html: string, previews: PreviewAssetMap): DeinlineResult {
  previews = { ...BUNDLED_FONT_URLS, ...previews }
  let next = html
  const restored: string[] = []
  // Longest first, so the replacement is independent of map order.
  const entries = Object.entries(previews)
    .filter(([, url]) => url.startsWith('data:'))
    .sort((a, b) => b[1].length - a[1].length)
  for (const [name, url] of entries) {
    if (!next.includes(url)) continue
    // A decoded filename may contain spaces, quotes or CSS delimiters.
    // Restore a URL that is safe in both attributes and unquoted url().
    const path = name.replace(/[\s\x00-\x1f\x7f"'()%?#&]/g, char =>
      encodeURIComponent(char).replace(/['()]/g, delimiter =>
        `%${delimiter.charCodeAt(0).toString(16).toUpperCase()}`))
    next = next.split(url).join(`${DECK_ASSETS_DIR}/${path}`)
    restored.push(name)
  }
  const unknownDataUrls = (next.match(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/gi) ?? []).length
  return { html: next, unknownDataUrls, restored }
}

/** People words for what the preview could not show. */
export function previewIssuesMessage(issues: PreviewAssetIssue[]): string | null {
  if (!issues.length) return null
  const parts = issues.map(issue => {
    if (issue.reason === 'too-large') {
      const mb = issue.bytes ? ` (${Math.round(issue.bytes / 1024 / 1024)} MB)` : ''
      return `${DECK_ASSETS_DIR}/${issue.name} is too large to preview${mb} — the export will use it`
    }
    if (issue.reason === 'missing') {
      return `${DECK_ASSETS_DIR}/${issue.name} is referenced but not in the package`
    }
    return `${DECK_ASSETS_DIR}/${issue.name} could not be read for the preview`
  })
  return parts.join('; ')
}
