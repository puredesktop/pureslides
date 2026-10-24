import { describe, expect, it } from 'vitest'
import {
  createDefaultDeckDocument,
  createStarterSlideHtml,
  deckSeconds,
  parsePackageManifest,
  serializePackageManifest,
  withGeometry,
} from './deckDocument'
import { DEFAULT_SLIDE_SECONDS } from '../constants'

describe('the manifest carries the wizard answers', () => {
  it('round-trips look and slideCount beside the brief', () => {
    const manifest = parsePackageManifest(
      serializePackageManifest({
        title: 'Launch',
        brief: 'For the board.',
        look: 'ink',
        slideCount: 12,
      }),
    )
    expect(manifest.look).toBe('ink')
    expect(manifest.slideCount).toBe(12)
    expect(manifest.brief).toBe('For the board.')
  })

  it('leaves them out of a manifest that never stored them', () => {
    // Opening such a deck must reset the wizard to defaults, so the parse
    // reports absence rather than inventing values.
    const manifest = parsePackageManifest('{"title":"Old deck"}')
    expect(manifest.look).toBeUndefined()
    expect(manifest.slideCount).toBeUndefined()
  })

  it('drops a slideCount that is not a positive number', () => {
    expect(
      parsePackageManifest('{"title":"x","slideCount":-3}').slideCount,
    ).toBeUndefined()
    expect(
      parsePackageManifest('{"title":"x","slideCount":"eight"}').slideCount,
    ).toBeUndefined()
  })
})

describe('deckSeconds', () => {
  it('sums each slide’s hold', () => {
    expect(deckSeconds([2, 3, 5])).toBe(10)
  })

  it('substitutes the default for a slide with no usable hold', () => {
    expect(deckSeconds([2, 0])).toBe(2 + DEFAULT_SLIDE_SECONDS)
  })
})

describe('literal deck titles', () => {
  it('keeps markup and entities in the title as visible words', () => {
    const title = 'R&D <em>launch</em> &copy; </title><script>bad()</script>'
    const deck = createDefaultDeckDocument(title)
    const doc = new DOMParser().parseFromString(deck.html, 'text/html')
    expect(deck.title).toBe(title)
    expect(doc.title).toBe(title)
    expect(doc.querySelector('h1')?.textContent).toBe(title)
    expect(doc.querySelector('script, em')).toBeNull()
    const starter = new DOMParser().parseFromString(
      createStarterSlideHtml(title),
      'text/html',
    )
    expect(starter.querySelector('h1')?.textContent).toBe(title)
  })
})

describe('resizing a deck', () => {
  it('preserves the author’s root styles while updating its dimensions', () => {
    const html =
      '<div id="deck" data-width="1280" data-height="720" style="width:1280px;height:720px;display:flex;background:navy;color:white"><h1>Imported slide</h1></div>'
    const resized = withGeometry(html, { width: 960, height: 540 })
    const root = new DOMParser()
      .parseFromString(resized, 'text/html')
      .querySelector('#deck') as HTMLElement
    expect(root.style.width).toBe('960px')
    expect(root.style.height).toBe('540px')
    expect(root.style.display).toBe('flex')
    expect(root.style.background).toBe('navy')
    expect(root.style.color).toBe('white')
    expect(root.querySelector('h1')?.textContent).toBe('Imported slide')
  })
})
