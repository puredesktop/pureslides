import { describe, expect, it } from 'vitest'
import { createDefaultDeckDocument } from './deckDocument'
import { addSlide, slidesFromHtml } from './slides'
import { findBlock } from './blocks'
import { lookFromHtml, withDeckLook } from './deckLooks'
import { contrastNotes, customLook, customLookFromHtml, CustomLookError, fontNotes, withCustomLook } from './customLook'
import { deckFontFiles, withDeckType } from './deckType'
import { brandFromLook, lookFromBrand, nearestBundled, parseBrand } from './brand'
import { deckDesignGuide } from './draftDeck'

const root = (html: string) => new DOMParser().parseFromString(html, 'text/html').querySelector<HTMLElement>('[data-deck-id]')!

/** pure.science, as read off its site: night navy, white and lavender headline, amber mono tag, blue button. */
const pureScience = () =>
  customLook({
    name: 'pure.science',
    colors: { bg: '#0b1222', ink: '#ffffff', muted: '#c4cbe0', accent: '#3b6fe8', accent2: '#a9b4f5', highlight: '#f2b84b' },
    type: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono', label: 'mono', headingWeight: 800 },
    radius: 8,
    motif: { file: 'assets/motifs/node-network.png', on: 'all', placement: 'cover', opacity: 0.9 },
  })

describe('a custom look', () => {
  it('derives every role from a ground, a text colour and an accent', () => {
    const spec = customLook({ colors: { bg: '#0b1222', ink: '#ffffff', accent: '#3b6fe8' } })
    expect(spec.colors.surface).toMatch(/^#[0-9a-f]{6}$/)
    expect(spec.colors.surface).not.toBe(spec.colors.bg)
    expect(spec.colors.onInverse).toBe('#ffffff')
    expect(spec.colors.accent2).toBe('#3b6fe8')
    expect(contrastNotes(spec)).toEqual([])
  })

  it('refuses CSS, URLs and files outside the package', () => {
    expect(() => customLook({ colors: { bg: 'red;display:none' } })).toThrow(CustomLookError)
    expect(() => customLook({ type: { heading: "Inter'; } body { x: url(" } })).toThrow(CustomLookError)
    expect(() => customLook({ motif: { file: 'https://example.test/x.png', on: 'all', placement: 'cover', opacity: 1 } })).toThrow(/assets/)
    expect(() => customLook({ faces: [{ family: 'Brand', weight: '700', style: 'normal', file: '../x.woff2' }] })).toThrow(/assets\/fonts\/brand/)
  })

  it('lands as tokens and root data only, and reads back the same', () => {
    const before = addSlide(createDefaultDeckDocument('Pilot').html, findBlock('cards')!.html)
    const spec = pureScience()
    const after = withCustomLook(before, spec)
    expect(slidesFromHtml(after)).toEqual(slidesFromHtml(before))
    const r = root(after)
    expect(lookFromHtml(after)).toBe('custom')
    expect(r.style.getPropertyValue('--slide-bg')).toBe('#0b1222')
    expect(r.style.getPropertyValue('--slide-accent-2')).toBe('#a9b4f5')
    expect(r.style.getPropertyValue('--slide-label-font')).toContain('JetBrains Mono')
    expect(r.style.getPropertyValue('--slide-heading-weight')).toBe('800')
    expect(r.style.getPropertyValue('--slide-motif')).toBe('url("assets/motifs/node-network.png")')
    expect(r.getAttribute('data-motif-on')).toBe('all')
    expect(customLookFromHtml(after)).toEqual(spec)
  })

  it('writes the motif layer and the brand faces into the derived type stylesheet', () => {
    const spec = customLook({
      ...pureScience(),
      type: { ...pureScience().type, heading: 'Brand Sans' },
      faces: [{ family: 'Brand Sans', weight: '800', style: 'normal', file: 'assets/fonts/brand/brand-sans-800.woff2' }],
    })
    const html = withDeckType(withCustomLook(addSlide(createDefaultDeckDocument('Pilot').html, findBlock('title')!.html), spec))
    expect(html).toContain(`@font-face { font-family: 'Brand Sans'; src: url("assets/fonts/brand/brand-sans-800.woff2")`)
    expect(html).toContain('background-image: var(--slide-motif, none)')
    expect(html).toContain('[data-motif-on="all"]')
    expect(html).toContain('text-transform: var(--slide-heading-case, none)')
    // The label face (a mono) ships because labels use it.
    expect(deckFontFiles(html)).toContain('fonts/jetbrains-mono.woff2')
    expect(fontNotes(spec)).toEqual([])
  })

  it('says when a face would not travel', () => {
    const spec = customLook({ type: { heading: 'Gotham' } })
    expect(fontNotes(spec)[0]).toMatch(/Gotham is neither bundled/)
  })

  it('goes back to a stock look cleanly', () => {
    const custom = withCustomLook(createDefaultDeckDocument('Pilot').html, pureScience())
    const stock = withDeckLook(custom, 'paper')
    const r = root(stock)
    expect(lookFromHtml(stock)).toBe('paper')
    expect(r.style.getPropertyValue('--slide-motif')).toBe('')
    expect(r.hasAttribute('data-motif-on')).toBe(false)
    expect(r.hasAttribute('data-look-name')).toBe(false)
    expect(withDeckLook(custom, 'custom')).toBe(custom)
  })

  it('gives the drafter the custom tokens, not a stock palette', () => {
    const html = withCustomLook(createDefaultDeckDocument('Pilot').html, pureScience())
    const guide = deckDesignGuide('custom', html)
    expect(guide).toContain('--slide-bg: #0b1222')
    expect(guide).toContain('organisation\'s own look')
    expect(guide).not.toContain('Preset Auto')
  })
})

describe('the shared brand format', () => {
  const brandJson = {
    format: 'pure-design-system',
    version: 1,
    id: 'pure-science',
    name: 'pure.science',
    revision: '2026.10',
    guidelines: [],
    components: [],
    tokens: {
      colors: {
        background: '#0b1222',
        text: '#ffffff',
        accent: '#3b6fe8',
        onAccent: '#ffffff',
        palette: [
          { name: 'Lavender', hex: '#a9b4f5', role: 'accent2' },
          { name: 'Amber', hex: '#f2b84b', role: 'highlight' },
        ],
      },
      typography: { display: 'Helvetica Neue', body: 'Inter', mono: 'JetBrains Mono', displayWeight: 800 },
      radius: 8,
    },
    fonts: [{ family: 'Brand Mono', weight: 400, file: 'pure-science.brand/fonts/brand-mono.woff2', licence: 'OFL-1.1' }],
    logos: [{ name: 'Wordmark', file: 'pure-science.brand/logos/wordmark.svg', onDark: true }],
    motifs: [
      { name: 'Node network', description: 'Glowing amber and blue nodes on night navy.', file: 'pure-science.brand/motifs/node-network.png' },
      { name: 'Slash tag', description: 'A // before mono tags.' },
    ],
    voice: ['Plain and confident.'],
  }

  it('reads a brand into a look and the files to bring in', () => {
    const look = lookFromBrand(parseBrand(JSON.stringify(brandJson)), '/Brands/pure-science.designsystem.json')
    expect(look.input.colors).toMatchObject({ bg: '#0b1222', accent2: '#a9b4f5', highlight: '#f2b84b', inverse: '#3b6fe8' })
    expect(look.input.type).toMatchObject({ heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono', label: 'mono', headingWeight: 800 })
    expect(look.notes[0]).toMatch(/Helvetica Neue .* Inter/)
    expect(look.copies).toEqual([{ from: '/Brands/pure-science.brand/fonts/brand-mono.woff2', to: 'assets/fonts/brand/brand-mono.woff2' }])
    expect(look.motif?.to).toBe('assets/motifs/node-network.png')
    expect(look.motifIdeas).toEqual([{ name: 'Slash tag', description: 'A // before mono tags.' }])
    expect(look.logos[0]).toMatchObject({ from: '/Brands/pure-science.brand/logos/wordmark.svg', onDark: true })
    expect(customLook(look.input).motif?.file).toBe('assets/motifs/node-network.png')
  })

  it('refuses a brand that reaches outside its folder or carries code', () => {
    expect(() => parseBrand(JSON.stringify({ ...brandJson, fonts: [{ family: 'X', file: '../../x.woff2', licence: 'OFL' }] }))).toThrow()
    expect(() => parseBrand(JSON.stringify({ ...brandJson, logos: [{ name: 'L', file: 'x.brand/l.html' }] }))).toThrow()
    expect(() => parseBrand(JSON.stringify({ ...brandJson, tokens: { typography: { body: 'url(https://x)' } } }))).toThrow()
    expect(() => parseBrand('{"format":"other"}')).toThrow(/version 1/)
  })

  it('saves a look back as a brand that reads again, with its files beside it', () => {
    const { json, copies } = brandFromLook({
      spec: pureScience(),
      path: '/Brands/pure-science.designsystem.json',
      logos: [{ file: 'assets/wordmark.png', onDark: true }],
      references: [{ file: 'assets/site.png', note: 'Home page' }],
      motifs: [{ name: 'Node network', description: 'Glowing nodes.', file: 'assets/motifs/node-network.png' }],
      voice: ['Plain.'],
    })
    const brand = parseBrand(json)
    expect(brand.tokens.typography).toMatchObject({ display: 'Inter', mono: 'JetBrains Mono', displayWeight: 800 })
    expect(brand.tokens.colors?.palette?.find(p => p.role === 'accent2')?.hex).toBe('#a9b4f5')
    expect(brand.motifs?.[0].file).toBe('pure-science.brand/motifs/node-network.png')
    expect(brand.fonts?.some(f => f.family === 'JetBrains Mono' && f.licence === 'OFL-1.1')).toBe(true)
    expect(copies).toContainEqual({ from: 'assets/motifs/node-network.png', to: 'pure-science.brand/motifs/node-network.png' })
    expect(copies).toContainEqual({ from: 'assets/site.png', to: 'pure-science.brand/references/site.png' })
    // Read straight back, it is the same look.
    const again = customLook(lookFromBrand(brand, '/Brands/pure-science.designsystem.json').input)
    expect(again.colors).toMatchObject({ bg: '#0b1222', accent2: '#a9b4f5', highlight: '#f2b84b' })
  })

  it('names the closest bundled face for common brand faces', () => {
    expect(nearestBundled('Gotham', 'Inter').family).toBe('Montserrat')
    expect(nearestBundled('Futura PT', 'Inter').family).toBe('Poppins')
    expect(nearestBundled('Montserrat', 'Inter')).toEqual({ family: 'Montserrat' })
    expect(nearestBundled('SF Mono', 'Inter').family).toBe('JetBrains Mono')
  })
})
