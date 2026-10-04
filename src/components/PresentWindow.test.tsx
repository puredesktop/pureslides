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
let host: HTMLDivElement
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
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
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
it('lets the presenter type a target without moving the deck', async () => {
  await render()
  await key('s')
  const input = host.querySelector<HTMLInputElement>('#rehearsal-target')!
  expect(input).not.toBeNull()
  const arrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
  await act(async () => input.dispatchEvent(arrow))
  expect(arrow.defaultPrevented).toBe(false)
  expect(live().slide).toBe(0)
  await key('ArrowRight', true)
  expect(live().slide).toBe(1)
})
it('tracks visits after clamping an out-of-range start and excludes paused time', async () => {
  let clock = 0
  const timing = vi.spyOn(performance, 'now').mockImplementation(() => clock)
  try {
    await render(true, 99)
    await key('s')
    clock = 5000
    await key('ArrowLeft', true)
    const rows = () => [...host.querySelectorAll('[aria-label="Rehearsal timing report"] > div')].slice(1)
    expect(rows()[2].textContent).toContain('00:05')
    expect(rows()[1].lastElementChild?.textContent).toBe('1')
    const click = async (name: string) => { await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name)!.click()) }
    clock = 8000; await click('Pause')
    clock = 18000; await click('Resume')
    expect(rows()[1].textContent).toContain('00:03')
    clock = 20000; await key('Home', true)
    expect(rows()[1].textContent).toContain('00:05')
    expect(rows()[1].lastElementChild?.textContent).toBe('1')
  } finally { timing.mockRestore() }
})
