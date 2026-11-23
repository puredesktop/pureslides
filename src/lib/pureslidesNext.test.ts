// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createDefaultDeckDocument } from './deckDocument'
import { addSlide, slidesFromHtml } from './slides'
import { BLANK_SLIDE_HTML, findBlock } from './blocks'
import { checkDeck, hasBlockingFinding } from './checkDeck'
import { contrast } from './customLook'
import { lookFromHtml } from './deckLooks'
import {
  INSERTABLE_ELEMENTS,
  REMIXABLE_BLOCK_IDS,
  insertSlideElement,
  remixSlideLayout,
} from './layoutRemix'
import {
  createStandaloneSampleDeck,
  outlineToDeckHtml,
  parseOutlineToSlides,
} from './outlineToDeck'
import { buildPortableDeckHtml } from './portableDeckHtml'
import {
  autoFixHighContrastLook,
  autoFixRenumberSteps,
  autoFixTrimBlankSlides,
  evaluateDeckHealth,
  wcagBadge,
} from './deckHealth'
import { buildPublishDeckPayload } from './pureCloudDeckClient'

describe('layoutRemix & insertSlideElement', () => {
  it('remixes a points slide across all compatible blocks while preserving headline, items, notes, and metadata', () => {
    const base = createDefaultDeckDocument('Remix Deck').html
    const pointsBlock = findBlock('points')!
    let html = addSlide(base, pointsBlock.html)
    // Inject custom headline, support, items, notes, seconds, and slide-id on slide 1
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const slide = doc.querySelectorAll('[data-slide]')[1]!
    slide.setAttribute('data-slide-id', 'sld-remix-1')
    slide.setAttribute('data-seconds', '12')
    slide.querySelector('h1')!.textContent = 'Core Architecture Pillars'
    slide.querySelector('p')!.textContent = 'Designed for clarity and offline speed.'
    const stepped = slide.querySelectorAll('[data-step]')
    stepped[0].textContent = 'Zero dependencies'
    stepped[1].textContent = 'Bundled OFL typography'
    stepped[2].textContent = 'Instant live sync'
    const notes = doc.createElement('div')
    notes.setAttribute('data-notes', '')
    notes.setAttribute('hidden', '')
    notes.textContent = 'Remember to mention offline conference rooms.'
    slide.appendChild(notes)
    html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`

    for (const targetId of REMIXABLE_BLOCK_IDS) {
      const remixed = remixSlideLayout(html, 1, targetId)
      const slides = slidesFromHtml(remixed)
      expect(slides[1].block).toBe(targetId)
      expect(slides[1].headline).toContain('Core Architecture Pillars')
      expect(slides[1].notes).toBe('Remember to mention offline conference rooms.')
      expect(slides[1].seconds).toBe(12)

      const parsed = new DOMParser().parseFromString(remixed, 'text/html')
      const el = parsed.querySelectorAll('[data-slide]')[1]!
      expect(el.getAttribute('data-slide-id')).toBe('sld-remix-1')

      if (['points', 'cards', 'agenda', 'steps', 'two-column'].includes(targetId)) {
        expect(el.textContent).toContain('Zero dependencies')
        expect(el.textContent).toContain('Bundled OFL typography')
      }
    }
  })

  it('preserves existing image media when remixing into two-column', () => {
    const base = createDefaultDeckDocument('Media Remix').html
    const mediaSlide = `<div data-slide data-block="screenshot"><h1>Live Dashboard</h1><p>Real-time telemetry</p><img src="assets/hero.png" alt="hero" /></div>`
    const html = addSlide(base, mediaSlide)
    const remixed = remixSlideLayout(html, 1, 'two-column')
    const parsed = new DOMParser().parseFromString(remixed, 'text/html')
    const img = parsed.querySelectorAll('[data-slide]')[1]?.querySelector('img')
    expect(img?.getAttribute('src')).toBe('assets/hero.png')
  })

  it('inserts all 8 quick-bar elements cleanly before hidden speaker notes', () => {
    let html = createDefaultDeckDocument('Insert Test').html
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const slide = doc.querySelector('[data-slide]')!
    const notes = doc.createElement('div')
    notes.setAttribute('data-notes', '')
    notes.setAttribute('hidden', '')
    notes.textContent = 'Keep at end'
    slide.appendChild(notes)
    html = `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`

    for (const def of INSERTABLE_ELEMENTS) {
      html = insertSlideElement(html, 0, def.id)
    }

    const finalDoc = new DOMParser().parseFromString(html, 'text/html')
    const finalSlide = finalDoc.querySelector('[data-slide]')!
    expect(finalSlide.querySelector('h2')).not.toBeNull()
    expect(finalSlide.querySelector('table')).not.toBeNull()
    expect(finalSlide.querySelector('svg')).not.toBeNull()
    expect(finalSlide.querySelector('pre code')).not.toBeNull()
    // Speaker notes remain the last element
    expect(finalSlide.lastElementChild?.hasAttribute('data-notes')).toBe(true)
  })
})

describe('outlineToDeck', () => {
  it('parses title, bullets with [step], stats, figures, quote, table, and speaker notes deterministically', () => {
    const md = [
      'Kicker: Launch Brief',
      '# PureSlides Next',
      'Swiss clarity for every room.',
      'Notes: Intro note.',
      '---',
      '# Key Pillars',
      '- Fast markdown authoring [step]',
      '- Offline HTML export [step]',
      '- Live laser sync',
      '---',
      '# Conversion lift',
      '84% | Teams shipping decks in half the time',
      '---',
      '# Quarter Metrics',
      '3× | Faster prep',
      '99.9% | Offline uptime',
      '14 ms | Frame switch',
      '---',
      '> Simplicity is prerequisite for reliability.',
      '> — Edsger Dijkstra',
      '---',
      '# Feature Matrix',
      '| Feature | Legacy | PureSlides |',
      '| --- | --- | --- |',
      '| Export | Cloud only | Single HTML |',
      '| Sync | Plugin | Built-in |',
      'Notes: Table walkthrough.',
    ].join('\n')

    const parsed = parseOutlineToSlides(md)
    expect(parsed).toHaveLength(6)
    expect(parsed[0].kind).toBe('title')
    expect(parsed[0].notes).toBe('Intro note.')

    expect(parsed[1].kind).toBe('points')
    expect(parsed[1].steps).toBe(2)
    expect(parsed[1].bullets).toHaveLength(3)

    expect(parsed[2].kind).toBe('stat')
    expect(parsed[2].stats[0]).toEqual({ value: '84%', label: 'Teams shipping decks in half the time' })

    expect(parsed[3].kind).toBe('figures')
    expect(parsed[3].stats).toHaveLength(3)

    expect(parsed[4].kind).toBe('quote')
    expect(parsed[4].quote?.attribution).toBe('Edsger Dijkstra')

    expect(parsed[5].kind).toBe('table')
    expect(parsed[5].table?.headers).toEqual(['Feature', 'Legacy', 'PureSlides'])
    expect(parsed[5].table?.rows).toHaveLength(2)
    expect(parsed[5].notes).toBe('Table walkthrough.')
  })

  it('compiles outline in both replace and append modes', () => {
    const base = createDefaultDeckDocument('Base').html
    const replaced = outlineToDeckHtml(base, '# One\n\n---\n\n# Two', 'replace')
    expect(slidesFromHtml(replaced.html)).toHaveLength(2)

    const appended = outlineToDeckHtml(replaced.html, '# Three', 'append')
    expect(slidesFromHtml(appended.html)).toHaveLength(3)
    expect(slidesFromHtml(appended.html)[2].headline).toBe('Three')
  })

  it('builds a valid 5-slide standalone sample deck with zero blocking errors', () => {
    const sample = createStandaloneSampleDeck()
    const slides = slidesFromHtml(sample.html)
    expect(slides).toHaveLength(5)
    expect(hasBlockingFinding(checkDeck(sample.html))).toBe(false)
  })
})

describe('portableDeckHtml', () => {
  it('generates a single self-contained HTML presentation with interactive player and inlined assets', () => {
    const base = createStandaloneSampleDeck()
    const htmlWithImg = addSlide(
      base.html,
      '<div data-slide><h1>Asset Test</h1><img src="assets/chart.png" alt="chart" /></div>',
    )
    const portable = buildPortableDeckHtml(htmlWithImg, {
      title: 'Q4 <Board> Deck',
      previews: { 'chart.png': 'data:image/png;base64,AAAA' },
    })

    expect(portable).toContain('<!DOCTYPE html>')
    expect(portable).toContain('<title>Q4 &lt;Board&gt; Deck</title>')
    expect(portable).toContain('data:image/png;base64,AAAA')
    expect(portable).toContain('renderSlideIn')
    expect(portable).toContain('ps-grid')
    expect(portable).toContain('toggleFullscreen')
    expect(portable).toContain('touchstart')
    expect(portable).toContain("veilMode === 'white'")
  })
})

describe('deckHealth, WCAG contrast & auto-fixes', () => {
  it('rates WCAG contrast thresholds accurately', () => {
    expect(wcagBadge(contrast('#000000', '#ffffff'))).toBe('AAA')
    expect(wcagBadge(contrast('#666666', '#ffffff'))).toBe('AA')
    expect(wcagBadge(contrast('#767676', '#ffffff'))).toBe('AA')
    expect(wcagBadge(contrast('#949494', '#ffffff'))).toBe('AA Large')
    expect(wcagBadge(contrast('#cccccc', '#ffffff'))).toBe('Fail')
  })

  it('scores deck health and deterministically auto-fixes step gaps, contrast look, and trailing blanks', () => {
    let html = createDefaultDeckDocument('Health Test').html
    html = addSlide(
      html,
      '<div data-slide><h1>Build Gaps</h1><p data-step="1">One</p><p data-step="4">Skipped</p></div>',
    )
    html = addSlide(html, BLANK_SLIDE_HTML)
    html = addSlide(html, BLANK_SLIDE_HTML)

    const report = evaluateDeckHealth(html, {
      state: 'failed',
      failedSlides: [2],
      checkingSlides: [],
      message: 'Slide 2 has overlapping text',
    })
    expect(report.score).toBeLessThan(85)
    expect(report.hasStepGaps).toBe(true)
    expect(report.trailingBlankCount).toBe(2)
    expect(report.overlapSlides).toEqual([2])

    // Auto-fix 1: renumber steps
    const fixedSteps = autoFixRenumberSteps(html)
    expect(checkDeck(fixedSteps).some(f => f.code === 'step-gap')).toBe(false)
    expect(slidesFromHtml(fixedSteps)[1].steps).toBe(2)

    // Auto-fix 2: trim blank trailing slides
    const trimmed = autoFixTrimBlankSlides(fixedSteps)
    expect(slidesFromHtml(trimmed)).toHaveLength(2)

    // Auto-fix 3: switch to high-contrast clear look
    const clearHtml = autoFixHighContrastLook(trimmed)
    expect(lookFromHtml(clearHtml)).toBe('clear')
  })
})

describe('pureCloudDeckClient payload builder', () => {
  it('extracts width, height, look, deckCss, and per-slide payloads cleanly', () => {
    const sample = createStandaloneSampleDeck()
    const slides = slidesFromHtml(sample.html)
    const payload = buildPublishDeckPayload(sample.html, slides, sample.title)
    expect(payload.title).toBe(sample.title)
    expect(payload.width).toBe(1280)
    expect(payload.height).toBe(720)
    expect(payload.look).toBe('auto')
    expect(payload.deckCss).toContain('--slide-bg')
    expect(payload.slides).toHaveLength(5)
    expect(payload.slides[1].steps).toBe(3)
    expect(payload.slides[0].notes).toBeTruthy()
  })
})
