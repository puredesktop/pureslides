import { expect, it, vi } from 'vitest'
import { createDeckTransitions } from './deckTransitions'
it('saves the current source before loading or installing its replacement', async () => {
  let finish!: () => void
  const events: string[] = [],
    busy = vi.fn()
  const gate = createDeckTransitions(() => {
    events.push('save-old')
    return new Promise(resolve => {
      finish = resolve
    })
  }, busy)
  const work = gate.run(
    async () => {
      events.push('load-new')
      return 'next'
    },
    () => events.push('install-new'),
  )
  expect(events).toEqual(['save-old'])
  expect(gate.busy).toBe(true)
  finish()
  expect(await work).toBe(true)
  expect(events).toEqual(['save-old', 'load-new', 'install-new'])
  expect(gate.busy).toBe(false)
  expect(busy.mock.calls).toEqual([[true], [false]])
})
it('does not replace the current document after a failed save', async () => {
  const load = vi.fn(),
    install = vi.fn(),
    gate = createDeckTransitions(async () => {
      throw Error('Disk full')
    }, vi.fn())
  await expect(gate.run(load, install)).rejects.toThrow('Disk full')
  expect(load).not.toHaveBeenCalled()
  expect(install).not.toHaveBeenCalled()
  expect(gate.busy).toBe(false)
})
it('latest open wins even when an older read or failure finishes last', async () => {
  let finish!: (value: string) => void
  const gate = createDeckTransitions(async () => {}, vi.fn()),
    install = vi.fn()
  const old = gate.run(
    () =>
      new Promise<string>(resolve => {
        finish = resolve
      }),
    install,
  )
  await Promise.resolve()
  expect(await gate.run(async () => 'new', install)).toBe(true)
  finish('old')
  expect(await old).toBe(false)
  expect(install).toHaveBeenCalledExactlyOnceWith('new')
  let fail!: (error: Error) => void
  const obsolete = gate.run(
    () =>
      new Promise<string>((_, reject) => {
        fail = reject
      }),
    install,
  )
  await Promise.resolve()
  await gate.run(async () => 'newer', install)
  fail(Error('Old read failed'))
  expect(await obsolete).toBe(false)
})
it('external refresh loads without writing over the incoming file', async () => {
  const flush = vi.fn(),
    gate = createDeckTransitions(flush, vi.fn()),
    install = vi.fn()
  await gate.run(async () => 'external', install, false)
  expect(flush).not.toHaveBeenCalled()
  expect(install).toHaveBeenCalledWith('external')
})

it('does not install or publish a busy-state update after disposal', async () => {
  let finish!: (value: string) => void
  const busy = vi.fn(),
    install = vi.fn()
  const gate = createDeckTransitions(async () => {}, busy)
  const pending = gate.run(
    () =>
      new Promise<string>(resolve => {
        finish = resolve
      }),
    install,
  )
  await Promise.resolve()
  gate.dispose()
  busy.mockClear()
  finish('obsolete')
  expect(await pending).toBe(false)
  expect(install).not.toHaveBeenCalled()
  expect(busy).not.toHaveBeenCalled()
})
