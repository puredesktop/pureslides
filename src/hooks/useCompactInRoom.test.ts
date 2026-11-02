// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'

const probe = vi.hoisted(() => ({
  adjacent: null as { tabId: string; name: string } | null,
}))
vi.mock('@purescience/platform-ui/bridge/react/useAdjacentApp', () => ({
  useAdjacentApp: () => probe.adjacent,
}))
import { useCompactInRoom } from './useCompactInRoom'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

async function compactBeside(name: string | null): Promise<boolean> {
  probe.adjacent = name === null ? null : { tabId: 'tab', name, ...(name === 'Executive' ? { heldInRoom: true } : {}) }
  let seen: boolean | undefined
  function Harness() {
    seen = useCompactInRoom()
    return null
  }
  const root = createRoot(document.createElement('div'))
  await act(async () => root.render(createElement(Harness)))
  await act(async () => root.unmount())
  return seen as boolean
}

it('is on beside Executive', async () => {
  expect(await compactBeside('Executive')).toBe(true)
})

it.each([
  ['alone', null],
  ['beside another app', 'Mail'],
  ['beside itself', 'Slides'],
  ['for a different case', 'executive'],
  ['for a longer name', 'Executive team'],
  ['for an empty name', ''],
])('is off %s', async (_case, name) => {
  expect(await compactBeside(name)).toBe(false)
})
