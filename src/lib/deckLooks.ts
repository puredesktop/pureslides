import { familyStack } from '../fonts/registry'

/**
 * A look is a palette AND a type voice: a heading face, a body face, a
 * modular scale, and the leading and tracking each level wants. Every value
 * lands on the deck root as a `--slide-*` token, so previews and every
 * export agree, and the blocks pick up the hierarchy without knowing which
 * look they are in.
 */
interface LookType {
  heading: string
  body: string
  mono: string
  headingWeight: string
  bodyWeight: string
  /** Card titles, the emphasised line of a pair. */
  strongWeight: string
  labelWeight: string
  /** Body size in px at 1280 wide; every other size is a power of `ratio` from it. */
  base: number
  ratio: number
  leading: { display: number; headline: number; lead: number; body: number }
  tracking: { display: string; headline: string; body: string; label: string }
  quoteStyle: 'italic' | 'normal'
  quoteWeight: string
}

interface LookDefinition {
  id: string
  label: string
  note: string
  /** When to reach for it — said to the drafter and the agent. */
  use: string
  bg: string
  ink: string
  muted: string
  accent: string
  surface: string
  line: string
  inverse: string
  onInverse: string
  inverseMuted: string
  type: LookType
}

const LOOK_DEFINITIONS: LookDefinition[] = [
  {
    id: 'auto',
    label: 'Auto',
    note: 'Follow your references',
    use: 'A design reference or logo is attached; with nothing to read, a neutral Inter deck.',
    bg: '#f8f9fc',
    ink: '#192338',
    muted: '#4f5d76',
    accent: '#2f52c8',
    surface: '#eaf0fb',
    line: '#cdd6e6',
    inverse: '#192b55',
    onInverse: '#ffffff',
    inverseMuted: '#cad5ed',
    type: {
      heading: 'Inter',
      body: 'Inter',
      mono: 'IBM Plex Mono',
      headingWeight: '680',
      bodyWeight: '400',
      strongWeight: '620',
      labelWeight: '600',
      base: 24,
      ratio: 1.333,
      leading: { display: 1.02, headline: 1.08, lead: 1.32, body: 1.45 },
      tracking: { display: '-0.035em', headline: '-0.025em', body: '-0.006em', label: '0.12em' },
      quoteStyle: 'normal',
      quoteWeight: '480',
    },
  },
  {
    id: 'ink',
    label: 'Ink',
    note: 'Dark · precise · confident',
    use: 'Product and engineering talks, demos, anything shown in a dim room.',
    bg: '#182322',
    ink: '#f4f5ee',
    muted: '#b8c8c1',
    accent: '#c3e7a1',
    surface: '#253734',
    line: '#435b53',
    inverse: '#c3e7a1',
    onInverse: '#182322',
    inverseMuted: '#344d37',
    type: {
      heading: 'Space Grotesk',
      body: 'IBM Plex Sans',
      mono: 'IBM Plex Mono',
      headingWeight: '600',
      bodyWeight: '400',
      strongWeight: '600',
      labelWeight: '500',
      base: 24,
      ratio: 1.333,
      leading: { display: 1.0, headline: 1.06, lead: 1.32, body: 1.45 },
      tracking: { display: '-0.03em', headline: '-0.02em', body: '0em', label: '0.14em' },
      quoteStyle: 'normal',
      quoteWeight: '500',
    },
  },
  {
    id: 'paper',
    label: 'Paper',
    note: 'Warm · editorial · considered',
    use: 'Essays, research, culture, a talk that argues rather than sells.',
    bg: '#f7f2e8',
    ink: '#302b26',
    muted: '#6a5c51',
    accent: '#9c3f2b',
    surface: '#ebe2d4',
    line: '#d5c8b7',
    inverse: '#763d2c',
    onInverse: '#fff6e9',
    inverseMuted: '#e6cbbb',
    type: {
      heading: 'Newsreader Display',
      body: 'Newsreader',
      mono: 'IBM Plex Mono',
      headingWeight: '440',
      bodyWeight: '400',
      strongWeight: '600',
      labelWeight: '600',
      base: 25,
      ratio: 1.333,
      leading: { display: 1.04, headline: 1.1, lead: 1.34, body: 1.42 },
      tracking: { display: '-0.018em', headline: '-0.012em', body: '0em', label: '0.12em' },
      quoteStyle: 'italic',
      quoteWeight: '400',
    },
  },
  {
    id: 'signal',
    label: 'Signal',
    note: 'Bright · bold · expressive',
    use: 'Launches, pitches and keynotes: few words, large, one accent.',
    bg: '#ffffff',
    ink: '#121212',
    muted: '#555a63',
    accent: '#c22f08',
    surface: '#f3f1ee',
    line: '#dedad4',
    inverse: '#121212',
    onInverse: '#ffffff',
    inverseMuted: '#c9c6c1',
    type: {
      heading: 'Bricolage Grotesque',
      body: 'Inter',
      mono: 'IBM Plex Mono',
      headingWeight: '760',
      bodyWeight: '400',
      strongWeight: '640',
      labelWeight: '650',
      base: 24,
      ratio: 1.414,
      leading: { display: 0.96, headline: 1.02, lead: 1.3, body: 1.45 },
      tracking: { display: '-0.045em', headline: '-0.03em', body: '-0.006em', label: '0.12em' },
      quoteStyle: 'normal',
      quoteWeight: '600',
    },
  },
  {
    id: 'brief',
    label: 'Brief',
    note: 'Sober · dense · businesslike',
    use: 'Board updates, reports and reviews: tables, figures, more words per slide.',
    bg: '#fbfbfa',
    ink: '#14181f',
    muted: '#535c6a',
    accent: '#0b6b6b',
    surface: '#eef1f3',
    line: '#d6dbe0',
    inverse: '#14181f',
    onInverse: '#ffffff',
    inverseMuted: '#bcc4cf',
    type: {
      heading: 'Archivo',
      body: 'Archivo',
      mono: 'IBM Plex Mono',
      headingWeight: '700',
      bodyWeight: '400',
      strongWeight: '640',
      labelWeight: '640',
      base: 24,
      ratio: 1.25,
      leading: { display: 1.04, headline: 1.1, lead: 1.32, body: 1.45 },
      tracking: { display: '-0.025em', headline: '-0.018em', body: '0em', label: '0.1em' },
      quoteStyle: 'normal',
      quoteWeight: '500',
    },
  },
  {
    id: 'gallery',
    label: 'Gallery',
    note: 'Quiet · elegant · contemporary',
    use: 'Design, architecture, portfolios and brand stories, where the pictures lead.',
    bg: '#f3f1ec',
    ink: '#1a1a1a',
    muted: '#5c5852',
    accent: '#a8321f',
    surface: '#e7e3db',
    line: '#d3cec4',
    inverse: '#1a1a1a',
    onInverse: '#f3f1ec',
    inverseMuted: '#bdb8ae',
    type: {
      heading: 'Instrument Serif',
      body: 'Instrument Sans',
      mono: 'IBM Plex Mono',
      headingWeight: '400',
      bodyWeight: '400',
      strongWeight: '600',
      labelWeight: '550',
      base: 24,
      ratio: 1.414,
      leading: { display: 0.98, headline: 1.04, lead: 1.32, body: 1.45 },
      tracking: { display: '-0.02em', headline: '-0.01em', body: '0em', label: '0.14em' },
      quoteStyle: 'italic',
      quoteWeight: '400',
    },
  },
  {
    id: 'clear',
    label: 'Clear',
    note: 'Legible from the back row',
    use: 'Teaching, large or mixed rooms, readers with low vision: bigger type, highest contrast.',
    bg: '#ffffff',
    ink: '#0b0b0c',
    muted: '#3b3f46',
    accent: '#1747c4',
    surface: '#eef2f8',
    line: '#c9d1dd',
    inverse: '#0b1f4d',
    onInverse: '#ffffff',
    inverseMuted: '#d2dbef',
    type: {
      heading: 'Atkinson Hyperlegible Next',
      body: 'Atkinson Hyperlegible Next',
      mono: 'IBM Plex Mono',
      headingWeight: '700',
      bodyWeight: '400',
      strongWeight: '700',
      labelWeight: '700',
      base: 28,
      ratio: 1.3,
      leading: { display: 1.06, headline: 1.12, lead: 1.36, body: 1.5 },
      tracking: { display: '-0.015em', headline: '-0.01em', body: '0em', label: '0.08em' },
      quoteStyle: 'normal',
      quoteWeight: '400',
    },
  },
]

/** The smallest text a slide 1280 wide may carry; it scales with the frame. */
export const MIN_TEXT_PX = 18

const round = (value: number): number => Math.round(value * 10) / 10

/**
 * The scale, by name. Label is a step below body (never under the minimum),
 * lead a step above, headline three, display four, and the one big number
 * six — so a look with a wider ratio is more dramatic all the way up.
 */
export function typeScale(type: Pick<LookType, 'base' | 'ratio'>) {
  const step = (power: number) => round(type.base * type.ratio ** power)
  return {
    label: Math.max(MIN_TEXT_PX, step(-1)),
    body: type.base,
    lead: step(1),
    headline: step(3),
    display: step(4),
    stat: step(6),
  }
}

function lookFrom(definition: LookDefinition) {
  const { type } = definition
  return {
    ...definition,
    font: familyStack(type.heading),
    bodyFont: familyStack(type.body),
    monoFont: familyStack(type.mono),
    weight: type.headingWeight,
    scale: typeScale(type),
  }
}

export const DECK_LOOKS = LOOK_DEFINITIONS.map(lookFrom)

export type DeckLook = (typeof DECK_LOOKS)[number]

export function deckLook(id: string): DeckLook {
  return DECK_LOOKS.find(look => look.id === id) ?? DECK_LOOKS[0]
}

/** Every token a look sets, by name without the `--slide-` prefix. */
export function lookTokens(id: string): Record<string, string> {
  const look = deckLook(id)
  const { type, scale } = look
  return {
    bg: look.bg,
    ink: look.ink,
    muted: look.muted,
    accent: look.accent,
    surface: look.surface,
    line: look.line,
    inverse: look.inverse,
    'on-inverse': look.onInverse,
    'inverse-muted': look.inverseMuted,
    'heading-font': look.font,
    'body-font': look.bodyFont,
    'mono-font': look.monoFont,
    'heading-weight': type.headingWeight,
    'body-weight': type.bodyWeight,
    'strong-weight': type.strongWeight,
    'label-weight': type.labelWeight,
    'size-label': `${scale.label}px`,
    'size-body': `${scale.body}px`,
    'size-lead': `${scale.lead}px`,
    'size-headline': `${scale.headline}px`,
    'size-display': `${scale.display}px`,
    'size-stat': `${scale.stat}px`,
    'leading-display': String(type.leading.display),
    'leading-headline': String(type.leading.headline),
    'leading-lead': String(type.leading.lead),
    'leading-body': String(type.leading.body),
    'tracking-display': type.tracking.display,
    'tracking-headline': type.tracking.headline,
    'tracking-body': type.tracking.body,
    'tracking-label': type.tracking.label,
    'measure-display': '16ch',
    'measure-headline': '24ch',
    'measure-lead': '36ch',
    'measure-body': '58ch',
    'quote-style': type.quoteStyle,
    'quote-weight': type.quoteWeight,
  }
}

export function lookDeclarations(id: string): string {
  return (
    Object.entries(lookTokens(id))
      .map(([key, value]) => `--slide-${key}: ${value}`)
      .join('; ') + ';'
  )
}

/** Changes only our design tokens. Custom markup and inline author styles survive. */
export function withDeckLook(html: string, id: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector<HTMLElement>('[data-deck-id], #deck')
  if (!root) return html
  const look = deckLook(id)
  const tokens = Object.entries(lookTokens(look.id)).map(
    ([key, value]) => [`--slide-${key}`, value] as const,
  )
  if (
    root.dataset.look === look.id &&
    tokens.every(([key, value]) => root.style.getPropertyValue(key).trim() === value)
  )
    return html
  for (const [key, value] of tokens) root.style.setProperty(key, value)
  root.dataset.look = look.id
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
}

export function lookFromHtml(html: string): string | null {
  const root = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('[data-deck-id], #deck')
  return root?.getAttribute('data-look') ?? null
}
