import { useMemo, useRef } from 'react'
import { useReview, type UseReview } from '@purescience/platform-ui/bridge/react/useReview'
import type { ReviewSource } from '@purescience/platform-ui/review/sources'
import { createFolder, listFiles, writeBinaryFile } from '../bridge/platformBridge'
import { DECK_APP_SLUG } from '../constants'
import { writeDeckFonts } from '../fonts/packageFonts'
import { saveSlidePicture } from '../lib/exportDeck'
import { deckReviewItems, findSlide, slideFingerprint, withSlideIds } from '../lib/reviewDeck'
import { slidesFromHtml } from '../lib/slides'

export interface DeckReviewOptions {
  documentPath: string | null
  sessionId: string | null
  title: () => string
  /** The deck as it is now. */
  html: () => string
  /** The selected slides, by index. */
  selection: () => readonly number[]
  /** Saves the deck and says where it is. */
  saveDeck: () => Promise<string>
  /** The deck with its slides' ids in it, through the door. False when it did not land. */
  giveIds: (html: string) => boolean
}

/**
 * The deck in the Review room: each slide at its last build step becomes a picture, one at a time since each is a page
 * load of the whole deck. The button, the assistant's tools and `/review` all come through here.
 */
export function useDeckReview(options: DeckReviewOptions): UseReview {
  const latest = useRef(options)
  latest.current = options
  const fingerprints = useRef<{ html: string; byId: Map<string, string | null> }>({ html: '', byId: new Map() })

  const source = useMemo((): ReviewSource => ({
    concurrency: 1,
    async prepare() {
      const path = await latest.current.saveDeck()
      await writeDeckFonts(path, latest.current.html(), { createFolder, writeBinaryFile, listFiles })
    },
    list(scope) {
      const before = latest.current.html()
      const ided = withSlideIds(before, scope.known)
      if (ided !== before && !latest.current.giveIds(ided)) throw new Error('The deck changed while its slides were being numbered. Try again.')
      return deckReviewItems(latest.current.html(), scope, latest.current.selection())
    },
    placeOf(item) {
      const slide = findSlide(latest.current.html(), item.id)
      return slide ? `slide ${slide.index + 1}` : null
    },
    count: () => slidesFromHtml(latest.current.html()).length,
    fingerprint(item) {
      // Asked of every slide at once, on one deck: read it once.
      const html = latest.current.html()
      if (fingerprints.current.html !== html) fingerprints.current = { html, byId: new Map() }
      const known = fingerprints.current.byId
      if (!known.has(item.id)) known.set(item.id, slideFingerprint(html, item.id))
      return known.get(item.id) as string | null
    },
    async capture(item, outPath) {
      const html = latest.current.html()
      const path = await latest.current.saveDeck()
      const slide = findSlide(html, item.id)
      if (!slide) throw new Error('This slide is no longer in the deck.')
      return saveSlidePicture(path, html, slide.index, slide.steps, outPath)
    },
  }), [])

  return useReview({
    documentPath: options.documentPath,
    sessionId: options.sessionId,
    appSlug: DECK_APP_SLUG,
    title: options.title,
    source,
    words: { noun: 'slide', plural: 'slides' },
    beforeHandOff: async () => {
      await latest.current.saveDeck()
    },
    ensureDocument: () => latest.current.saveDeck(),
  })
}
