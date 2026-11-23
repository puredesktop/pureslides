// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const cloudMocks = vi.hoisted(() => ({
  call: vi.fn(),
  getMethods: vi.fn(() => ['cloud.call']),
  standalone: false,
}))

vi.mock('./SlideFrame', () => ({
  SlideFrame: ({ slide, step }: { slide: number; step: number }) =>
    createElement('div', { 'data-mock-slide-frame': `${slide}:${step}` }),
}))

vi.mock('../bridge/platformBridge', () => ({
  bridge: {
    call: cloudMocks.call,
    getMethods: cloudMocks.getMethods,
  },
  isStandaloneDevMode: () => cloudMocks.standalone,
}))

import { SlideGridSorter } from './SlideGridSorter'
import { ThemeStudioPanel } from './ThemeStudioPanel'
import { OutlineStudioModal } from './OutlineStudioModal'
import { DeckHealthDrawer } from './DeckHealthDrawer'
import { DeckShareDrawer } from './DeckShareDrawer'
import { CommandPalette } from './CommandPalette'
import { PresentWindow } from './PresentWindow'
import { ExportDialog } from './ExportDialog'
import { createStandaloneSampleDeck } from '../lib/outlineToDeck'
import { slidesFromHtml, addSlide } from '../lib/slides'
import { BLANK_SLIDE_HTML } from '../lib/blocks'
import type { DeckGeometry } from '../types'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const GEOMETRY: DeckGeometry = { width: 1280, height: 720, deckId: 'deck' }

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  vi.clearAllMocks()
  cloudMocks.standalone = false
  cloudMocks.getMethods.mockReturnValue(['cloud.call'])
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('PureSlides Next UI integration', () => {
  it('SlideGridSorter renders all slides with badges and triggers open, duplicate, delete, and add', async () => {
    const deck = createStandaloneSampleDeck()
    const slides = slidesFromHtml(deck.html)
    const onSelect = vi.fn()
    const onOpenSlide = vi.fn()
    const onDuplicate = vi.fn()
    const onDelete = vi.fn()
    const onAddSlide = vi.fn()

    await act(async () => {
      root.render(
        createElement(SlideGridSorter, {
          html: deck.html,
          slides,
          geometry: GEOMETRY,
          selected: 0,
          previews: {},
          evidence: {},
          onSelect,
          onOpenSlide,
          onMove: vi.fn(),
          onDuplicate,
          onDelete,
          onAddSlide,
          onLayout: vi.fn(),
        }),
      )
    })

    const cards = host.querySelectorAll('[data-grid-slide]')
    expect(cards).toHaveLength(5)
    expect(host.textContent).toContain('3 steps')
    expect(host.textContent).toContain('notes')

    const editBtns = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Edit')
    const dupBtns = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Dup')
    const delBtns = [...host.querySelectorAll('button')].filter(b => b.textContent === 'Del')

    await act(async () => editBtns[1].click())
    expect(onOpenSlide).toHaveBeenCalledWith(1)

    await act(async () => dupBtns[2].click())
    expect(onDuplicate).toHaveBeenCalledWith(2)

    await act(async () => delBtns[0].click())
    expect(onDelete).toHaveBeenCalledWith(0)

    const addBtn = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Add slide'))!
    await act(async () => addBtn.click())
    expect(onAddSlide).toHaveBeenCalledTimes(1)
  })

  it('ThemeStudioPanel displays WCAG contrast badges and applies font/theme changes', async () => {
    const deck = createStandaloneSampleDeck()
    const onApplyCustomLook = vi.fn()
    const onResetStockLook = vi.fn()

    await act(async () => {
      root.render(
        createElement(ThemeStudioPanel, {
          html: deck.html,
          look: 'auto',
          onApplyCustomLook,
          onResetStockLook,
        }),
      )
    })

    expect(host.textContent).toContain('AAA')
    expect(host.querySelector('#theme-font-heading')).not.toBeNull()
    expect(host.querySelector('#theme-font-body')).not.toBeNull()
    expect(host.querySelector('#theme-font-mono')).not.toBeNull()

    // Toggle Dark theme
    const darkBtn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Dark')!
    await act(async () => darkBtn.click())
    expect(onApplyCustomLook).toHaveBeenCalledTimes(1)
    expect(onApplyCustomLook.mock.calls[0][0].colors.bg).toBe('#14191e')

    // Reset back to stock
    const resetBtn = [...host.querySelectorAll('button')].find(b => b.textContent === 'Reset')!
    await act(async () => resetBtn.click())
    expect(onResetStockLook).toHaveBeenCalledWith('auto')
  })

  it('OutlineStudioModal previews parsed Markdown slides and calls onApply', async () => {
    const onApply = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        createElement(OutlineStudioModal, {
          open: true,
          onClose,
          onApply,
        }),
      )
    })

    expect(host.textContent).toContain('5 slides')
    const replaceBtn = [...host.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Generate / Replace slides'),
    )!
    await act(async () => replaceBtn.click())
    expect(onApply).toHaveBeenCalledWith(expect.stringContaining('Built for clarity'), 'replace')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('DeckHealthDrawer displays score, findings, and triggers 1-click auto-fixes', async () => {
    let html = createStandaloneSampleDeck().html
    html = addSlide(
      html,
      '<div data-slide><h1>Gap Slide</h1><p data-step="1">A</p><p data-step="4">B</p></div>',
    )
    html = addSlide(html, BLANK_SLIDE_HTML)

    const onSelectSlide = vi.fn()
    const onAutoFixSteps = vi.fn()
    const onAutoFixContrast = vi.fn()
    const onAutoFixTrimBlanks = vi.fn()

    await act(async () => {
      root.render(
        createElement(DeckHealthDrawer, {
          open: true,
          onClose: vi.fn(),
          html,
          verification: {
            state: 'verified',
            failedSlides: [],
            checkingSlides: [],
            message: 'Layout checked',
          },
          onSelectSlide,
          onRecheck: vi.fn(),
          onAutoFixSteps,
          onAutoFixContrast,
          onAutoFixTrimBlanks,
        }),
      )
    })

    const scoreEl = host.querySelector('[data-health-score]')
    expect(scoreEl).not.toBeNull()
    expect(Number(scoreEl?.getAttribute('data-health-score'))).toBeLessThan(100)

    const stepsBtn = [...host.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Renumber build steps'),
    )!
    const contrastBtn = [...host.querySelectorAll('button')].find(b =>
      b.textContent?.includes('High-contrast Clear look'),
    )!
    const trimBtn = [...host.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Trim blank trailing slides'),
    )!

    await act(async () => stepsBtn.click())
    await act(async () => contrastBtn.click())
    await act(async () => trimBtn.click())

    expect(onAutoFixSteps).toHaveBeenCalledTimes(1)
    expect(onAutoFixContrast).toHaveBeenCalledTimes(1)
    expect(onAutoFixTrimBlanks).toHaveBeenCalledTimes(1)
  })

  it('DeckShareDrawer offers Portable HTML fallback when PureServer is offline and publishes when connected', async () => {
    const deck = createStandaloneSampleDeck()
    const slides = slidesFromHtml(deck.html)
    const onExportPortableHtml = vi.fn()
    const onPublishedDeckChange = vi.fn()

    // 1. Offline mode
    cloudMocks.standalone = true
    // Close and reopen drawer in connected PureServer mode so status check runs fresh
    await act(async () => {
      root.render(
        createElement(DeckShareDrawer, {
          open: false,
          onClose: vi.fn(),
          title: deck.title,
          html: deck.html,
          slides,
          publishedDeck: null,
          onPublishedDeckChange,
          broadcastLive: false,
          onBroadcastLiveChange: vi.fn(),
          onSelectSlide: vi.fn(),
          onExportPortableHtml,
        }),
      )
    })

    await act(async () => {
      root.render(
        createElement(DeckShareDrawer, {
          open: true,
          onClose: vi.fn(),
          title: deck.title,
          html: deck.html,
          slides,
          publishedDeck: null,
          onPublishedDeckChange,
          broadcastLive: false,
          onBroadcastLiveChange: vi.fn(),
          onSelectSlide: vi.fn(),
          onExportPortableHtml,
        }),
      )
    })
    expect(host.textContent).toContain('PureServer is not attached')
    const fallbackBtn = [...host.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Export Portable HTML'),
    )!
    await act(async () => fallbackBtn.click())
    expect(onExportPortableHtml).toHaveBeenCalledTimes(1)

    // 2. Connected PureServer mode
    cloudMocks.standalone = false
    cloudMocks.call.mockImplementation(async (_method: string, args: Array<{ action: string }>) => {
      const action = args[0]?.action
      if (action === 'status') return { connected: true, publicUrl: 'https://cloud.purescience.local' }
      if (action === 'publishDeck') {
        return {
          item: {
            id: 'pub-1',
            url: 'https://cloud.purescience.local/deck/tok123',
            token: 'tok123',
            activeVersion: 1,
          },
          version: 1,
        }
      }
      if (action === 'get') {
        return {
          item: {
            id: 'pub-1',
            url: 'https://cloud.purescience.local/deck/tok123',
            activeVersion: 1,
          },
          versions: [],
          comments: [{ id: 'c1', targetIndex: 2, author: 'Alex', body: 'Great chart!' }],
        }
      }
      return {}
    })

    // Close and reopen drawer in connected PureServer mode so status check runs fresh
    await act(async () => {
      root.render(
        createElement(DeckShareDrawer, {
          open: false,
          onClose: vi.fn(),
          title: deck.title,
          html: deck.html,
          slides,
          publishedDeck: null,
          onPublishedDeckChange,
          broadcastLive: false,
          onBroadcastLiveChange: vi.fn(),
          onSelectSlide: vi.fn(),
          onExportPortableHtml,
        }),
      )
    })

    await act(async () => {
      root.render(
        createElement(DeckShareDrawer, {
          open: true,
          onClose: vi.fn(),
          title: deck.title,
          html: deck.html,
          slides,
          publishedDeck: null,
          onPublishedDeckChange,
          broadcastLive: false,
          onBroadcastLiveChange: vi.fn(),
          onSelectSlide: vi.fn(),
          onExportPortableHtml,
        }),
      )
    })

    await vi.waitFor(() => expect(host.textContent).toContain('Publish live link'))
    const publishBtn = [...host.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Publish live link'),
    )!
    await act(async () => publishBtn.click())
    expect(onPublishedDeckChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pub-1', url: 'https://cloud.purescience.local/deck/tok123' }),
    )
  })

  it('CommandPalette searches slides, blocks, looks, and actions and runs selection', async () => {
    const deck = createStandaloneSampleDeck()
    const slides = slidesFromHtml(deck.html)
    const onApplyLook = vi.fn()
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        createElement(CommandPalette, {
          open: true,
          onClose,
          slides,
          onSelectSlide: vi.fn(),
          onAddBlock: vi.fn(),
          onApplyLook,
          onPresent: vi.fn(),
          onToggleGrid: vi.fn(),
          onOpenOutline: vi.fn(),
          onOpenThemeStudio: vi.fn(),
          onOpenHealth: vi.fn(),
          onOpenShare: vi.fn(),
          onOpenExport: vi.fn(),
          onExportPortableHtml: vi.fn(),
          onDuplicateSlide: vi.fn(),
        }),
      )
    })

    const input = host.querySelector<HTMLInputElement>('input[aria-label="Search commands"]')!
    expect(input).not.toBeNull()

    // Simulate typing "paper" via React-compatible input setter
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'paper')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const option = [...host.querySelectorAll('[role="option"]')].find(el =>
      el.textContent?.includes('Apply look: Paper'),
    ) as HTMLButtonElement | undefined
    expect(option).toBeDefined()
    await act(async () => option!.click())
    expect(onApplyLook).toHaveBeenCalledWith('paper')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('PresentWindow supports Whiteout (W), Laser (L), Grid (G), Notes A+/A-, Pacing bar, and Broadcast live', async () => {
    const deck = createStandaloneSampleDeck()
    const slides = slidesFromHtml(deck.html)
    cloudMocks.call.mockResolvedValue({ ok: true })

    await act(async () => {
      root.render(
        createElement(PresentWindow, {
          open: true,
          onClose: vi.fn(),
          html: deck.html,
          slides,
          geometry: GEOMETRY,
          from: 0,
          publishedDeckId: 'pub-live-1',
          broadcastLive: true,
          onBroadcastLiveChange: vi.fn(),
        }),
      )
    })

    // Enter presenter console
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', cancelable: true }))
    })
    expect(host.textContent).toContain('Open Audience Window')
    expect(host.textContent).toContain('Broadcasting live')

    // Whiteout (W)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', cancelable: true }))
    })
    expect(host.textContent).toContain('WHITEOUT (W)')

    // Toggle whiteout off & Laser (L) on
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', cancelable: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', cancelable: true }))
    })
    expect(host.textContent).toContain('LASER ON (L)')

    // Quick Slide Jump Grid (G)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', cancelable: true }))
    })
    expect(host.querySelector('[aria-label="Quick slide jump grid"]')).not.toBeNull()
    // Jump to slide 3
    const jumpCards = host.querySelectorAll('[aria-label="Quick slide jump grid"] button')
    // Button 0 is Close (Esc), buttons 1..5 are slides 1..5
    await act(async () => (jumpCards[3] as HTMLButtonElement).click())
    expect(host.textContent).toContain('slide 3 of 5')

    // Speaker notes A+ / A- buttons exist
    expect(host.querySelector('[aria-label="Increase notes font size"]')).not.toBeNull()
    expect(host.querySelector('[aria-label="Decrease notes font size"]')).not.toBeNull()

    // Enter target minutes -> visual pacing bar appears
    const targetInput = host.querySelector<HTMLInputElement>('#rehearsal-target')!
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(targetInput, '10')
      targetInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(host.querySelector('[aria-label="Pacing bar"]')).not.toBeNull()

    // PureCloud setPresenterState was called for live broadcast
    expect(cloudMocks.call).toHaveBeenCalledWith(
      'cloud.call',
      expect.arrayContaining([
        expect.objectContaining({
          service: 'publish',
          action: 'setPresenterState',
        }),
      ]),
    )
  })

  it('ExportDialog exposes Portable HTML option and invokes onExport("html", false)', async () => {
    const deck = createStandaloneSampleDeck()
    const slides = slidesFromHtml(deck.html)
    const onExport = vi.fn()

    await act(async () => {
      root.render(
        createElement(ExportDialog, {
          open: true,
          onClose: vi.fn(),
          html: deck.html,
          slides,
          progress: { phase: 'idle', unit: 0, unitCount: 0, message: '' },
          lastExportPath: null,
          verification: {
            state: 'verified',
            failedSlides: [],
            checkingSlides: [],
            message: 'Layout checked',
          },
          standaloneDev: true,
          onExport,
          onCancel: vi.fn(),
          onReveal: vi.fn(),
        }),
      )
    })

    expect(host.textContent).toContain('Portable HTML')
    const exportBtn = [...host.querySelectorAll('button')].find(b =>
      b.textContent?.includes('Export Portable HTML'),
    )!
    await act(async () => exportBtn.click())
    expect(onExport).toHaveBeenCalledWith('html', false)
  })
})
