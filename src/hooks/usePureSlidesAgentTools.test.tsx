// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { DeckAgentToolContext } from '../agents/catalog'
const probe = vi.hoisted(() => ({
  handlers: {} as Record<
    string,
    (invoke: { arguments?: Record<string, unknown> }) => Promise<unknown>
  >,
}))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformAgentTools', () => ({
  usePlatformAgentTools: ({
    handlers,
  }: {
    handlers: typeof probe.handlers
  }) => {
    probe.handlers = handlers
  },
}))
import { usePureSlidesAgentTools } from './usePureSlidesAgentTools'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
it('blocks drawer changes during switching, permits reads and uses the current guard after opening', async () => {
  let mayChange = false
  const update = vi.fn()
  const context = {
    blocks: [],
    setBrief: update,
    ui: { brief: '', slideCount: 5 },
  } as unknown as DeckAgentToolContext
  function Harness() {
    usePureSlidesAgentTools(true, context, () => mayChange)
    return null
  }
  const root = createRoot(document.createElement('div'))
  try {
    await act(async () => root.render(createElement(Harness)))
    await expect(
      probe.handlers.setBrief({ arguments: { brief: 'Old request' } }),
    ).rejects.toThrow('finish opening')
    expect(update).not.toHaveBeenCalled()
    await expect(probe.handlers.listBlocks({})).resolves.toBeDefined()
    mayChange = true
    await probe.handlers.setBrief({ arguments: { brief: 'Current deck' } })
    expect(update).toHaveBeenCalledExactlyOnceWith({ brief: 'Current deck' })
  } finally {
    await act(async () => root.unmount())
  }
})

it('refuses a whole-deck rewrite or slide edit that does not name the hash it was read at', async () => {
  const applyDeck = vi.fn(() => ({ ok: true, hash: 'h2', changed: true, rebased: false, warning: null, snapshot: null }))
  const move = vi.fn(() => ({ ok: true, hash: 'h3', changed: true, rebased: false, warning: null, snapshot: null }))
  const three =
    '<div id="deck" data-width="1280" data-height="720"><div data-slide><h1>One</h1></div><div data-slide><h1>Two</h1></div><div data-slide><h1>Three</h1></div></div>'
  const context = {
    blocks: [],
    applyDeck,
    document: { html: three },
    slideOps: { move },
    ui: { brief: '', slideCount: 3 },
  } as unknown as DeckAgentToolContext
  function Harness() {
    usePureSlidesAgentTools(true, context, () => true)
    return null
  }
  const root = createRoot(document.createElement('div'))
  const deck = '<!DOCTYPE html><html><body><div id="deck" data-width="1280" data-height="720"><div data-slide><h1>One</h1></div></div></body></html>'
  try {
    await act(async () => root.render(createElement(Harness)))
    await expect(probe.handlers.setDeck({ arguments: { html: deck } })).rejects.toThrow('baseHash is required')
    await expect(probe.handlers.setDeck({ arguments: { html: deck, baseHash: '  ' } })).rejects.toThrow('baseHash is required')
    await expect(probe.handlers.moveSlide({ arguments: { from: 2, to: 0 } })).rejects.toThrow('baseHash is required')
    expect(applyDeck).not.toHaveBeenCalled()
    expect(move).not.toHaveBeenCalled()
    await probe.handlers.moveSlide({ arguments: { from: 2, to: 0, baseHash: 'h1' } })
    expect(move).toHaveBeenCalledWith(2, 0, { baseHash: 'h1' })
  } finally {
    await act(async () => root.unmount())
  }
})
