/**
 * The faces the app ships, and nothing else.
 *
 * A deck is presented in a room whose network cannot be trusted and printed
 * by renderers that have none, so a deck's type must travel with it. These
 * are open-licence (SIL OFL 1.1) faces, Latin subsets as woff2, taken from
 * the Fontsource packages named in `source`; their licences sit beside them
 * in `licenses/`. Newsreader Display is Newsreader's variable font pinned at
 * its display optical size (opsz 72), so a headline gets the display cut and
 * body text the text cut.
 *
 * Only metadata lives here — no bytes — so the type logic and its tests can
 * read the registry without loading 600 KB of fonts.
 */
export interface BundledFace {
  /** File name inside the package's `assets/fonts/`. */
  file: string
  style: 'normal' | 'italic'
  /** A CSS font-weight: one value, or a range for a variable face. */
  weight: string
}

export interface BundledFamily {
  family: string
  /** monospace faces are for code; they do not count against the two-family rule. */
  generic: 'sans-serif' | 'serif' | 'monospace'
  faces: BundledFace[]
  source: string
  licence: 'OFL-1.1'
}

export const FONT_DIR = 'fonts'

export const BUNDLED_FAMILIES: BundledFamily[] = [
  {
    family: 'Inter',
    generic: 'sans-serif',
    faces: [{ file: 'inter.woff2', style: 'normal', weight: '100 900' }],
    source: 'https://www.npmjs.com/package/@fontsource-variable/inter/v/5.3.0',
    licence: 'OFL-1.1',
  },
  {
    family: 'Space Grotesk',
    generic: 'sans-serif',
    faces: [{ file: 'space-grotesk.woff2', style: 'normal', weight: '300 700' }],
    source: 'https://www.npmjs.com/package/@fontsource-variable/space-grotesk/v/5.3.0',
    licence: 'OFL-1.1',
  },
  {
    family: 'IBM Plex Sans',
    generic: 'sans-serif',
    faces: [{ file: 'ibm-plex-sans.woff2', style: 'normal', weight: '100 700' }],
    source: 'https://www.npmjs.com/package/@fontsource-variable/ibm-plex-sans/v/5.3.0',
    licence: 'OFL-1.1',
  },
  {
    family: 'IBM Plex Mono',
    generic: 'monospace',
    faces: [
      { file: 'ibm-plex-mono-400.woff2', style: 'normal', weight: '400' },
      { file: 'ibm-plex-mono-600.woff2', style: 'normal', weight: '600' },
    ],
    source: 'https://www.npmjs.com/package/@fontsource/ibm-plex-mono/v/5.3.0',
    licence: 'OFL-1.1',
  },
  {
    family: 'Newsreader Display',
    generic: 'serif',
    faces: [
      { file: 'newsreader-display.woff2', style: 'normal', weight: '200 800' },
      { file: 'newsreader-display-italic.woff2', style: 'italic', weight: '200 800' },
    ],
    source: 'https://www.npmjs.com/package/@fontsource-variable/newsreader/v/5.3.0',
    licence: 'OFL-1.1',
  },
  {
    family: 'Newsreader',
    generic: 'serif',
    faces: [
      { file: 'newsreader.woff2', style: 'normal', weight: '200 800' },
      { file: 'newsreader-italic.woff2', style: 'italic', weight: '200 800' },
    ],
    source: 'https://www.npmjs.com/package/@fontsource-variable/newsreader/v/5.3.0',
    licence: 'OFL-1.1',
  },
  {
    family: 'Bricolage Grotesque',
    generic: 'sans-serif',
    faces: [{ file: 'bricolage-grotesque.woff2', style: 'normal', weight: '200 800' }],
    source: 'https://www.npmjs.com/package/@fontsource-variable/bricolage-grotesque/v/5.3.0',
    licence: 'OFL-1.1',
  },
  {
    family: 'Archivo',
    generic: 'sans-serif',
    faces: [{ file: 'archivo.woff2', style: 'normal', weight: '100 900' }],
    source: 'https://www.npmjs.com/package/@fontsource-variable/archivo/v/5.3.0',
    licence: 'OFL-1.1',
  },
  {
    family: 'Instrument Serif',
    generic: 'serif',
    faces: [
      { file: 'instrument-serif.woff2', style: 'normal', weight: '400' },
      { file: 'instrument-serif-italic.woff2', style: 'italic', weight: '400' },
    ],
    source: 'https://www.npmjs.com/package/@fontsource/instrument-serif/v/5.3.0',
    licence: 'OFL-1.1',
  },
  {
    family: 'Instrument Sans',
    generic: 'sans-serif',
    faces: [{ file: 'instrument-sans.woff2', style: 'normal', weight: '400 700' }],
    source: 'https://www.npmjs.com/package/@fontsource-variable/instrument-sans/v/5.3.0',
    licence: 'OFL-1.1',
  },
  {
    family: 'Atkinson Hyperlegible Next',
    generic: 'sans-serif',
    faces: [
      { file: 'atkinson-hyperlegible-next-400.woff2', style: 'normal', weight: '400' },
      { file: 'atkinson-hyperlegible-next-700.woff2', style: 'normal', weight: '700' },
    ],
    source: 'https://www.npmjs.com/package/@fontsource/atkinson-hyperlegible-next/v/5.3.0',
    licence: 'OFL-1.1',
  },
]

export function bundledFamily(name: string): BundledFamily | undefined {
  const wanted = name.trim().replace(/^["']|["']$/g, '').toLowerCase()
  return BUNDLED_FAMILIES.find(family => family.family.toLowerCase() === wanted)
}

/** A CSS font-family stack: the bundled face first, then its generic. */
export function familyStack(name: string): string {
  const family = bundledFamily(name)
  const generic = family?.generic ?? 'sans-serif'
  const fallback =
    generic === 'serif'
      ? 'Georgia, serif'
      : generic === 'monospace'
        ? 'ui-monospace, monospace'
        : 'system-ui, sans-serif'
  return `'${family?.family ?? name}', ${fallback}`
}
