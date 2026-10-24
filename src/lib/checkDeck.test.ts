import { describe, expect, it } from 'vitest'
import { checkDeck, hasBlockingFinding } from './checkDeck'

const DECK = (body: string): string =>
  `<!DOCTYPE html><html><head></head><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720">${body}</div></body></html>`

describe('checkDeck', () => {
  it('passes an ordinary deck', () => {
    const findings = checkDeck(DECK('<div data-slide><h1>One</h1></div>'))
    expect(hasBlockingFinding(findings)).toBe(false)
  })

  it('refuses a document with no deck root', () => {
    const findings = checkDeck('<!DOCTYPE html><html><body><h1>Hi</h1></body></html>')
    expect(findings[0].code).toBe('no-deck-root')
    expect(hasBlockingFinding(findings)).toBe(true)
  })

  it('warns when a build skips a step, because that press does nothing', () => {
    const findings = checkDeck(
      DECK('<div data-slide><p data-step="1">a</p><p data-step="3">b</p></div>'),
    )
    expect(findings.some(f => f.code === 'step-gap')).toBe(true)
    // A gap is worth knowing, not worth blocking the room.
    expect(hasBlockingFinding(findings)).toBe(false)
  })

  it('warns about a script loaded over the network', () => {
    const findings = checkDeck(
      DECK('<div data-slide></div><script src="https://cdn.example.com/lib.js"></script>'),
    )
    expect(findings.some(f => f.code === 'remote-script')).toBe(true)
    expect(hasBlockingFinding(findings)).toBe(false)
  })

  it('says nothing about an inline or package-relative script', () => {
    const findings = checkDeck(
      DECK('<div data-slide></div><script src="assets/lib.js"></script><script>1</script>'),
    )
    expect(findings.some(f => f.code === 'remote-script')).toBe(false)
  })

  it('blocks document.write, which erases the deck', () => {
    const findings = checkDeck(
      DECK('<div data-slide></div><script>document.write("x")</script>'),
    )
    expect(hasBlockingFinding(findings)).toBe(true)
  })
  it('warns about an empty video frame, a clip from the network, and a format PowerPoint may not play', () => {
    const deck = `<!DOCTYPE html><html><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720">
      <div data-slide><h1>A</h1><video data-video></video></div>
      <div data-slide><h1>B</h1><video src="https://cdn.example.com/x.mp4"></video></div>
      <div data-slide><h1>C</h1><video src="assets/clip.webm"></video></div>
      <div data-slide><h1>D</h1><video src="assets/clip.mp4"></video></div>
    </div></body></html>`
    const codes = checkDeck(deck).filter(finding => finding.code.includes('video')).map(finding => [finding.code, finding.slide])
    expect(codes).toEqual([['video-empty', 0], ['remote-video', 1], ['video-format', 2]])
  })

  it('checks builds, images and clips in an imported deck whose root is the slide', () => {
    const findings = checkDeck(
      DECK('<h1>Imported</h1><p data-step="3">Later</p><img src="https://example.com/a.png"><video></video>'),
    )
    expect(findings.map(f => [f.code, f.slide])).toEqual([
      ['step-gap', 0],
      ['remote-image', 0],
      ['video-empty', 0],
    ])
  })

  it('warns when a later image needs the network after a local first image', () => {
    const findings = checkDeck(
      DECK('<div data-slide><img src="assets/local.png"><img src="https://example.com/remote.png"></div>'),
    )
    expect(findings.some(f => f.code === 'remote-image' && f.slide === 0)).toBe(true)
  })
})
