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

describe('typography', () => {
  const deck = (slide: string, head = '', root = '') =>
    `<!DOCTYPE html><html><head>${head}</head><body><div id="deck" data-deck-id="deck" data-width="1280" data-height="720" style="--slide-bg: #ffffff; --slide-size-body: 24px${root}">${slide}</div></body></html>`
  const codes = (html: string) => checkDeck(html).map(finding => finding.code)
  const finding = (html: string, code: string) => checkDeck(html).find(f => f.code === code)

  it('flags text below the size a room can read, scaled to the slide width', () => {
    const small = deck('<div data-slide style="background: #fff; color: #111"><h1 style="font-size: 60px">Title</h1><p style="font-size: 14px">tiny</p></div>')
    expect(finding(small, 'type-too-small')).toMatchObject({ severity: 'warning', slide: 0, message: 'slide 1 has text at 14px, below the 18px a room can read' })
    const wide = small.replace('data-width="1280"', 'data-width="1920"').replace('14px', '24px')
    expect(finding(wide, 'type-too-small')?.message).toContain('below the 27px')
    expect(codes(deck('<div data-slide><h1 style="font-size: var(--slide-size-body)">Fine</h1></div>'))).not.toContain('type-too-small')
  })

  it('flags body lines too long to follow, and not lines held to a measure', () => {
    const text = 'word '.repeat(60)
    const long = deck(`<div data-slide style="padding: 80px 96px"><h1 style="font-size: 60px">A</h1><p style="font-size: 20px">${text}</p></div>`)
    expect(finding(long, 'type-measure')?.message).toMatch(/^slide 1 sets lines about \d+ characters long$/)
    const held = long.replace('font-size: 20px', 'font-size: 20px; max-width: 58ch')
    expect(codes(held)).not.toContain('type-measure')
    const columns = deck(`<div data-slide style="padding: 80px 96px"><h1 style="font-size: 60px">A</h1><div style="display: grid; grid-template-columns: repeat(3, 1fr)"><p style="font-size: 24px">${text}</p><p>b</p><p>c</p></div></div>`)
    expect(codes(columns)).not.toContain('type-measure')
  })

  it('flags more than two typefaces, but not a monospace face for code', () => {
    const three = deck('<div data-slide><h1 style="font-family: Georgia, serif; font-size: 60px">A</h1><p style="font-family: Inter, sans-serif; font-size: 24px">b</p><p style="font-family: \'Comic Sans MS\'; font-size: 24px">c</p></div>')
    expect(finding(three, 'type-families')?.message).toBe('the deck uses 3 typefaces (Georgia, Inter, Comic Sans MS)')
    const code = three.replace("'Comic Sans MS'", "'IBM Plex Mono', monospace")
    expect(codes(code)).not.toContain('type-families')
  })

  it('flags a headline that ends on one word, unless it is balanced', () => {
    const widow = deck('<div data-slide style="padding: 80px 96px"><h1 style="font-size: 80px; max-width: 900px">Our slides look alike and nobody remembers</h1></div>')
    expect(finding(widow, 'type-widow')?.message).toMatch(/^the headline on slide 1 ends on one word \("\w+"\)$/)
    expect(codes(widow.replace('max-width: 900px', 'max-width: 900px; text-wrap: balance'))).not.toContain('type-widow')
  })

  it('flags a slide of paragraphs', () => {
    const wordy = deck(`<div data-slide><h1 style="font-size: 60px">A</h1><p style="font-size: 24px; max-width: 58ch">${'many words here '.repeat(25)}</p></div>`)
    expect(finding(wordy, 'type-words')?.message).toBe('slide 1 has 76 words on it')
  })

  it('flags weak contrast against a solid ground, and leaves a picture ground alone', () => {
    const faint = deck('<div data-slide style="background: #ffffff"><h1 style="font-size: 60px; color: #222">A</h1><p style="font-size: 20px; color: #aaaaaa">faint</p></div>')
    expect(finding(faint, 'type-contrast')?.message).toBe('slide 1 has text at 2.3:1 against its background, under the 4.5:1 it needs')
    const large = faint.replace('font-size: 20px', 'font-size: 40px').replace('#aaaaaa', '#888888')
    expect(codes(large)).not.toContain('type-contrast')
    const photo = faint.replace('background: #ffffff', 'background: url(assets/a.jpg)')
    expect(codes(photo)).not.toContain('type-contrast')
    const token = deck('<div data-slide style="background: var(--slide-bg)"><h1 style="font-size: 60px; color: var(--slide-ink)">A</h1></div>', '', '; --slide-ink: #f0f0f0')
    expect(codes(token)).toContain('type-contrast')
  })

  it('flags a headline smaller than the text under it, but not a big figure', () => {
    const upside = deck('<div data-slide><h1 style="font-size: 30px">Small</h1><p style="font-size: 44px">Big words here</p></div>')
    expect(finding(upside, 'type-hierarchy')?.message).toBe('the headline on slide 1 (30px) is smaller than text under it (44px)')
    const figure = deck('<div data-slide><h1 style="font-size: 30px">Small</h1><div style="font-size: 120px">42%</div></div>')
    expect(codes(figure)).not.toContain('type-hierarchy')
  })

  it('never blocks: every typographic finding is a warning', () => {
    const bad = deck('<div data-slide style="background: #fff"><h1 style="font-size: 12px; color: #eee">a</h1><p style="font-size: 40px">b c</p></div>')
    const type = checkDeck(bad).filter(f => f.code.startsWith('type-'))
    expect(type.length).toBeGreaterThan(1)
    expect(hasBlockingFinding(type)).toBe(false)
  })
})
