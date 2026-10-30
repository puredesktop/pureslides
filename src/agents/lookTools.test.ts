import { describe, expect, it } from 'vitest'
import type { DeckAgentToolContext } from './catalog'
import { makeMotifHandler, saveLookAsBrandHandler, setCustomLookHandler, viewSlideHandler } from './lookTools'
import { setLookHandler } from './handlers'
import { createDefaultDeckDocument } from '../lib/deckDocument'
import { customLookFromHtml, withCustomLook } from '../lib/customLook'

const PNG = 'iVBORw0KGgo='

function deckContext(overrides: Partial<DeckAgentToolContext> = {}) {
  const disk = new Map<string, string>()
  const written: string[] = []
  let html = createDefaultDeckDocument('Pilot').html
  const context = {
    get document() {
      return { html, title: 'Pilot' }
    },
    documentPath: '/Work/Pilot.deck',
    material: [{ name: 'site.png', reference: 'assets/site.png', description: 'The site', role: 'reference', kind: 'image' }],
    ui: { selectedSlide: 0 },
    setCustomLook: (spec: Parameters<DeckAgentToolContext['setCustomLook']>[0]) => {
      html = withCustomLook(html, spec)
      return { ok: true, hash: 'h2', changed: true, rebased: false, warning: null, snapshot: null }
    },
    setLook: () => ({ ok: true, hash: 'h3', changed: true, rebased: false, warning: null, snapshot: null }),
    files: {
      readText: async (path: string) => {
        const text = disk.get(path)
        if (text === undefined) throw Error(`no file ${path}`)
        return text
      },
      readBase64: async (path: string) => ({ base64: disk.get(path) ?? PNG, mimeType: 'image/png' }),
      writeText: async (path: string, text: string) => void disk.set(path, text),
      writeBase64: async (path: string, base64: string) => void disk.set(path, base64),
      ensureFolder: async () => {},
    },
    writePackageFile: async (relative: string) => {
      written.push(relative)
      return relative
    },
    addAsset: async (_from: string, name?: string) => `assets/${name}`,
    setAssetRole: () => {},
    generateImage: null,
    renderSlide: async () => ({ dataUrl: `data:image/png;base64,${PNG}`, width: 1280, height: 720 }),
    ...overrides,
  } as unknown as DeckAgentToolContext
  return { context, disk, written, html: () => html }
}

const parsed = (result: { content: unknown }) => JSON.parse(String(result.content))

describe('the house-style tools', () => {
  it('refuses a stock look while a reference is attached, unless the person asked for it', () => {
    const { context } = deckContext()
    expect(String(setLookHandler(context, { look: 'paper' }).content)).toMatch(/design reference \(site.png\).*setCustomLook/)
    expect(String(setLookHandler(context, { look: 'paper', ignoreReference: true }).content)).toContain('h3')
  })

  it('builds a custom look from explicit tokens and adjusts it on a second call', async () => {
    const deck = deckContext()
    const first = parsed(
      await setCustomLookHandler(deck.context, {
        name: 'pure.science',
        colors: { bg: '#0b1222', ink: '#ffffff', accent: '#3b6fe8', accent2: '#a9b4f5', highlight: '#f2b84b' },
        fonts: { heading: 'Inter', mono: 'JetBrains Mono', label: 'mono', headingWeight: 800 },
        radius: 8,
      }),
    )
    expect(first).toMatchObject({ look: 'custom', name: 'pure.science', type: { heading: 'Inter', label: 'mono', headingWeight: 800 } })
    expect(first.next).toMatch(/viewSlide/)
    const second = parsed(await setCustomLookHandler(deck.context, { fonts: { heading: 'Gotham' } }))
    expect(second.colors.bg).toBe('#0b1222')
    expect(second.type.heading).toBe('Montserrat')
    expect(second.notes.join(' ')).toMatch(/Gotham/)
  })

  it('reads a brand file, brings its files in, and lists motifs still to generate', async () => {
    const deck = deckContext()
    deck.disk.set(
      '/Brands/acme.designsystem.json',
      JSON.stringify({
        format: 'pure-design-system',
        version: 1,
        id: 'acme',
        name: 'Acme',
        revision: '1',
        guidelines: [],
        components: [],
        tokens: { colors: { background: '#ffffff', text: '#111111', accent: '#c22f08' }, typography: { display: 'Brand Sans' } },
        fonts: [{ family: 'Brand Sans', weight: 700, file: 'acme.brand/fonts/brand-sans.woff2', licence: 'Commercial, licensed to Acme' }],
        motifs: [{ name: 'Grain', description: 'Warm paper grain.' }],
      }),
    )
    const result = parsed(await setCustomLookHandler(deck.context, { brand: '/Brands/acme.designsystem.json' }))
    expect(deck.written).toEqual(['assets/fonts/brand/brand-sans.woff2'])
    expect(result.brandFaces).toEqual(['Brand Sans 700'])
    expect(result.type.heading).toBe('Brand Sans')
    expect(result.motifsToGenerate).toEqual([{ name: 'Grain', description: 'Warm paper grain.' }])
  })

  it('says there is no image model rather than drawing a substitute', async () => {
    const { context } = deckContext()
    expect(String((await makeMotifHandler(context, { prompt: 'glowing nodes' })).content)).toMatch(/no image model.*fallback/)
  })

  it('generates the motif from the reference with the palette, saves it and sets it behind the slides', async () => {
    const requests: unknown[] = []
    const deck = deckContext({
      generateImage: async request => {
        requests.push(request)
        return { base64: PNG, mimeType: 'image/png', modelId: 'openai:gpt-image-1' }
      },
    })
    await setCustomLookHandler(deck.context, { colors: { bg: '#0b1222', accent: '#3b6fe8', highlight: '#f2b84b' } })
    const result = await makeMotifHandler(deck.context, { prompt: 'A network of glowing amber and blue nodes', name: 'Node network', reference: 'site.png' })
    const body = parsed(result)
    expect(body).toMatchObject({ file: 'assets/motifs/node-network.png', applied: true, model: 'openai:gpt-image-1' })
    expect(result.images).toEqual([{ mimeType: 'image/png', data: PNG }])
    const request = requests[0] as { prompt: string; quality: string; sourceImages: unknown[] }
    expect(request.quality).toBe('high')
    expect(request.prompt).toMatch(/#0b1222.*#3b6fe8/)
    expect(request.prompt).toMatch(/quiet areas/)
    expect(request.prompt).toMatch(/No text/)
    expect(request.sourceImages).toHaveLength(1)
    expect(customLookFromHtml(deck.html())?.motif?.file).toBe('assets/motifs/node-network.png')
  })

  it('shows a slide beside the reference', async () => {
    const { context } = deckContext()
    const result = await viewSlideHandler(context, { index: 0 })
    expect(result.images).toHaveLength(2)
    expect(parsed(result).compare).toMatch(/Compare them/)
  })

  it('saves the look as a brand with its files beside it', async () => {
    const deck = deckContext()
    await setCustomLookHandler(deck.context, {
      name: 'pure.science',
      colors: { bg: '#0b1222', ink: '#ffffff', accent: '#3b6fe8' },
      fonts: { heading: 'Inter', mono: 'JetBrains Mono' },
      motif: { asset: 'motifs/node-network.png' },
    })
    const result = parsed(await saveLookAsBrandHandler(deck.context, { path: '/Brands/pure-science.designsystem.json', motifDescription: 'Glowing nodes.' }))
    expect(result.saved).toBe('/Brands/pure-science.designsystem.json')
    const brand = JSON.parse(deck.disk.get('/Brands/pure-science.designsystem.json')!)
    expect(brand.motifs[0]).toMatchObject({ description: 'Glowing nodes.', file: 'pure-science.brand/motifs/node-network.png' })
    expect(brand.references[0].file).toBe('pure-science.brand/references/site.png')
    expect(deck.disk.has('/Brands/pure-science.brand/fonts/inter.woff2')).toBe(true)
  })
})
