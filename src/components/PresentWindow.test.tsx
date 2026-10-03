// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const probe = vi.hoisted(() => ({
  frames: [] as {
    slide: number
    step: number
    live?: boolean
    onKeyDown?: (key: string) => void
  }[],
}))
vi.mock('./SlideFrame', () => ({
  SlideFrame: (props: {
    slide: number
    step: number
    live?: boolean
    onKeyDown?: (key: string) => void
  }) => {
    probe.frames.push(props)
    return null
  },
}))
import { PresentWindow } from './PresentWindow'
import { createDefaultDeckDocument } from '../lib/deckDocument'
import { slidesFromHtml, addSlide } from '../lib/slides'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root
const close = vi.fn(),
  position = vi.fn()
const html = addSlide(
  addSlide(
    createDefaultDeckDocument().html,
    '<div data-slide><h1>Second</h1><p data-step="1">A build</p></div>',
  ),
  '<div data-slide><h1>Last</h1></div>',
)
const slides = slidesFromHtml(html)
const geometry = { width: 1280, height: 720, deckId: 'deck' }
async function render(open = true, from = 0, current = slides) {
  await act(async () =>
    root.render(
      createElement(PresentWindow, {
        open,
        from,
        html,
        slides: current,
        geometry,
        onClose: close,
        onPositionChange: position,
      }),
    ),
  )
}
const live = () => probe.frames.filter(frame => frame.live).at(-1)!
async function key(key: string, inside = false) {
  await act(async () => {
    if (inside) live().onKeyDown?.(key)
    else
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key, cancelable: true }),
      )
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  probe.frames = []
  root = createRoot(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root.unmount())
})
it('advances builds before slides using either window or focused-frame keys', async () => {
  await render(true, 1)
  expect(live().slide).toBe(1)
  expect(live().step).toBe(0)
  await key('ArrowRight', true)
  expect(live().step).toBe(1)
  await key('ArrowRight')
  expect(live().slide).toBe(2)
  await key('ArrowLeft', true)
  expect(live()).toEqual(expect.objectContaining({ slide: 1, step: 1 }))
  await key('Escape', true)
  expect(close).toHaveBeenCalledTimes(1)
})
it('clamps invalid starting positions and a position after the deck shrinks', async () => {
  await render(true, 99)
  expect(live().slide).toBe(2)
  await render(true, 99, slides.slice(0, 1))
  expect(live().slide).toBe(0)
  await render(false)
  await render(true, -5)
  expect(live().slide).toBe(0)
})
it('clears a partial number jump when presenting starts again', async () => {
  await render()
  await key('3')
  await render(false)
  await render()
  await key('Enter')
  expect(live().slide).toBe(0)
  await key('3', true)
  await key('Enter', true)
  expect(live().slide).toBe(2)
})
it('ignores presentation keys while closed', async () => {
  await render(false)
  await key('Escape')
  expect(close).not.toHaveBeenCalled()
})
