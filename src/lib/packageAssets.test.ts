import { describe, expect, it } from 'vitest'
import {
  deinlineAssetUrls,
  inlineAssetUrls,
  picturesOnly,
  previewCapFor,
  referencedAssetNames,
  resolvePreviewAssets,
} from './packageAssets'

const HTML = `<div data-slide><img src="assets/logo.png"><video src="assets/demo.mp4" poster="assets/still.jpg"></video><div style="background: url(assets/bg.png)"></div><img src="assets/logo.png"></div>`

describe('package assets in the preview', () => {
  it('lists every referenced asset once, src, poster and url() alike', () => {
    expect(referencedAssetNames(HTML)).toEqual(['logo.png', 'demo.mp4', 'still.jpg', 'bg.png'])
  })

  it('resolves, inlines and restores spaced and unquoted HTML and CSS references', async () => {
    const html = `<img src = "assets/logo.png"><img SRC=assets/logo.png><video poster = 'assets/still.jpg'></video><a href = assets/logo.png>Logo</a><style>.slide { background: url( assets/bg.png ); mask: url( 'assets/mask.png' ); }</style>`
    const previews = {
      'logo.png': 'data:image/png;base64,AA',
      'still.jpg': 'data:image/jpeg;base64,BB',
      'bg.png': 'data:image/png;base64,CC',
      'mask.png': 'data:image/png;base64,DD',
    }
    const result = await resolvePreviewAssets(html, {
      sizeOf: async () => 100,
      read: async name => previews[name as keyof typeof previews],
    })
    expect(result).toEqual({ inlined: previews, issues: [] })
    const inline = inlineAssetUrls(html, result.inlined)
    const doc = new DOMParser().parseFromString(inline, 'text/html')
    expect([...doc.querySelectorAll('img')].map(img => img.getAttribute('src'))).toEqual([previews['logo.png'], previews['logo.png']])
    expect(doc.querySelector('video')?.getAttribute('poster')).toBe(previews['still.jpg'])
    expect(doc.querySelector('a')?.getAttribute('href')).toBe(previews['logo.png'])
    expect(inline).toContain(`url( ${previews['bg.png']} )`)
    expect(inline).toContain(`url( '${previews['mask.png']}' )`)
    const back = deinlineAssetUrls(inline, previews)
    expect(back.unknownDataUrls).toBe(0)
    expect(referencedAssetNames(back.html)).toEqual(Object.keys(previews))
    expect(back.html).toBe(html.replace('SRC=assets/logo.png', 'SRC="assets/logo.png"').replace('href = assets/logo.png', 'href = "assets/logo.png"'))
  })

  it('keeps quoted filenames with spaces valid through preview restoration', () => {
    const html = `<img src = 'assets/team photo.png'><div style="background: url( 'assets/team photo.png' )"></div>`
    const previews = { 'team photo.png': 'data:image/png;base64,AA==' }
    expect(referencedAssetNames(html)).toEqual(['team photo.png'])
    const inline = inlineAssetUrls(html, previews)
    expect(inline).not.toContain('assets/')
    expect(deinlineAssetUrls(inline, previews).html).toBe(html.replaceAll('team photo.png', 'team%20photo.png'))
  })

  it('restores escaped filenames safely in unquoted CSS URLs and serialized frames', () => {
    const html = `<img src = assets/team%20photo.png><div style="background: url(assets/team%20photo.png)"></div>`
    const previews = { 'team photo.png': 'data:image/png;base64,AA==' }
    const inline = inlineAssetUrls(html, previews)
    const doc = new DOMParser().parseFromString(inline, 'text/html')
    expect(doc.querySelector('img')?.getAttribute('src')).toBe(previews['team photo.png'])
    const back = deinlineAssetUrls(doc.body.innerHTML, previews)
    expect(back.html).not.toContain('data:')
    expect(back.html).toContain('url(assets/team%20photo.png)')
    expect(referencedAssetNames(back.html)).toEqual(['team photo.png'])
  })

  it.each(['team photo.png', 'team"photo.png', "team'photo.png", 'team(photo).png', 'team#photo?.png'])(
    'restores %s as a URL safe for HTML and CSS', name => {
      const previews = { [name]: 'data:image/png;base64,AA==' }
      const back = deinlineAssetUrls('<img src="data:image/png;base64,AA=="><style>.slide { background: url(data:image/png;base64,AA==) }</style>', previews)
      expect(referencedAssetNames(back.html)).toEqual([name])
      const doc = new DOMParser().parseFromString(back.html, 'text/html')
      expect(decodeURIComponent(doc.querySelector('img')!.getAttribute('src')!)).toBe(`assets/${name}`)
    },
  )

  it('leaves unmatched references and surrounding markup alone', () => {
    const html = `<img data-src="assets/lazy.png" src = assets/missing.png><style>.slide { background: url( https://example.com/bg.png ); }</style>`
    expect(referencedAssetNames(html)).toEqual(['missing.png'])
    expect(inlineAssetUrls(html, { 'lazy.png': 'data:image/png;base64,AA==' })).toBe(html)
  })

  it('preserves readable unicode and safe punctuation during restoration', () => {
    const html = `<img src="assets/café-東京!+.png">`
    const previews = { 'café-東京!+.png': 'data:image/png;base64,AA==' }
    expect(deinlineAssetUrls(inlineAssetUrls(html, previews), previews).html).toBe(html)
  })

  it('ignores uppercase package directories without reporting missing assets', async () => {
    const html = '<img SRC = "ASSETS/logo.png">'
    expect(referencedAssetNames(html)).toEqual([])
    expect(inlineAssetUrls(html, { 'logo.png': 'data:image/png;base64,AA==' })).toBe(html)
    expect(await resolvePreviewAssets(html, {
      sizeOf: async () => { throw new Error('must not read') },
      read: async () => { throw new Error('must not read') },
    })).toEqual({ inlined: {}, issues: [] })
  })

  it('only rewrites real references, leaving prose, other attributes and scripts intact', () => {
    const copy = `<p>set src=assets/logo.png or src="assets/logo.png"; url(assets/logo.png)</p><!-- <img src=assets/logo.png> --><script>const example = '<img src=assets/logo.png>'</script><textarea><img src=assets/logo.png></textarea><img alt='src=assets/logo.png url(assets/logo.png)'>`
    expect(referencedAssetNames(copy)).toEqual([])
    expect(inlineAssetUrls(copy, { 'logo.png': 'data:image/png;base64,AA==' })).toBe(copy)
  })

  it('handles adjacent attributes, quoted greater-than signs and CSS in both contexts', () => {
    const html = `<img alt=">"src = assets/logo.png><div style="background: url( './assets/bg.png' )"></div><STYLE>.slide { background: URL(assets/bg.png) } /* url(assets/comment.png) */ .label::after { content: 'url(assets/copy.png)' }</STYLE>`
    expect(referencedAssetNames(html)).toEqual(['logo.png', 'bg.png'])
    const previews = { 'logo.png': 'data:image/png;base64,AA==', 'bg.png': 'data:image/png;base64,BB==' }
    const inline = inlineAssetUrls(html, previews)
    expect(inline).toContain('src = "data:image/png;base64,AA=="')
    expect(inline).toContain("url( 'data:image/png;base64,BB==' )")
    expect(inline).toContain('URL(data:image/png;base64,BB==)')
    expect(inline).toContain('/* url(assets/comment.png) */')
    expect(inline).toContain("content: 'url(assets/copy.png)'")
  })

  it('finds SVG image references written with xlink:href', () => {
    const html = `<svg><image xlink:href="assets/logo.png" width="10" height="10"/></svg>`
    const previews = { 'logo.png': 'data:image/png;base64,AA==' }
    expect(referencedAssetNames(html)).toEqual(['logo.png'])
    expect(inlineAssetUrls(html, previews)).toContain('xlink:href="data:image/png;base64,AA=="')
  })

  it('reads a root background that serialization wrote with entity quotes', () => {
    const html = `<div id="deck" style="background:url(&quot;assets/bg.png&quot;)"></div>`
    const previews = { 'bg.png': 'data:image/png;base64,AA==' }
    expect(referencedAssetNames(html)).toEqual(['bg.png'])
    const inline = inlineAssetUrls(html, previews)
    expect(inline).toContain('data:image/png;base64,AA==')
    expect(inline).not.toContain('assets/bg.png')
  })

  it('does not treat custom elements as raw-text blocks', () => {
    const html = `<style-card></style-card><img src="assets/logo.png"></style><title-bar></title-bar><img src="assets/next.png"></title>`
    expect(referencedAssetNames(html)).toEqual(['logo.png', 'next.png'])
  })

  it('gives videos a larger cap than pictures', () => {
    expect(previewCapFor('demo.mp4')).toBeGreaterThan(previewCapFor('logo.png'))
  })

  it('inlines what it has and leaves the rest as written', () => {
    const out = inlineAssetUrls(HTML, { 'logo.png': 'data:image/png;base64,AA', 'demo.mp4': 'data:video/mp4;base64,BB' })
    expect(out).toContain('src="data:image/png;base64,AA"')
    expect(out).toContain('<video src="data:video/mp4;base64,BB" poster="assets/still.jpg">')
    expect(out).toContain('url(assets/bg.png)')
  })

  it('maps the data URLs back to package paths before anything is written', () => {
    const previews = { 'logo.png': 'data:image/png;base64,AA', 'demo.mp4': 'data:video/mp4;base64,BB' }
    const back = deinlineAssetUrls(inlineAssetUrls(HTML, previews), previews)
    expect(back.html).toBe(HTML)
    expect(back.restored.sort()).toEqual(['demo.mp4', 'logo.png'])
    expect(back.unknownDataUrls).toBe(0)
  })

  it('resolves from disk with the cap by kind, reporting what it skipped', async () => {
    const sizes: Record<string, number | null> = { 'logo.png': 100, 'demo.mp4': 500 * 1024 * 1024, 'still.jpg': null, 'bg.png': 10 }
    const reads: string[] = []
    const result = await resolvePreviewAssets(HTML, {
      sizeOf: async name => sizes[name] ?? null,
      read: async name => {
        reads.push(name)
        if (name === 'bg.png') throw new Error('nope')
        return `data:x;base64,${name}`
      },
    })
    expect(result.inlined).toEqual({ 'logo.png': 'data:x;base64,logo.png' })
    expect(result.issues).toEqual([
      { name: 'demo.mp4', reason: 'too-large', bytes: 500 * 1024 * 1024 },
      { name: 'still.jpg', reason: 'missing' },
      { name: 'bg.png', reason: 'unreadable', bytes: 10 },
    ])
    expect(reads).toEqual(['logo.png', 'bg.png'])
  })
  it('keeps clips out of the frames that do not play them', () => {
    expect(picturesOnly({ 'logo.png': 'data:image/png;base64,AA', 'demo.mp4': 'data:video/mp4;base64,BB', 'b.webm': 'x' })).toEqual({ 'logo.png': 'data:image/png;base64,AA' })
  })
})
