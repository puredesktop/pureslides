/** Portable design tokens live in the HTML, so previews and every export agree. */
export const DECK_LOOKS = [
  {
    id: 'auto',
    label: 'Auto',
    note: 'Follow your references',
    bg: '#f8f9fc',
    ink: '#192338',
    muted: '#53617a',
    accent: '#3459d4',
    surface: '#eaf0fb',
    line: '#cdd6e6',
    inverse: '#192b55',
    onInverse: '#ffffff',
    inverseMuted: '#cad5ed',
    font: 'system-ui, -apple-system, sans-serif',
    weight: '700',
  },
  {
    id: 'ink',
    label: 'Ink',
    note: 'Dark · precise · confident',
    bg: '#182322',
    ink: '#f4f5ee',
    muted: '#b8c8c1',
    accent: '#c3e7a1',
    surface: '#253734',
    line: '#435b53',
    inverse: '#c3e7a1',
    onInverse: '#182322',
    inverseMuted: '#344d37',
    font: 'system-ui, -apple-system, sans-serif',
    weight: '650',
  },
  {
    id: 'paper',
    label: 'Paper',
    note: 'Warm · editorial · considered',
    bg: '#f7f2e8',
    ink: '#302b26',
    muted: '#6e5f54',
    accent: '#a2432f',
    surface: '#ebe2d4',
    line: '#d5c8b7',
    inverse: '#763d2c',
    onInverse: '#fff6e9',
    inverseMuted: '#e6cbbb',
    font: 'Georgia, Cambria, serif',
    weight: '400',
  },
  {
    id: 'signal',
    label: 'Signal',
    note: 'Bright · clear · expressive',
    bg: '#f8f9fc',
    ink: '#192338',
    muted: '#53617a',
    accent: '#3459d4',
    surface: '#eaf0fb',
    line: '#cdd6e6',
    inverse: '#192b55',
    onInverse: '#ffffff',
    inverseMuted: '#cad5ed',
    font: 'system-ui, -apple-system, sans-serif',
    weight: '700',
  },
] as const

export function deckLook(id: string) {
  return DECK_LOOKS.find(look => look.id === id) ?? DECK_LOOKS[0]
}

export function lookDeclarations(id: string): string {
  const look = deckLook(id)
  return (
    Object.entries({
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
      'heading-weight': look.weight,
    })
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
  const tokens = doc.createElement('div')
  tokens.style.cssText = lookDeclarations(look.id)
  const keys = Array.from({ length: tokens.style.length }, (_, index) =>
    tokens.style.item(index),
  )
  if (
    root.dataset.look === look.id &&
    keys.every(
      key =>
        root.style.getPropertyValue(key) === tokens.style.getPropertyValue(key),
    )
  )
    return html
  for (let i = 0; i < tokens.style.length; i++) {
    const key = tokens.style.item(i)
    root.style.setProperty(key, tokens.style.getPropertyValue(key))
  }
  root.dataset.look = look.id
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
}

export function lookFromHtml(html: string): string | null {
  const root = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('[data-deck-id], #deck')
  return root?.getAttribute('data-look') ?? null
}
