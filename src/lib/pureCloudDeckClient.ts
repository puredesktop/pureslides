/**
 * PureServer PureCloud `publish` Client for Live Deck Sharing & Presenter Sync.
 *
 * Uses `bridge.call(PLATFORM_BRIDGE_METHODS.CLOUD_CALL, [{ service: 'publish', action, input }])`
 * with clean graceful offline fallback when PureServer isn't attached.
 */
import { bridge, isStandaloneDevMode } from '../bridge/platformBridge'
import { PLATFORM_BRIDGE_METHODS } from '@purescience/platform-ui/bridge/methods'
import { geometryFromHtml } from './deckDocument'
import { lookFromHtml } from './deckLooks'
import type { Slide } from './slides'

export interface PublishStatusResult {
  connected: boolean
  publicUrl?: string
  counts?: Record<string, number>
  offlineReason?: string
}

export interface PublishedDeckItem {
  id: string
  title?: string
  url: string
  token?: string
  active?: boolean
  activeVersion?: number
  passcodeProtected?: boolean
  allowComments?: boolean
  expiresAt?: string | null
  updatedAt?: string
}

export interface PublishedDeckComment {
  id: string
  parentId?: string | null
  targetIndex: number
  author?: string
  body: string
  resolved?: boolean
  createdAt?: string
}

export interface PublishedDeckDetail {
  item: PublishedDeckItem
  versions: Array<{ version: number; note?: string; createdAt?: string }>
  comments: PublishedDeckComment[]
}

export interface PublishDeckSlidePayload {
  id: string
  title: string
  html: string
  notes?: string
  steps?: number
}

export interface PublishDeckInput {
  id?: string
  title: string
  description?: string
  width: number
  height: number
  look: string
  deckCss: string
  slides: PublishDeckSlidePayload[]
  passcode?: string
  expiresAt?: string
  allowComments?: boolean
  note?: string
}

export interface PresenterStateInput {
  id: string
  slideIndex: number
  step: number
  blacked?: boolean
  whited?: boolean
  laser?: { x: number; y: number } | null
  following?: boolean
}

async function callPublish<T>(
  action: string,
  input?: Record<string, unknown>,
): Promise<T> {
  if (isStandaloneDevMode()) {
    throw new Error('PureServer is not attached in standalone dev mode.')
  }
  const methods = bridge.getMethods?.() ?? []
  if (methods.length > 0 && !methods.includes(PLATFORM_BRIDGE_METHODS.CLOUD_CALL)) {
    throw new Error('PureCloud publish service is unavailable on this host.')
  }
  return (await bridge.call(PLATFORM_BRIDGE_METHODS.CLOUD_CALL, [
    { service: 'publish', action, ...(input ? { input } : {}) },
  ])) as T
}

export async function getPublishStatus(): Promise<PublishStatusResult> {
  try {
    const res = await callPublish<PublishStatusResult>('status')
    return {
      connected: Boolean(res?.connected),
      publicUrl: res?.publicUrl,
      counts: res?.counts,
    }
  } catch (err) {
    return {
      connected: false,
      offlineReason: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function listPublishedDecks(): Promise<{
  publicUrl?: string
  items: PublishedDeckItem[]
}> {
  const res = await callPublish<{ publicUrl?: string; items?: PublishedDeckItem[] }>(
    'list',
    { kind: 'deck' },
  )
  return { publicUrl: res?.publicUrl, items: Array.isArray(res?.items) ? res.items : [] }
}

export async function getPublishedDeck(id: string): Promise<PublishedDeckDetail> {
  const res = await callPublish<PublishedDeckDetail>('get', { id })
  return {
    item: res.item,
    versions: Array.isArray(res?.versions) ? res.versions : [],
    comments: Array.isArray(res?.comments) ? res.comments : [],
  }
}

export async function publishDeck(input: PublishDeckInput): Promise<{
  item: PublishedDeckItem
  version?: number
  contentHash?: string
}> {
  return callPublish('publishDeck', input as unknown as Record<string, unknown>)
}

export async function setPresenterState(input: PresenterStateInput): Promise<void> {
  await callPublish('setPresenterState', input as unknown as Record<string, unknown>)
}

export async function replyDeckComment(input: {
  id: string
  parentId?: string
  targetIndex: number
  body: string
}): Promise<unknown> {
  return callPublish('replyComment', input)
}

export async function resolveDeckComment(input: {
  id: string
  commentId: string
  resolved: boolean
}): Promise<unknown> {
  return callPublish('resolveComment', input)
}

export async function updatePublishedDeck(input: {
  id: string
  active?: boolean
  passcode?: string
  allowComments?: boolean
}): Promise<unknown> {
  return callPublish('update', input)
}

export async function removePublishedDeck(id: string): Promise<unknown> {
  return callPublish('remove', { id })
}

/** Extract PureCloud `publishDeck` payload cleanly from the current deck HTML. */
export function buildPublishDeckPayload(
  html: string,
  slides: Slide[],
  title: string,
): Pick<PublishDeckInput, 'title' | 'width' | 'height' | 'look' | 'deckCss' | 'slides'> {
  const geometry = geometryFromHtml(html)
  const look = lookFromHtml(html) ?? 'auto'
  let deckCss = ''
  let slideNodes: Element[] = []

  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const styles = [...doc.querySelectorAll('head style')].map(s => s.textContent ?? '').join('\n')
    const root = doc.querySelector<HTMLElement>('[data-deck-id], #deck')
    const rootTokens = root?.getAttribute('style') ?? ''
    deckCss = `${styles}\n:root, [data-deck-id], #deck { ${rootTokens} }`
    if (root) {
      const kids = [...root.children].filter(child => child.matches('[data-slide]'))
      slideNodes = kids.length ? kids : [root]
    }
  }

  const payloadSlides: PublishDeckSlidePayload[] = slides.map((slide, idx) => ({
    id: slideNodes[idx]?.getAttribute('data-slide-id') || `slide-${idx + 1}`,
    title: slide.headline || `Slide ${idx + 1}`,
    html: slideNodes[idx]?.outerHTML ?? '',
    ...(slide.notes ? { notes: slide.notes } : {}),
    ...(slide.steps ? { steps: slide.steps } : {}),
  }))

  return {
    title: title.trim() || 'Untitled deck',
    width: geometry.width,
    height: geometry.height,
    look,
    deckCss,
    slides: payloadSlides,
  }
}
