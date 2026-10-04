import type { MaterialItem } from './material'
import {
  previewCapFor,
  referencedAssetNames,
  type PreviewAssetMap,
} from './packageAssets'
import { DECK_ASSETS_DIR } from '../constants'

/** Batch pictures with three readers; large referenced clips get one reader. */
export async function readMaterialPreviews(
  path: string,
  items: MaterialItem[],
  html: string,
  read: (path: string, cap: number) => Promise<string>,
  current: () => boolean,
): Promise<PreviewAssetMap> {
  const referenced = new Set(referencedAssetNames(html))
  const pictures = items.filter((item) => item.kind === 'image')
  const clips = items.filter(
    (item) => item.kind === 'video' && referenced.has(item.name),
  )
  const values = new Map<string, string>()
  const readLane = async (lane: MaterialItem[], workers: number) => {
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(workers, lane.length) }, async () => {
        while (next < lane.length && current()) {
          const item = lane[next++],
            cap = previewCapFor(item.name)
          if (item.bytes !== undefined && item.bytes > cap) continue
          try {
            const pixels = await read(
              `${path}/${DECK_ASSETS_DIR}/${item.name}`,
              cap,
            )
            if (current()) values.set(item.name, pixels)
          } catch {
            /* Unreadable files keep their named placeholder. */
          }
        }
      }),
    )
  }
  await Promise.all([readLane(pictures, 3), readLane(clips, 1)])
  return Object.fromEntries(
    items.flatMap((item) =>
      values.has(item.name) ? [[item.name, values.get(item.name)!]] : [],
    ),
  )
}
