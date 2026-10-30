import { describe, expect, it } from 'vitest'
import { readElement, setSlideContent, slidesFromHtml, wordsOf } from './slides'

const deck = (inner: string) =>
  `<!DOCTYPE html><html><head></head><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720"><div data-slide>${inner}</div></div></body></html>`

const el = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body.firstElementChild

describe('words across line breaks', () => {
  it('reads a <br> and a block-set line as a space, not as nothing', () => {
    expect(wordsOf(el('<h1>Your server.<br>Your control.</h1>'))).toBe('Your server. Your control.')
    expect(wordsOf(el('<h1>Publishing workflow<br/>to your standards</h1>'))).toBe('Publishing workflow to your standards')
    expect(wordsOf(el('<h1>Move research <span style="display: block; color: #a9b4f5">with less work.</span></h1>'))).toBe('Move research with less work.')
    expect(wordsOf(el('<h1>Move research<div>into publication</div></h1>'))).toBe('Move research into publication')
  })

  it('keeps a word whole across an inline span', () => {
    expect(wordsOf(el('<p>pure<span style="color: #3b6fe0">.science</span></p>'))).toBe('pure.science')
  })

  it('gives the board and the agent the headline with its spaces', () => {
    const html = deck('<h1>Your server.<br>Your control.</h1><p>Keys<br>and models</p>')
    const [slide] = slidesFromHtml(html)
    expect(slide.headline).toBe('Your server. Your control.')
    expect(slide.support).toBe('Keys and models')
    expect(readElement(html, 0, '0')?.text).toBe('Your server. Your control.')
  })

  it('leaves an unchanged headline alone and keeps the breaks of a retyped one', () => {
    const html = deck('<h1>Your server.<br>Your control.</h1>')
    expect(setSlideContent(html, 0, { headline: 'Your server. Your control.' })).toContain('<h1>Your server.<br>Your control.</h1>')
    const retyped = setSlideContent(html, 0, { headline: 'Your own server. Your control.' })
    expect(retyped).toContain('<h1>Your own server.<br>Your control.</h1>')
    expect(slidesFromHtml(retyped)[0].headline).toBe('Your own server. Your control.')
    const rewritten = setSlideContent(html, 0, { headline: 'Keys stay home' })
    expect(rewritten).toContain('<h1>Keys stay home</h1>')
  })
})
