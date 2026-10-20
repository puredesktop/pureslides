import { describe, expect, it } from 'vitest'
import type { DeckAgentToolContext } from './catalog'
import { draftDeckHandler, preparedRequestReceipt } from './handlers'

function preparedRequest(slides: number) {
  const slide = (i: number) =>
    `<div data-slide data-block="point" style="position: absolute; inset: 0"><h1>Slide ${i} headline about the quarterly plan</h1><p>${'Supporting line with detail. '.repeat(8)}</p><aside data-notes>${'Speaker notes. '.repeat(20)}</aside></div>`
  return {
    id: 'req-1',
    path: '/work/Plan.deck',
    baseHash: 'h-base',
    html: `<!doctype html><html><head><style>${'.x{color:red}'.repeat(200)}</style></head><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720">${Array.from({ length: slides }, (_, i) => slide(i)).join('')}</div></body></html>`,
    prompt: 'A deck about the quarterly plan',
    kind: 'draft',
    indexes: [],
    elementPaths: [],
    images: [{ name: 'a.png', sha256: 'f'.repeat(64) }],
    status: 'prepared',
    sessionId: 'session-1',
    guide: 'Compose the complete deck HTML. '.repeat(120),
    slideCount: 8,
    material: Array.from({ length: 6 }, (_, i) => ({
      name: `asset-${i}.png`,
      reference: `assets/asset-${i}.png`,
      role: 'content',
      description: 'A screenshot of the planning board. '.repeat(4),
    })),
  }
}

describe('draftDeck reply', () => {
  it('returns the tokens commitDrawerRequest needs, not the deck', async () => {
    const request = preparedRequest(30)
    const context = {
      documentPath: request.path,
      ui: { brief: 'A deck about the quarterly plan', slideCount: 8 },
      material: [],
      draftDeck: async () => request,
    } as unknown as DeckAgentToolContext
    const reply = await draftDeckHandler(context)
    const body = JSON.parse(String(reply.content))
    expect(body).toMatchObject({
      prepared: true,
      requestId: 'req-1',
      baseHash: 'h-base',
      kind: 'draft',
      status: 'prepared',
      path: '/work/Plan.deck',
      sessionId: 'session-1',
      slideCount: 8,
      images: 1,
      baseHtmlChars: request.html.length,
    })
    expect(body.nextAction).toContain('getDrawerRequest')
    expect(body).not.toHaveProperty('html')
    expect(body).not.toHaveProperty('guide')
    expect(body).not.toHaveProperty('material')
    expect(String(reply.content).length).toBeLessThan(800)
  })

  it('does not grow with the deck', () => {
    const small = JSON.stringify(preparedRequestReceipt(preparedRequest(2)))
    const large = JSON.stringify(preparedRequestReceipt(preparedRequest(60)))
    expect(large.length - small.length).toBeLessThan(10)
  })

  it('passes through anything that is not a prepared request', () => {
    expect(preparedRequestReceipt({ slides: 0 })).toEqual({ slides: 0 })
  })
})
