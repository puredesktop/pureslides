// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createDefaultDeckDocument } from './deckDocument'
import { customLook, withCustomLook } from './customLook'
import { withDeckLook } from './deckLooks'
import {
  brandListing,
  deckBrandFile,
  deckTakesHouseStyle,
  houseStyleCaption,
  pickSlideImages,
  readBrandArgument,
  wearsHouseStyle,
} from './houseStyle'

const fresh = () => createDefaultDeckDocument('Pilot').html

describe('which decks start in the house style', () => {
  it('a new deck in the stock look with nothing chosen does', () => {
    expect(deckTakesHouseStyle({ html: fresh(), material: [] })).toBe(true)
    expect(deckTakesHouseStyle({ html: withDeckLook(fresh(), 'ink'), material: [{ role: 'content' }, { role: 'logo' }] })).toBe(true)
  })

  it('a deck with a reference, a custom look, or a look somebody chose does not', () => {
    expect(deckTakesHouseStyle({ html: fresh(), material: [{ role: 'reference' }] })).toBe(false)
    expect(deckTakesHouseStyle({ html: fresh(), material: [], chosen: true })).toBe(false)
    const branded = withCustomLook(fresh(), customLook({ name: 'Acme', colors: { bg: '#ffffff', accent: '#c22f08' } }))
    expect(deckTakesHouseStyle({ html: branded, material: [] })).toBe(false)
    expect(deckTakesHouseStyle({ html: '<p>not a deck</p>', material: [] })).toBe(false)
  })

  it('names the brand the deck is in', () => {
    expect(houseStyleCaption('pure.science')).toBe('In pure.science, your organisation’s house style.')
    expect(wearsHouseStyle('pure.science', { name: 'pure.science' })).toBe(true)
    expect(wearsHouseStyle('Acme', { name: 'pure.science' })).toBe(false)
    expect(wearsHouseStyle('pure.science', null)).toBe(false)
    expect(wearsHouseStyle(null, { name: 'pure.science' })).toBe(false)
  })
})

describe('brand arguments and listings', () => {
  it('reads a brand argument as none, a path or an id', () => {
    expect(readBrandArgument(undefined)).toBeNull()
    expect(readBrandArgument('  ')).toBeNull()
    expect(readBrandArgument('None')).toEqual({ kind: 'none' })
    expect(readBrandArgument('/Brands/acme.designsystem.json')).toEqual({ kind: 'path', path: '/Brands/acme.designsystem.json' })
    expect(readBrandArgument('organisation:pure-science')).toEqual({ kind: 'id', id: 'organisation:pure-science' })
  })

  it('lists the default first, marked, with a short summary', () => {
    const listing = brandListing([
      { id: 'own:/a.designsystem.json', name: 'Mine', source: 'own', default: false, path: '/a.designsystem.json', summary: { palette: [], fonts: [], logos: 0, motifs: 0, samples: 0 } },
      {
        id: 'organisation:pure-science',
        name: 'pure.science',
        source: 'organisation',
        default: true,
        path: '/u/brands/organisation/pure-science/pure-science.designsystem.json',
        organisation: 'pure.science',
        summary: { palette: [{ name: 'Ground', hex: '#0b1222', role: 'background' }], fonts: ['Inter'], logos: 1, motifs: 1, samples: 3 },
      },
    ])
    expect(listing[0]).toMatchObject({ id: 'organisation:pure-science', default: true, palette: ['background #0b1222'], fonts: ['Inter'], samples: 3 })
    expect(listing[1]).toMatchObject({ name: 'Mine', default: false })
    expect(listing[1]).not.toHaveProperty('palette')
  })
})

describe('slide pictures and saved brands', () => {
  it('picks exported slides in order, the ones asked for, at most twelve', () => {
    const files = ['/x/slide-10.png', '/x/slide-2.png', '/x/slide-1.png', '/x/notes.txt']
    expect(pickSlideImages(files)).toEqual(['/x/slide-1.png', '/x/slide-2.png', '/x/slide-10.png'])
    expect(pickSlideImages(files, [1, 9])).toEqual(['/x/slide-2.png', '/x/slide-10.png'])
    expect(pickSlideImages(Array.from({ length: 20 }, (_, i) => `/x/slide-${i + 1}.png`))).toHaveLength(12)
  })

  it('keeps a brand saved from a deck inside its package', () => {
    expect(deckBrandFile('/Work/Pilot.deck/', 'pure.science')).toBe('/Work/Pilot.deck/brand/pure-science.designsystem.json')
  })
})
