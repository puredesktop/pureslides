// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const probe = vi.hoisted(() => ({
  frames: [] as Array<Record<string, unknown>>,
}))
vi.mock('./SlideFrame', () => ({
  SlideFrame: (props: Record<string, unknown>) => {
    probe.frames.push(props)
    return null
  },
}))
import { SlideBoardView } from './SlideBoardView'
import { addSlide, slidesFromHtml } from '../lib/slides'
import { createDefaultDeckDocument, geometryFromHtml } from '../lib/deckDocument'
import type { DeckVerification } from '../lib/deckVerification'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const built = '<div data-slide style="position: absolute; inset: 0"><h1>Two</h1><p data-step="1">a</p><p data-step="2">b</p></div>'
const html = addSlide(createDefaultDeckDocument('Deck').html, built)
const slides = slidesFromHtml(html)
const onSelect = vi.fn()
let root: Root, host: HTMLDivElement

async function render(props: Record<string, unknown> = {}) {
  probe.frames.length = 0
  await act(async () =>
    root.render(
      createElement(SlideBoardView, {
        html,
        slides,
        geometry: geometryFromHtml(html),
        tab: 'slides',
        onTab: vi.fn(),
        assetsPane: createElement('div', { 'data-files': '' }),
        selected: 0,
        onSelect,
        onMove: vi.fn(),
        onDuplicate: vi.fn(),
        onDelete: vi.fn(),
        onAdd: vi.fn(),
        onElementText: vi.fn(),
        onEditElement: vi.fn(),
        onReplaceImage: vi.fn(),
        onEdit: vi.fn(),
        slideSelection: [],
        onSlideSelection: vi.fn(),
        elementSelection: [],
        onElementSelection: vi.fn(),
        onDeleteElements: vi.fn(),
        onSetElementStep: vi.fn(),
        material: [],
        previews: {},
        onAddFiles: vi.fn(),
        onPresent: vi.fn(),
        onExport: vi.fn(),
        onEditHtml: vi.fn(),
        onAsk: vi.fn(),
        asking: false,
        status: 'Saved',
        evidence: {},
        verification: { state: 'verified', message: 'Layout checked' } as DeckVerification,
        onLayout: vi.fn(),
        onRecheck: vi.fn(),
        onHistory: vi.fn(),
        revisionCount: 0,
        deckTitle: 'The deck',
        ...props,
      }),
    ),
  )
}
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const stage = () => probe.frames.find(frame => frame.picking === true)!
/** The ask box: the rail's last text area, the one with state of its own. */
const askBox = () => [...host.querySelectorAll<HTMLTextAreaElement>('aside textarea')].at(-1)!

beforeEach(() => {
  vi.clearAllMocks()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

it('off, it is the full board: cards drag, no compact controls, the stage plays from the top', async () => {
  await render({ selected: 1 })
  expect(button('Next slide')).toBeNull()
  expect(host.textContent).toContain('Click to select')
  expect(host.textContent).not.toContain('The deck')
  expect(host.querySelector('[data-slide-card="0"]')!.getAttribute('draggable')).toBe('true')
  expect(stage().step).toBe(0)
  expect(probe.frames.find(frame => !frame.picking)!.width).toBe(168)
})

it('off, the compact prop changes nothing against leaving it out', async () => {
  await render()
  const without = host.innerHTML
  await render({ compact: false })
  expect(host.innerHTML).toBe(without)
})

it('moves between slides with previous and next, stopping at the ends', async () => {
  await render({ compact: true })
  expect(button('Previous slide')!.disabled).toBe(true)
  await act(async () => button('Next slide')!.click())
  expect(onSelect).toHaveBeenCalledWith(1)
  await render({ compact: true, selected: 1 })
  expect(button('Next slide')!.disabled).toBe(true)
  await act(async () => button('Previous slide')!.click())
  expect(onSelect).toHaveBeenCalledWith(0)
})

it('shows the whole slide, typing stays on, and the thin strip goes on measuring', async () => {
  await render({ compact: true, selected: 1 })
  expect(stage().step).toBe(2)
  expect(stage().onEdit).toBeTypeOf('function')
  const cards = probe.frames.filter(frame => !frame.picking)
  expect(new Set(cards.map(card => card.slide))).toEqual(new Set(slides.map(item => item.index)))
  for (const card of cards) {
    expect(card.width).toBe(96)
    expect(card.onLayout).toBeTypeOf('function')
  }
  expect(host.querySelector('[data-slide-card="0"]')!.getAttribute('draggable')).toBe('false')
  expect(host.textContent).toContain('The deck')
})

it('keeps the hidden chrome mounted, so what was typed there is still there after Expand', async () => {
  await render()
  const ask = askBox()
  const toolbar = host.querySelector('[data-chrome="toolbar"]')
  const rail = host.querySelector('aside')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ask, 'Warm it up')
    ask.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await render({ compact: true })
  expect(host.querySelector('[data-chrome="toolbar"]')).toBe(toolbar)
  expect(host.querySelector('aside')).toBe(rail)
  await render({ compact: false })
  expect(host.querySelector('aside')).toBe(rail)
  expect(askBox().value).toBe('Warm it up')
})

it('a pick in compact leaves a closed inspector closed', async () => {
  await render()
  const inspector = [...host.querySelectorAll('button')].find(item => item.textContent === 'Inspector')!
  await act(async () => inspector.click())
  expect(host.querySelector('aside')).toBeNull()
  await render({ compact: true })
  const pick = stage().onPick as (path: string, label: string, additive: boolean, from: number) => void
  await act(async () => pick('0', 'Headline', false, 0))
  await render({ compact: false })
  expect(host.querySelector('aside')).toBeNull()
})

it('with Files up, compact shows the slides and keeps Files mounted; off, only Files as today', async () => {
  await render({ tab: 'assets' })
  expect(host.querySelector('[data-files]')).not.toBeNull()
  expect(host.querySelector('[data-slide-card]')).toBeNull()
  const files = host.querySelector('[data-files]')
  await render({ tab: 'assets', compact: true })
  expect(host.querySelector('[data-files]')).toBe(files)
  expect(host.querySelector('[data-slide-card]')).not.toBeNull()
  await render({ tab: 'assets' })
  expect(host.querySelector('[data-files]')).toBe(files)
  expect(host.querySelector('[data-slide-card]')).toBeNull()
})

it('the layout picker waits behind compact and the stage stays usable', async () => {
  await render()
  const add = host.querySelector<HTMLButtonElement>('[data-add-slide]')!
  await act(async () => add.click())
  expect(host.querySelector('[role="dialog"]')).not.toBeNull()
  await render({ compact: true })
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  expect(host.querySelector('[data-chrome="toolbar"]')!.parentElement!.hasAttribute('inert')).toBe(false)
})
