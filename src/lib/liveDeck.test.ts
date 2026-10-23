// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { deckFromLive, deckToLive } from './liveDeck'

const html = `<!DOCTYPE html><html><head><style>.s{}</style></head><body><main id="deck" data-width="1280"><section data-slide data-block="title"><h1>One</h1></section><section data-slide><h1>Two</h1></section></main></body></html>`

describe('a deck kept live, slide by slide', () => {
  it('gives each slide an id, keeps the page apart, and comes back the same', () => {
    const made = deckToLive({ title: 'Pitch', html })!
    expect(made.live.slides).toHaveLength(2)
    expect(new Set(made.live.slides.map(s => s.id)).size).toBe(2)
    expect(made.html).toContain('data-slide-id')
    expect(made.live.shell).not.toContain('<h1>One</h1>')
    const back = deckFromLive(made.live as never, 'Pitch')!
    expect(back.html.replace(/\s+/g, '')).toBe(made.html.replace(/\s+/g, ''))
    // Ids stay the same the next time: what two people change is matched slide to slide.
    expect(deckToLive(back)!.live.slides.map(s => s.id)).toEqual(made.live.slides.map(s => s.id))
  })
})
