import { describe, expect, it } from 'vitest'
import { setLookHandler } from './handlers'
import type { DeckAgentToolContext } from './catalog'

const text = (result: { content: unknown }) => JSON.stringify(result.content)

describe('setLook', () => {
  it('sets a look by id through the door and says what it set', () => {
    const calls: [string, unknown][] = []
    const context = {
      setLook: (look: string, options: unknown) => {
        calls.push([look, options])
        return { ok: true, hash: 'h2', changed: true, rebased: false, warning: null, snapshot: null }
      },
    } as unknown as DeckAgentToolContext
    const result = setLookHandler(context, { look: 'Paper', baseHash: 'h1' })
    expect(calls).toEqual([['paper', { baseHash: 'h1' }]])
    expect(text(result)).toContain('Newsreader Display')
    expect(text(result)).toContain('h2')
  })

  it('refuses a look it does not have, naming the ones it does', () => {
    const context = { setLook: () => { throw new Error('not called') } } as unknown as DeckAgentToolContext
    const result = setLookHandler(context, { look: 'neon' })
    expect(text(result)).toContain('auto, ink, paper, signal, brief, gallery, clear')
  })
})
