import {
  DECK_FILE,
  DECK_MANIFEST_FILE,
  DEFAULT_LOOK,
  DEFAULT_SLIDE_COUNT,
} from '../constants'
import { DEFAULT_DECK_TITLE, parsePackageManifest } from './deckDocument'
import { validateDeckHtml } from './deckDoor'
import type { DrawerRequest } from './drawerRequest'

/** Read completely before publishing any of the next deck's content or metadata. */
export async function readDeckPackage(
  path: string,
  read: (path: string) => Promise<string>,
) {
  const root = path.replace(/\/+$/, '')
  const html = await read(`${root}/${DECK_FILE}`)
  const invalid = validateDeckHtml(html)
  if (invalid) throw new Error(invalid)
  let manifestText: string | undefined
  try {
    manifestText = await read(`${root}/${DECK_MANIFEST_FILE}`)
  } catch (error) {
    // Legacy packages may lack a manifest; malformed/unreadable metadata must
    // not silently turn into defaults that the next autosave overwrites.
    if (!/ENOENT|no such file|not found|does not exist/i.test(String(error)))
      throw error
  }
  if (manifestText !== undefined) {
    const value: unknown = JSON.parse(manifestText)
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('The deck manifest must be a JSON object.')
  }
  const manifest =
    manifestText === undefined ? undefined : parsePackageManifest(manifestText)
  let drawerRequest: DrawerRequest | null = null
  try {
    drawerRequest = JSON.parse(await read(`${root}/drawer-request.json`))
  } catch {
    /* Older decks need no drawer receipt. */
  }
  return {
    root,
    document: {
      html,
      title:
        manifest?.title ??
        root
          .split('/')
          .pop()
          ?.replace(/\.deck$/i, '') ??
        DEFAULT_DECK_TITLE,
    },
    notes: manifest?.assets ?? [],
    brief: manifest?.brief ?? '',
    look: manifest?.look ?? DEFAULT_LOOK,
    slideCount: manifest?.slideCount ?? DEFAULT_SLIDE_COUNT,
    drawerRequest,
  }
}
