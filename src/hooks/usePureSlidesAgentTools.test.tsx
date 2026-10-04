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
