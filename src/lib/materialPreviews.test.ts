import { expect, it, vi } from 'vitest'
import { readMaterialPreviews } from './materialPreviews'
import { mergeMaterial } from './material'
it('reads pictures concurrently, clips serially, preserves order and applies caps', async () => {
  const names = [
    'a.png',
    'b.png',
    'c.png',
    'd.png',
    'one.mp4',
    'two.mp4',
    'unused.mp4',
    'big.png',
    'unreadable.png',
  ]
  const items = mergeMaterial(
    names.map((name) => ({ name, bytes: name === 'big.png' ? 99e6 : 50 })),
    [],
  )
  let pictures = 0,
    clips = 0,
    peakPictures = 0,
    peakClips = 0
  const read = vi.fn(async (path: string, _cap: number) => {
    const video = path.endsWith('.mp4')
    if (video) {
      clips++
      peakClips = Math.max(peakClips, clips)
    } else {
      pictures++
      peakPictures = Math.max(peakPictures, pictures)
    }
    await new Promise((resolve) =>
      setTimeout(resolve, path.includes('a.png') ? 4 : 1),
    )
    if (video) clips--
    else pictures--
    if (path.includes('unreadable')) throw Error('No pixels')
    return `data:owned-${path}`
  })
  const result = await readMaterialPreviews(
    '/Test.deck',
    items,
    '<video src="assets/one.mp4"></video><video src="assets/two.mp4"></video>',
    read,
    () => true,
  )
  expect(peakPictures).toBe(3)
  expect(peakClips).toBe(1)
  expect(Object.keys(result)).toEqual(
    items
      .filter((item) =>
        ['a.png', 'b.png', 'c.png', 'd.png', 'one.mp4', 'two.mp4'].includes(
          item.name,
        ),
      )
      .map((item) => item.name),
  )
  expect(
    read.mock.calls.some(
      ([path]) => path.includes('unused') || path.includes('big.png'),
    ),
  ).toBe(false)
  expect(read.mock.calls.every(([, cap]) => cap > 0)).toBe(true)
})
it('discards obsolete read results and stops taking new files after switching decks', async () => {
  const items = mergeMaterial(
    ['a.png', 'b.png', 'c.png', 'd.png'].map((name) => ({ name })),
    [],
  )
  let current = true
  const pending: Array<(value: string) => void> = []
  const read = vi.fn(
    () => new Promise<string>((resolve) => pending.push(resolve)),
  )
  const work = readMaterialPreviews('/Old.deck', items, '', read, () => current)
  expect(read).toHaveBeenCalledTimes(3)
  current = false
  pending.forEach((resolve) => resolve('data:old'))
  expect(await work).toEqual({})
  expect(read).toHaveBeenCalledTimes(3)
})
