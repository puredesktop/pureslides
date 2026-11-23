import { describe, expect, it, vi } from 'vitest'
import {
  escapeHtmlText,
  isSafeAssetFileName,
  resolveSafeAssetSubpath,
  resolveSafePackageRelativePath,
  sanitizeForSameOriginMeasure,
} from './sanitizeDeck'
import { printableHtml } from './exportDeck'
import { deckFromLive, deckToLive } from './liveDeck'
import { pickSlideImages } from './houseStyle'
import { inlineAssetUrls, referencedAssetNames, resolvePreviewAssets } from './packageAssets'
import { packageSource } from './videoPlacements'
import { customLook, customLookFromHtml, withCustomLook } from './customLook'
import { brandFromLook, lookFromBrand, parseBrand } from './brand'
import {
  addSlide,
  readElement,
  replaceSlideHtml,
  setSlideContent,
  slidesFromHtml,
} from './slides'
import { BLANK_SLIDE_HTML, findBlock } from './blocks'
import { checkDeck } from './checkDeck'
import { FIT_SLIDE_FN, SEEK_CORE_FN, shownSlideHtml } from './slideSeek'
import { createDefaultDeckDocument } from './deckDocument'
import {
  addAssetHandler,
  addBlockHandler,
  addSlideHandler,
  deleteElementHandler,
  setDeckHandler,
} from '../agents/handlers'
import type { DeckAgentToolContext } from '../agents/catalog'

const TWO_SLIDE_DECK = `<!DOCTYPE html>
<html><head><style>h1{color:#111}</style></head><body>
  <div id="deck" data-deck-id="deck" data-width="1280" data-height="720">
    <div data-slide><h1>First</h1></div>
    <div data-slide><h1>Second</h1><svg><defs><linearGradient id="grad1"></linearGradient></defs><rect fill="url(#grad1)" /></svg></div>
  </div>
</body></html>`

describe('PureSlides audit fixes', () => {
  it('sanitizes scripts, noscript mXSS, templates, meta, event handlers, and obfuscated dangerous URLs', () => {
    const dirty = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=javascript:alert(1)"></head><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720">
      <div data-slide>
        <h1 onclick="alert(1)">Hello</h1>
        <img src="assets/a.png" onerror="window.parent.pwn=true" />
        <a href="java&#x09;script:alert(2)">link</a>
        <a href="data:image/svg+xml,<svg onload=alert(1)>">svg</a>
        <noscript><p title="</noscript><img src=x onerror=parent.pwn=1>"></noscript>
        <template><script>parent.t=1</script></template>
        <iframe srcdoc="<script>parent.x=1</script>"></iframe>
        <script>window.parent.hacked = true</script>
      </div>
    </div></body></html>`
    const clean = sanitizeForSameOriginMeasure(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('<noscript')
    expect(clean).not.toContain('<template')
    expect(clean).not.toContain('<meta')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('javascript:')
    expect(clean).not.toContain('data:image/svg+xml')
    expect(clean).not.toContain('srcdoc')
    expect(clean).toContain('<h1>Hello</h1>')

    // Percent-encoded schemes & leading whitespace in asset subpaths
    expect(resolveSafePackageRelativePath('C%3A/Windows/win.ini')).toBeNull()
    expect(resolveSafePackageRelativePath('javascript%3Aalert(1)')).toBeNull()
    expect(resolveSafeAssetSubpath(' assets/logo.png')).toBe('logo.png')
  })

  it('escapes speaker notes and scopes inactive SVG defs in printableHtml', () => {
    const printed = printableHtml(TWO_SLIDE_DECK, {
      notesAppendix: true,
      notes: ['Compare A < B & C > D <script>alert(1)</script>', 'Second slide'],
    })
    expect(printed).not.toContain('<script>alert(1)</script>')
    expect(printed).toContain('Compare A &lt; B &amp; C &gt; D &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(printed).toContain('box-sizing: border-box')
    expect(printed).toContain('overflow: visible')
    expect(printed).toContain('.pv-page > #deck { contain: size; }')

    const doc = new DOMParser().parseFromString(printed, 'text/html')
    const pages = [...doc.querySelectorAll('.pv-page[data-slide-index]')]
    // Page 0 must not keep the hidden slide 1's SVG gradient id="grad1"
    expect(pages[0].querySelector('#grad1')).toBeNull()
    // Page 1 keeps active slide 1's SVG gradient id="grad1"
    expect(pages[1].querySelector('#grad1')).not.toBeNull()
  })

  it('rejects path traversal in asset paths, customLook motifs, and video packageSource', () => {
    expect(resolveSafePackageRelativePath('assets/demo.mp4#t=2')).toBe('assets/demo.mp4')
    expect(resolveSafePackageRelativePath('assets/product%20demo.mp4')).toBe('assets/product demo.mp4')
    expect(resolveSafePackageRelativePath('assets/../../secret.mp4')).toBeNull()
    expect(resolveSafePackageRelativePath('assets/%2e%2e/%2e%2e/secret.mp4')).toBeNull()
    expect(resolveSafePackageRelativePath('assets\\..\\secret.mp4')).toBeNull()
    expect(resolveSafePackageRelativePath('/etc/passwd')).toBeNull()
    expect(resolveSafeAssetSubpath('assets/../../evil.png')).toBeNull()
    expect(isSafeAssetFileName('photo.png')).toBe(true)
    expect(isSafeAssetFileName('..')).toBe(false)
    expect(isSafeAssetFileName('../x.png')).toBe(false)
    expect(isSafeAssetFileName('a\\b.png')).toBe(false)

    expect(packageSource('assets/../../outside.mp4', {})).toBeNull()
    expect(packageSource('assets/demo.mp4#t=3', {})).toBe('assets/demo.mp4')
    expect(
      referencedAssetNames('<img src="assets/%2e%2e/%2e%2e/secret.png"><img src="assets/ok.png">'),
    ).toEqual(['ok.png'])

    expect(() =>
      customLook({
        motif: { file: 'assets/../../outside.png', on: 'all', placement: 'cover', opacity: 1 },
      }),
    ).toThrow()
  })

  it('guards prototype properties in inlineAssetUrls and resolvePreviewAssets', async () => {
    const html = '<div id="deck" data-deck-id="deck"><div data-slide><img src="assets/toString"><img src="assets/constructor"></div></div>'
    const inlined = inlineAssetUrls(html, {})
    expect(inlined).not.toContain('native code')
    expect(inlined).toContain('assets/toString')

    const resolved = await resolvePreviewAssets(html, {
      sizeOf: async () => null,
      read: async () => '',
      known: {},
    })
    expect(resolved.inlined).toEqual({})
    expect(resolved.issues.map(i => i.name)).toEqual(['toString', 'constructor'])
  })

  it('preserves $ replacement patterns in deckFromLive', () => {
    const base = createDefaultDeckDocument()
    const withDollars = setSlideContent(base.html, 0, {
      headline: "$$E=mc^2$$ & ($'000) $` $&",
    })
    const livePack = deckToLive({ title: 'Math', html: withDollars })!
    const roundTripped = deckFromLive(livePack.live as unknown as Record<string, unknown>, 'Math')!
    expect(roundTripped.html).toContain("$$E=mc^2$$")
    expect(roundTripped.html).toContain("($'000)")
    expect(slidesFromHtml(roundTripped.html)).toHaveLength(1)
  })

  it('picks 0-based slide-00000.png images without dropping slide 1, and still handles 1-based names', () => {
    const zeroBased = ['/e/slide-00000.png', '/e/slide-00001.png', '/e/slide-00002.png']
    expect(pickSlideImages(zeroBased)).toEqual(zeroBased)
    expect(pickSlideImages(zeroBased, [0, 2])).toEqual(['/e/slide-00000.png', '/e/slide-00002.png'])

    const oneBased = ['/e/slide-1.png', '/e/slide-2.png']
    expect(pickSlideImages(oneBased, [0])).toEqual(['/e/slide-1.png'])
  })

  it('preserves variable font weight range across brandFromLook -> lookFromBrand and parses single-quoted motif URLs', () => {
    const spec = customLook({
      name: 'Acme',
      type: { heading: 'Inter', body: 'Inter' },
      motif: { file: 'assets/motifs/wave.png', on: 'all', placement: 'cover', opacity: 0.8 },
    })
    const saved = brandFromLook({
      spec,
      path: '/brands/acme.designsystem.json',
      logos: [],
      references: [],
      motifs: [],
    })
    const reloaded = lookFromBrand(parseBrand(saved.json), '/brands/acme.designsystem.json')
    const interFace = reloaded.input.faces?.find(f => f.family === 'Inter')
    expect(interFace?.weight).toBe('100 900')

    const htmlWithSingleQuotes = withCustomLook(createDefaultDeckDocument().html, spec).replace(
      'url("assets/motifs/wave.png")',
      "url('assets/motifs/wave.png')",
    )
    const parsed = customLookFromHtml(htmlWithSingleQuotes)
    expect(parsed?.motif?.file).toBe('assets/motifs/wave.png')
  })

  it('replaceSlideHtml replaces a 1-slide deck in place without duplicating', () => {
    const oneSlide = createDefaultDeckDocument().html
    expect(slidesFromHtml(oneSlide)).toHaveLength(1)
    const replaced = replaceSlideHtml(oneSlide, 0, '<div data-slide><h1>Cover</h1><p>Sub</p></div>')
    const slides = slidesFromHtml(replaced)
    expect(slides).toHaveLength(1)
    expect(slides[0].headline).toBe('Cover')

    const multiEl = replaceSlideHtml(oneSlide, 0, '<h1>Heading</h1><p>Body</p>')
    expect(slidesFromHtml(multiEl)).toHaveLength(1)
    expect(slidesFromHtml(multiEl)[0].headline).toBe('Heading')
    expect(slidesFromHtml(multiEl)[0].support).toBe('Body')
  })

  it('handles non-text elements, image placeholder slots, blank slides, and infinite seconds safely', () => {
    const twoCol = addSlide(
      '<!DOCTYPE html><html><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720"></div></body></html>',
      findBlock('two-column')!.html,
    )
    const slotInfo = readElement(twoCol, 0, '1')
    expect(slotInfo?.isImagePlaceholder).toBe(true)

    const filled = setSlideContent(twoCol, 0, { asset: 'assets/hero.png', seconds: Number.POSITIVE_INFINITY })
    expect(slidesFromHtml(filled)[0].asset).toBe('assets/hero.png')
    expect(slidesFromHtml(filled)[0].seconds).toBe(5)

    const withVideo = addSlide(
      '<!DOCTYPE html><html><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720"></div></body></html>',
      '<div data-slide><video><source src="assets/clip.mp4"></video><hr></div>',
    )
    expect(slidesFromHtml(withVideo)[0].asset).toBe('assets/clip.mp4')
    expect(readElement(withVideo, 0, '0')?.editableText).toBe(false)
    expect(readElement(withVideo, 0, '1')?.editableText).toBe(false)

    const blankDeck = addSlide(
      '<!DOCTYPE html><html><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720"></div></body></html>',
      BLANK_SLIDE_HTML,
    )
    expect(slidesFromHtml(blankDeck)).toHaveLength(1)
    expect(slidesFromHtml(blankDeck)[0].block).toBe('blank')
  })

  it('detects missing assets, protocol-relative URLs, and non-cascading step gaps in checkDeck', () => {
    const html = `<!DOCTYPE html><html><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720">
      <div data-slide>
        <h1>Hi</h1>
        <img src="assets/missing.png" />
        <img src="//cdn.example.com/pic.png" />
        <p data-step="2">Two</p>
        <p data-step="3">Three</p>
        <p data-step="4">Four</p>
      </div>
    </div></body></html>`
    const findings = checkDeck(html, { availableAssets: ['present.png'] })
    expect(findings.filter(f => f.code === 'missing-asset')).toHaveLength(1)
    expect(findings.filter(f => f.code === 'remote-image')).toHaveLength(1)
    expect(findings.filter(f => f.code === 'step-gap')).toHaveLength(1)
  })

  it('fixes lowercase SVG collision detection, step flooring, and pv-in stripping in slideSeek', () => {
    expect(FIT_SLIDE_FN).toContain('node.tagName.toUpperCase()')
    expect(SEEK_CORE_FN).toContain('Math.floor')
    const injected = shownSlideHtml(TWO_SLIDE_DECK, 0, 0)
    expect(injected).toContain("clone.classList.remove('pv-in')")
    expect(injected).toContain("clone.classList.remove('pv-out')")
  })

  it('validates agent handler bounds, paths, and dimensions', async () => {
    const base = createDefaultDeckDocument()
    const ctx = {
      document: base,
      documentPath: '/decks/test.deck',
      slides: slidesFromHtml(base.html),
      blocks: [],
      applyDeck: vi.fn(),
      slideOps: { add: vi.fn() },
      deleteElement: vi.fn(),
      addAsset: vi.fn(),
      setAssetRole: vi.fn(),
      addBlock: vi.fn(),
    } as unknown as DeckAgentToolContext

    const badDim = setDeckHandler(ctx, { html: base.html, width: Infinity })
    expect(badDim.isError).toBe(true)

    const badAt = addSlideHandler(ctx, { html: '<div data-slide><h1>X</h1></div>', atIndex: 99 })
    expect(badAt.isError).toBe(true)

    const badPath = deleteElementHandler(ctx, { slideIndex: 0, path: '99.99' })
    expect(badPath.isError).toBe(true)

    const badAssetName = await addAssetHandler(ctx, { sourcePath: '/tmp/a.png', name: '..' })
    expect(badAssetName.isError).toBe(true)

    const badBlockAsset = addBlockHandler(ctx, { blockId: 'video', asset: '..\\evil.mp4' })
    expect(badBlockAsset.isError).toBe(true)

    expect(escapeHtmlText(`"a" & 'b' <c>`)).toBe('&quot;a&quot; &amp; &#39;b&#39; &lt;c&gt;')
  })
})
