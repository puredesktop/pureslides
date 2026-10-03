// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import { readDeckPackage } from './deckPackage'
import { createDefaultDeckDocument } from './deckDocument'
const html = createDefaultDeckDocument('Source').html
it('hydrates metadata and source without publishing partial state', async () => {
  const read = vi.fn(async (path: string) =>
    path.endsWith('index.html')
      ? html
      : path.endsWith('manifest.json')
      ? JSON.stringify({
          title: 'Saved',
          brief: 'For the team',
          look: 'ink',
          slideCount: 12,
          assets: [{ name: 'logo.png', role: 'logo', description: 'Mark' }],
        })
      : JSON.stringify({ id: 'receipt' }),
  )
  const value = await readDeckPackage('/Saved.deck/', read)
  expect(value.document).toEqual({ html, title: 'Saved' })
  expect(value.root).toBe('/Saved.deck')
  expect(value.brief).toBe('For the team')
  expect(value.notes[0].name).toBe('logo.png')
  expect(value.drawerRequest?.id).toBe('receipt')
})
it('allows a genuinely missing legacy manifest but rejects unreadable or malformed metadata', async () => {
  const read = vi.fn(async (path: string) => {
    if (path.endsWith('index.html')) return html
    throw Error('ENOENT: no such file')
  })
  expect((await readDeckPackage('/Legacy.deck', read)).document.title).toBe(
    'Legacy',
  )
  for (const failure of ['Permission denied', 'Connection timed out']) {
    read.mockImplementation(async (path: string) => {
      if (path.endsWith('index.html')) return html
      throw Error(failure)
    })
    await expect(readDeckPackage('/Unreadable.deck', read)).rejects.toThrow(
      failure,
    )
  }
  read.mockImplementation(async (path: string) =>
    path.endsWith('index.html') ? html : '{bad json',
  )
  await expect(readDeckPackage('/Invalid.deck', read)).rejects.toThrow()
  for (const invalid of ['null', '[]', '2', '""']) {
    read.mockImplementation(async path =>
      path.endsWith('index.html') ? html : invalid,
    )
    await expect(readDeckPackage('/Invalid.deck', read)).rejects.toThrow(
      'JSON object',
    )
  }
})
it('rejects an invalid deck before binding or reading its metadata', async () => {
  const read = vi.fn(async () => '<html><body>Not a deck</body></html>')
  await expect(readDeckPackage('/Broken.deck', read)).rejects.toThrow(
    'would not render',
  )
  expect(read).toHaveBeenCalledTimes(1)
})
