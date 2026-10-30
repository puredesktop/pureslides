// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import type { DeckAgentToolContext, DeckBrandAccess } from './catalog'
import { createDeckHandler, getDeckContextHandler, setLookHandler } from './handlers'
import { setCustomLookHandler } from './lookTools'
import {
  listBrandsHandler,
  proposeBrandToOrganisationHandler,
  proposeSamplesToOrganisationHandler,
  startInHouseStyle,
} from './orgTools'
import { createDefaultDeckDocument, type DeckDocument } from '../lib/deckDocument'
import { customLook, customLookFromHtml, withCustomLook } from '../lib/customLook'

const PNG = 'iVBORw0KGgo='
const HOUSE_PATH = '/u/brands/organisation/pure-science/pure-science.designsystem.json'
const SAMPLES = ['/u/brands/organisation/pure-science/pure-science.brand/references/deck-1.png']

const PURE_SCIENCE = JSON.stringify({
  format: 'pure-design-system',
  version: 1,
  id: 'pure-science',
  name: 'pure.science',
  revision: '3',
  guidelines: [],
  components: [],
  tokens: {
    colors: {
      background: '#0b1222',
      text: '#ffffff',
      accent: '#3b6fe8',
      palette: [{ name: 'Node amber', hex: '#f2b84b', role: 'highlight' }],
    },
    typography: { display: 'Inter', body: 'Inter', mono: 'JetBrains Mono', displayWeight: 800 },
  },
  motifs: [{ name: 'Research network', description: 'Glowing nodes and lines.', file: 'pure-science.brand/motifs/network.png' }],
  references: [{ file: 'pure-science.brand/references/deck-1.png' }],
})

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'organisation:pure-science',
  source: 'organisation' as const,
  name: 'pure.science',
  default: true,
  path: HOUSE_PATH,
  revision: '3',
  organisation: 'pure.science',
  summary: { palette: [{ name: 'Ground', hex: '#0b1222', role: 'background' }], fonts: ['Inter'], logos: 0, motifs: 1, samples: 1 },
  ...over,
})
const detail = (over: Record<string, unknown> = {}) =>
  ({ ...entry(over), system: {}, folder: '/u/brands/organisation/pure-science', files: {}, samples: SAMPLES }) as never

/** The bridge, mocked: the organisation's house style is pure.science unless told otherwise. */
function brandAccess(house: 'pure.science' | null = 'pure.science') {
  return {
    list: vi.fn(async () => [entry({ id: 'own:/me/mine.designsystem.json', source: 'own', name: 'Mine', default: false, path: '/me/mine.designsystem.json' }), ...(house ? [entry()] : [])]),
    get: vi.fn(async (id: string) => {
      if (id === 'organisation:pure-science') return detail()
      throw Error('not found')
    }),
    default: vi.fn(async () => (house ? detail() : null)),
    propose: vi.fn(async () => ({ proposed: true as const, id: 'p1', organisation: 'pure.science', message: 'Sent to pure.science for approval.' })),
    proposeSamples: vi.fn(async () => ({ proposed: true as const, id: 's1', organisation: 'pure.science', message: 'Sent 2 samples to pure.science.' })),
  } satisfies DeckBrandAccess
}

function deckContext(overrides: Partial<DeckAgentToolContext> = {}) {
  const disk = new Map<string, string>([[HOUSE_PATH, PURE_SCIENCE]])
  const written: string[] = []
  const state = { html: createDefaultDeckDocument('Pilot').html, path: '/Work/Pilot.deck' as string | null, saved: null as string | null }
  const setCustomLook = vi.fn((spec: Parameters<DeckAgentToolContext['setCustomLook']>[0]) => {
    state.html = withCustomLook(state.html, spec)
    return { ok: true as const, hash: 'h2', changed: true, rebased: false, warning: null, snapshot: null }
  })
  const context = {
    get document() {
      return { html: state.html, title: 'Pilot' }
    },
    get documentPath() {
      return state.path
    },
    material: [],
    ui: { view: 'slides', selectedSlide: 0, slideSelection: [], elementSelection: [], brief: '', slideCount: 5 },
    verification: { state: 'verified', message: '', failedSlides: [], checkingSlides: [] },
    summarize: () => ({}),
    listRevisions: () => [],
    setCustomLook,
    setLook: vi.fn(() => ({ ok: true, hash: 'h3', changed: true, rebased: false, warning: null, snapshot: null })),
    createAndOpen: vi.fn(async (next: DeckDocument) => {
      state.html = next.html
      state.path = '/Work/New.deck'
      return state.path
    }),
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
    brands: brandAccess(),
    houseStyle: { id: 'organisation:pure-science', name: 'pure.science', path: HOUSE_PATH, samples: SAMPLES },
    get savedBrandPath() {
      return state.saved
    },
    rememberSavedBrand: (path: string) => {
      state.saved = path
    },
    exportSlideImages: vi.fn(async () => ['/Work/New.deck/exports/frames/slide-2.png', '/Work/New.deck/exports/frames/slide-1.png']),
    ...overrides,
  } as unknown as DeckAgentToolContext
  return { context, disk, written, state, setCustomLook }
}

const parsed = (result: { content: unknown }) => JSON.parse(String(result.content))

describe('listBrands', () => {
  it('lists the organisation house style first, marked default, with its samples', async () => {
    const { context } = deckContext()
    const result = parsed(await listBrandsHandler(context))
    expect(result.brands[0]).toMatchObject({ id: 'organisation:pure-science', name: 'pure.science', default: true })
    expect(result.brands[1]).toMatchObject({ name: 'Mine', default: false })
    expect(result.houseStyle).toBe('pure.science')
    expect(result.houseStyleSamples).toEqual(SAMPLES)
  })

  it('says so on a desktop that does not list brands', async () => {
    const { context } = deckContext({ brands: null })
    expect(parsed(await listBrandsHandler(context))).toMatchObject({ brands: [], note: expect.stringMatching(/does not list brands/) })
  })
})

describe('a new deck starts in the house style', () => {
  it('createDeck with no brand puts pure.science on the new deck and says so', async () => {
    const deck = deckContext()
    const result = parsed(await createDeckHandler(deck.context, { title: 'Quarterly' }))
    expect(result).toMatchObject({ created: true, path: '/Work/New.deck', brand: 'pure.science', houseStyle: 'pure.science' })
    expect(result.say).toBe('In pure.science, your organisation’s house style.')
    expect(result.samples).toEqual(SAMPLES)
    expect(result.look).toMatch(/view_image/)
    const spec = customLookFromHtml(deck.state.html)
    expect(spec).toMatchObject({ name: 'pure.science', colors: { bg: '#0b1222', accent: '#3b6fe8', highlight: '#f2b84b' }, type: { heading: 'Inter', headingWeight: 800 } })
    expect(spec?.motif?.file).toBe('assets/motifs/network.png')
    expect(deck.written).toContain('assets/motifs/network.png')
  })

  it('createDeck with brand "none" stays in the stock look and never asks for the default', async () => {
    const deck = deckContext()
    const result = parsed(await createDeckHandler(deck.context, { title: 'Quarterly', brand: 'none' }))
    expect(result).toEqual({ created: true, title: 'Quarterly', path: '/Work/New.deck' })
    expect(deck.context.brands!.default).not.toHaveBeenCalled()
    expect(customLookFromHtml(deck.state.html)).toBeNull()
  })

  it('createDeck with a brand id starts in that brand', async () => {
    const deck = deckContext()
    const result = parsed(await createDeckHandler(deck.context, { title: 'Quarterly', brand: 'organisation:pure-science' }))
    expect(deck.context.brands!.get).toHaveBeenCalledWith('organisation:pure-science')
    expect(result.brand).toBe('pure.science')
    expect(result).not.toHaveProperty('houseStyle')
  })

  it('createDeck refuses an unknown brand before creating anything', async () => {
    const deck = deckContext()
    expect(String((await createDeckHandler(deck.context, { title: 'Q', brand: 'own:nope' })).content)).toMatch(/no brand "own:nope"/)
    expect(deck.context.createAndOpen).not.toHaveBeenCalled()
  })

  it('with no organisation it is one default() call and a plain deck', async () => {
    const deck = deckContext({ brands: brandAccess(null), houseStyle: null })
    const result = parsed(await createDeckHandler(deck.context, { title: 'Quarterly' }))
    expect(result).toEqual({ created: true, title: 'Quarterly', path: '/Work/New.deck' })
    expect(deck.context.brands!.default).toHaveBeenCalledTimes(1)
    expect(deck.setCustomLook).not.toHaveBeenCalled()
  })

  it('never overrides a reference, a look already there, or a look somebody chose', async () => {
    const deck = deckContext()
    const html = createDefaultDeckDocument('Pilot').html
    expect(await startInHouseStyle(deck.context, { html, material: [{ role: 'reference' }] })).toMatchObject({ applied: false })
    const branded = withCustomLook(html, customLook({ name: 'Acme', colors: { bg: '#ffffff' } }))
    expect(await startInHouseStyle(deck.context, { html: branded, material: [] })).toMatchObject({ applied: false })
    expect(await startInHouseStyle(deck.context, { html, material: [], chosen: () => true })).toMatchObject({ applied: false })
    expect(deck.setCustomLook).not.toHaveBeenCalled()
  })

  it('a look chosen while the brand files are copied wins', async () => {
    const deck = deckContext()
    let chosen = false
    const slowWrite = deck.context.writePackageFile
    deck.context.writePackageFile = async (relative, base64) => {
      chosen = true
      return slowWrite(relative, base64)
    }
    const result = await startInHouseStyle(deck.context, { html: createDefaultDeckDocument().html, material: [], chosen: () => chosen })
    expect(result).toMatchObject({ applied: false })
    expect(deck.setCustomLook).not.toHaveBeenCalled()
  })

  it('getDeckContext says whether the deck is in the house style', async () => {
    const deck = deckContext()
    await createDeckHandler(deck.context, { title: 'Quarterly' })
    expect(parsed(getDeckContextHandler(deck.context)).houseStyle).toEqual({ name: 'pure.science', deckIsInIt: true, samples: SAMPLES })
  })
})

describe('brands by id, and keeping the house style', () => {
  it('setCustomLook takes a brand id from listBrands as well as a path', async () => {
    const deck = deckContext()
    const result = parsed(await setCustomLookHandler(deck.context, { brand: 'organisation:pure-science' }))
    expect(result).toMatchObject({ look: 'custom', name: 'pure.science', brand: 'pure.science' })
    expect(String((await setCustomLookHandler(deck.context, { brand: 'relative/acme.json' })).content)).toMatch(/no brand/)
    expect(String((await setCustomLookHandler({ ...deck.context, brands: null } as DeckAgentToolContext, { brand: 'acme' })).content)).toMatch(/does not list brands/)
  })

  it('setLook keeps the house style unless the person asked for another look', async () => {
    const deck = deckContext()
    await createDeckHandler(deck.context, { title: 'Quarterly' })
    expect(String(setLookHandler(deck.context, { look: 'paper' }).content)).toMatch(/in pure.science, your organisation's house style/)
    expect(String(setLookHandler(deck.context, { look: 'paper', ignoreHouseStyle: true }).content)).toContain('h3')
  })
})

describe('proposing to the organisation', () => {
  it('proposes a brand by id or path, with the note', async () => {
    const deck = deckContext()
    const byId = parsed(await proposeBrandToOrganisationHandler(deck.context, { brand: 'own:/me/mine.designsystem.json', note: 'Our lab look' }))
    expect(deck.context.brands!.propose).toHaveBeenCalledWith({ id: 'own:/me/mine.designsystem.json', note: 'Our lab look' })
    expect(byId.message).toBe('Sent to pure.science for approval.')
    await proposeBrandToOrganisationHandler(deck.context, { brand: '/me/mine.designsystem.json' })
    expect(deck.context.brands!.propose).toHaveBeenLastCalledWith({ path: '/me/mine.designsystem.json' })
  })

  it('proposes the brand saved from this deck, saving it first with the slides as samples when it never was', async () => {
    const deck = deckContext()
    deck.state.path = '/Work/New.deck'
    await setCustomLookHandler(deck.context, { name: 'Lab Blue', colors: { bg: '#ffffff', ink: '#111111', accent: '#1d4ed8' } })
    const result = parsed(await proposeBrandToOrganisationHandler(deck.context, {}))
    expect(result).toMatchObject({ proposed: true, path: '/Work/New.deck/brand/lab-blue.designsystem.json', savedNow: true })
    const brand = JSON.parse(deck.disk.get('/Work/New.deck/brand/lab-blue.designsystem.json')!)
    expect(brand.references.map((r: { file: string }) => r.file)).toEqual(['lab-blue.brand/references/slide-1.png', 'lab-blue.brand/references/slide-2.png'])
    expect(deck.context.brands!.propose).toHaveBeenCalledWith({ path: '/Work/New.deck/brand/lab-blue.designsystem.json' })
    // Proposed again, it sends the saved file without saving or exporting again.
    await proposeBrandToOrganisationHandler(deck.context, {})
    expect(deck.context.exportSlideImages).toHaveBeenCalledTimes(1)
  })

  it('will not propose a stock look or the house style back to itself', async () => {
    const deck = deckContext()
    expect(String((await proposeBrandToOrganisationHandler(deck.context, {})).content)).toMatch(/stock look/)
    await createDeckHandler(deck.context, { title: 'Quarterly' })
    expect(String((await proposeBrandToOrganisationHandler(deck.context, {})).content)).toMatch(/already in pure.science.*slides as samples/)
  })

  it('refuses in plain words on a desktop that cannot propose, and passes the server’s refusal on', async () => {
    const lone = deckContext({ brands: null })
    expect(String((await proposeBrandToOrganisationHandler(lone.context, { brand: 'x' })).content)).toMatch(/managed by an organisation/)
    const deck = deckContext()
    deck.context.brands!.propose = vi.fn(async () => {
      throw Error('This brand has no sample images. Add at least one reference.')
    })
    expect(String((await proposeBrandToOrganisationHandler(deck.context, { brand: 'own:x' })).content)).toMatch(/no sample images/)
  })

  it('proposes the deck’s exported slides as samples of the house style', async () => {
    const deck = deckContext()
    const result = parsed(await proposeSamplesToOrganisationHandler(deck.context, { note: 'A great deck' }))
    expect(deck.context.brands!.proposeSamples).toHaveBeenCalledWith({
      images: ['/Work/New.deck/exports/frames/slide-1.png', '/Work/New.deck/exports/frames/slide-2.png'],
      note: 'A great deck',
    })
    expect(result.message).toBe('Sent 2 samples to pure.science.')
    await proposeSamplesToOrganisationHandler(deck.context, { slides: [1], brand: 'organisation:pure-science' })
    expect(deck.context.brands!.proposeSamples).toHaveBeenLastCalledWith({ images: ['/Work/New.deck/exports/frames/slide-2.png'], brand: 'organisation:pure-science' })
  })

  it('proposes named images instead, checking them first', async () => {
    const deck = deckContext()
    await proposeSamplesToOrganisationHandler(deck.context, { images: ['/Pictures/brochure.jpg'] })
    expect(deck.context.brands!.proposeSamples).toHaveBeenCalledWith({ images: ['/Pictures/brochure.jpg'] })
    expect(deck.context.exportSlideImages).not.toHaveBeenCalled()
    expect(String((await proposeSamplesToOrganisationHandler(deck.context, { images: ['brochure.pdf'] })).content)).toMatch(/not an absolute PNG/)
  })
})
