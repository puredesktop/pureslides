/**
 * Put the deck's faces in its package.
 *
 * The type stylesheet points at `assets/fonts/<file>`, so the package on
 * disk must hold those files: the print and frame renderers load the deck
 * from the package, and a person opening `index.html` in a browser should
 * see what the board shows. Written once per package and file — the bytes
 * never change — and never deleted, since an older version of the deck in
 * `history/` may still name them.
 */
import { DECK_ASSETS_DIR } from '../constants'
import { deckFontFiles } from '../lib/deckType'
import { BUNDLED_FONT_URLS } from './urls'
import { BUNDLED_FAMILIES, FONT_DIR } from './registry'

export interface FontWriter {
  createFolder: (parent: string, name: string) => Promise<void>
  writeBinaryFile: (path: string, base64: string) => Promise<void>
  listFiles: (path: string) => Promise<unknown>
}

const written = new Set<string>()

/** The files written now (empty when the package already had them all). */
export async function writeDeckFonts(packagePath: string, html: string, io: FontWriter): Promise<string[]> {
  const root = packagePath.replace(/\/+$/, '')
  const wanted = deckFontFiles(html).filter(file => BUNDLED_FONT_URLS[file] && !written.has(`${root}/${file}`))
  if (!wanted.length) return []
  const dir = `${root}/${DECK_ASSETS_DIR}/${FONT_DIR}`
  let present = new Set<string>()
  try {
    const listing = (await io.listFiles(dir)) as { entries?: { name?: string }[] }
    present = new Set((listing?.entries ?? []).map(entry => entry?.name ?? ''))
  } catch {
    try {
      await io.createFolder(root, DECK_ASSETS_DIR)
    } catch {
      /* already there */
    }
    try {
      await io.createFolder(`${root}/${DECK_ASSETS_DIR}`, FONT_DIR)
    } catch {
      /* already there */
    }
  }
  const out: string[] = []
  for (const file of wanted) {
    const name = file.slice(FONT_DIR.length + 1)
    if (!present.has(name)) {
      await io.writeBinaryFile(`${dir}/${name}`, BUNDLED_FONT_URLS[file].replace(/^data:[^,]*,/, ''))
      out.push(file)
    }
    written.add(`${root}/${file}`)
  }
  return out
}

/**
 * The faces in the app's own page, for the look picker's samples. Injected
 * once; the same family names the decks use.
 */
export function installAppFonts(doc: Document = document): void {
  if (doc.querySelector('style[data-pureslides-fonts]')) return
  const style = doc.createElement('style')
  style.setAttribute('data-pureslides-fonts', '')
  style.textContent = Object.entries(BUNDLED_FONT_URLS)
    .map(([file, url]) => {
      const meta = FACE_BY_FILE.get(file)
      return meta
        ? `@font-face { font-family: '${meta.family}'; src: url("${url}") format("woff2"); font-weight: ${meta.weight}; font-style: ${meta.style}; font-display: swap; }`
        : ''
    })
    .join('\n')
  doc.head.appendChild(style)
}

const FACE_BY_FILE = new Map<string, { family: string; weight: string; style: string }>(
  BUNDLED_FAMILIES.flatMap(family =>
    family.faces.map(face => [`${FONT_DIR}/${face.file}`, { family: family.family, weight: face.weight, style: face.style }] as const),
  ),
)
