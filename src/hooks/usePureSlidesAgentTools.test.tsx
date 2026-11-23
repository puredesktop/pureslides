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

    // Extended mutating tool is blocked while deck is opening
    await expect(
      probe.handlers.callExtendedTool({
        arguments: { tool: 'setBrief', arguments: { brief: 'Old request' } },
      }),
    ).rejects.toThrow('finish opening')
    expect(update).not.toHaveBeenCalled()

    // Extended read-only tool is permitted while opening
    await expect(
      probe.handlers.callExtendedReadTool({
        arguments: { tool: 'listBlocks', arguments: {} },
      }),
    ).resolves.toBeDefined()

    // Once open, extended mutating tool succeeds
    mayChange = true
    await probe.handlers.callExtendedTool({
      arguments: { tool: 'setBrief', arguments: { brief: 'Current deck' } },
    })
    expect(update).toHaveBeenCalledExactlyOnceWith({ brief: 'Current deck' })
  } finally {
    await act(async () => root.unmount())
  }
})

it('refuses a whole-deck rewrite or slide edit that does not name the hash it was read at', async () => {
  const applyDeck = vi.fn(() => ({
    ok: true,
    hash: 'h2',
    changed: true,
    rebased: false,
    warning: null,
    snapshot: null,
  }))
  const move = vi.fn(() => ({
    ok: true,
    hash: 'h3',
    changed: true,
    rebased: false,
    warning: null,
    snapshot: null,
  }))
  const add = vi.fn(() => ({
    ok: true,
    hash: 'h4',
    changed: true,
    rebased: false,
    warning: null,
    snapshot: null,
  }))
  const three =
    '<div id="deck" data-width="1280" data-height="720"><div data-slide><h1>One</h1></div><div data-slide><h1>Two</h1></div><div data-slide><h1>Three</h1></div></div>'
  const context = {
    blocks: [],
    applyDeck,
    document: { html: three },
    slideOps: { move, add },
    ui: { brief: '', slideCount: 3 },
  } as unknown as DeckAgentToolContext

  function Harness() {
    usePureSlidesAgentTools(true, context, () => true)
    return null
  }

  const root = createRoot(document.createElement('div'))
  const deck =
    '<!DOCTYPE html><html><body><div id="deck" data-width="1280" data-height="720"><div data-slide><h1>One</h1></div></div></body></html>'
  try {
    await act(async () => root.render(createElement(Harness)))

    // Direct core tool requires baseHash
    await expect(
      probe.handlers.addSlide({
        arguments: { html: '<div data-slide><h1>Four</h1></div>' },
      }),
    ).rejects.toThrow('baseHash is required')

    // Extended destructive tool requires baseHash (even with confirmDestructive: true)
    await expect(
      probe.handlers.callExtendedTool({
        arguments: {
          tool: 'setDeck',
          arguments: { html: deck },
          confirmDestructive: true,
        },
      }),
    ).rejects.toThrow('baseHash is required')
    await expect(
      probe.handlers.callExtendedTool({
        arguments: {
          tool: 'setDeck',
          arguments: { html: deck, baseHash: '  ' },
          confirmDestructive: true,
        },
      }),
    ).rejects.toThrow('baseHash is required')

    // Extended write tool requires baseHash
    await expect(
      probe.handlers.callExtendedTool({
        arguments: { tool: 'moveSlide', arguments: { from: 2, to: 0 } },
      }),
    ).rejects.toThrow('baseHash is required')

    expect(applyDeck).not.toHaveBeenCalled()
    expect(move).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()

    await probe.handlers.callExtendedTool({
      arguments: {
        tool: 'moveSlide',
        arguments: { from: 2, to: 0, baseHash: 'h1' },
      },
    })
    expect(move).toHaveBeenCalledWith(2, 0, { baseHash: 'h1' })

    await probe.handlers.addSlide({
      arguments: { html: '<div data-slide><h1>Four</h1></div>', baseHash: 'h3' },
    })
    expect(add).toHaveBeenCalledWith(
      '<div data-slide><h1>Four</h1></div>',
      undefined,
      { baseHash: 'h3' },
    )
  } finally {
    await act(async () => root.unmount())
  }
})

it('keeps shared Review tools registered with live handlers while preserving write guards', async () => {
  let mayChange = false
  const context = { blocks: [] } as unknown as DeckAgentToolContext
  const first = vi.fn(async () => ({ content: 'first' }))
  const current = vi.fn(async () => ({ content: 'current' }))
  let calls = first
  function Harness() {
    usePureSlidesAgentTools(true, context, () => mayChange, {
      openReview: calls,
      getReviewFeedback: calls,
      viewReviewItem: calls,
      settleReviewNote: calls,
    })
    return null
  }
  const root = createRoot(document.createElement('div'))
  try {
    await act(async () => root.render(createElement(Harness)))
    for (const name of ['openReview', 'getReviewFeedback', 'viewReviewItem', 'settleReviewNote']) {
      expect(typeof probe.handlers[name]).toBe('function')
    }
    await expect(probe.handlers.openReview({ arguments: {} })).rejects.toThrow('finish opening')
    await expect(probe.handlers.settleReviewNote({ arguments: {} })).rejects.toThrow('finish opening')
    await expect(probe.handlers.getReviewFeedback({ arguments: {} })).resolves.toEqual({ content: 'first' })
    mayChange = true
    calls = current
    await act(async () => root.render(createElement(Harness)))
    await expect(probe.handlers.openReview({ arguments: {} })).resolves.toEqual({ content: 'current' })
    await expect(probe.handlers.viewReviewItem({ arguments: {} })).resolves.toEqual({ content: 'current' })
    await expect(probe.handlers.settleReviewNote({ arguments: {} })).resolves.toEqual({ content: 'current' })
  } finally {
    await act(async () => root.unmount())
  }
})
