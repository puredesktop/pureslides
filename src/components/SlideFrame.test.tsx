// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock(
  '@purescience/platform-ui/components/assets/EmbeddedVideoPreview',
  () => ({
    EmbeddedVideoPreview: () => null,
    prepareEmbeddedVideoPreview: (html: string) => html,
    restoreEmbeddedVideoPreview: (html: string) => html,
  }),
)
import { SlideFrame } from './SlideFrame'
import { createDefaultDeckDocument } from '../lib/deckDocument'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root, host: HTMLDivElement
const key = vi.fn(),
  html = createDefaultDeckDocument().html
async function render(slide = 0, step = 0) {
  await act(async () =>
    root.render(
      createElement(SlideFrame, {
        html,
        slide,
        step,
        geometry: { width: 1280, height: 720, deckId: 'deck' },
        width: 620,
        live: true,
        onKeyDown: key,
      }),
    ),
  )
}
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
it('accepts keys only from its own iframe and enables forwarding again after ready', async () => {
  await render()
  const frame = host.querySelector('iframe')!,
    post = vi.spyOn(frame.contentWindow!, 'postMessage')
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: { type: 'pureslides:ready' },
      }),
    ),
  )
  expect(post).toHaveBeenCalledWith(
    { type: 'pureslides:keyboard', on: true },
    '*',
  )
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: { type: 'pureslides:key', key: 'Escape' },
      }),
    ),
  )
  expect(key).not.toHaveBeenCalled()
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: { type: 'pureslides:key', key: 'Escape' },
      }),
    ),
  )
  expect(key).toHaveBeenCalledExactlyOnceWith('Escape')
})
it('keeps the iframe document stable while seeking a slide and step', async () => {
  await render()
  const frame = host.querySelector('iframe')!,
    source = frame.srcdoc
  await render(1, 2)
  expect(host.querySelector('iframe')).toBe(frame)
  expect(frame.srcdoc).toBe(source)
})
