/**
 * What the drawer agent can do, and the app state it does it to.
 *
 * Every tool here has a control beside it in the app: the agent and the
 * person are changing one thing, not two views of it. Nothing in this file
 * knows how to reach the model — these are the app's own callbacks, handed
 * over so a tool cannot bypass the document lifecycle.
 */
import type { RevisionEntry } from '@purescience/platform-ui/editing'
import type { DeckDocument } from '../lib/deckDocument'
import type { DeckEditResult } from '../lib/deckDoor'
import type { DeckVerification } from '../lib/deckVerification'
import type { MaterialItem } from '../lib/material'
import type { Slide, SlideEdit } from '../lib/slides'
import type { AssetRole } from '../lib/assetNotes'
import type { ExportKind } from '../lib/exportDeck'
import type { CustomLookSpec } from '../lib/customLook'
import type { HouseStyle } from '../lib/houseStyle'
import type {
  BrandDetail,
  BrandEntry,
  BrandProposalAnswer,
} from '@purescience/platform-ui/bridge/brands.mjs'

/** The shell's brands: the organisation's house style, the workspace's and the person's own. */
export interface DeckBrandAccess {
  list: () => Promise<BrandEntry[]>
  get: (id: string) => Promise<BrandDetail>
  /** The organisation's default brand, or null. */
  default: () => Promise<BrandDetail | null>
  propose: (input: { id?: string; path?: string; note?: string }) => Promise<BrandProposalAnswer>
  proposeSamples: (input: { brand?: string; images: string[]; note?: string }) => Promise<BrandProposalAnswer>
}

/** Files outside the deck: a brand file and its folder. Absolute paths. */
export interface DeckFileAccess {
  readText: (path: string) => Promise<string>
  readBase64: (path: string, maxBytes?: number) => Promise<{ base64: string; mimeType?: string }>
  writeText: (path: string, text: string) => Promise<void>
  writeBase64: (path: string, base64: string) => Promise<void>
  /** Make the folder and any missing parents. */
  ensureFolder: (path: string) => Promise<void>
}

export interface GeneratedImage {
  base64: string
  mimeType: string
  modelId: string
}

export interface ImageRequest {
  prompt: string
  sourceImages?: { base64: string; mimeType: string; name?: string }[]
  size?: 'auto' | '1024x1024' | '1536x1024' | '1024x1536'
  quality?: 'auto' | 'low' | 'medium' | 'high'
  outputFormat?: 'png' | 'jpeg' | 'webp'
}

export const PURESLIDES_AGENT_TOOLS = [
  'getDeckContext',
  'getSlide',
  'listSlides',
  'listAssets',
  'checkDeck',
  'createDeck',
  'setDeck',
  'addSlide',
  'updateSlide',
  'setSlideHtml',
  'moveSlide',
  'duplicateSlide',
  'deleteSlide',
  'setElement',
  'setElementText',
  'listBlocks',
  'addBlock',
  'deleteElement',
  'setElementStep',
  'addAsset',
  'setAssetRole',
  'describeAsset',
  'setBrief',
  'setLook',
  'listLookFonts',
  'setCustomLook',
  'makeMotif',
  'saveLookAsBrand',
  'listBrands',
  'proposeBrandToOrganisation',
  'proposeSamplesToOrganisation',
  'viewSlide',
  'draftDeck',
  'getDrawerRequest',
  'cancelDrawerRequest',
  'commitDrawerRequest',
  'setSelection',
  'present',
  'saveDeck',
  'exportDeck',
  'stopExport',
  'listRevisions',
  'restoreRevision',
] as const

export const PURESLIDES_AGENT_LOG_LABEL = 'pureslides4'

export class AgentDeckToolError extends Error {}

export type GeometryPatch = { width?: number; height?: number }

/**
 * What every mutating tool may carry: the hash the agent read the deck at.
 * Required on the slide, element and whole-deck tools (the hook refuses a
 * call without it); optional on the look tools. When it is given and stale,
 * the edit is refused with the current hash and a re-read hint.
 */
import type { BlockFill } from '../lib/blocks'

export interface EditOptions {
  baseHash?: string
}

export interface DeckAgentToolContext {
  document: DeckDocument
  /** The content hash of `document.html` — what an edit names as its base. */
  hash: string
  /** Whether the board's render is verified, being checked, or failed (and where). */
  verification: DeckVerification
  documentPath: string | null
  slides: Slide[]
  material: MaterialItem[]
  lastExportPath: string | null
  exporting: boolean
  /**
   * What the person is looking at and has aimed at.
   *
   * Without this a drawer request like "make this bigger" cannot resolve
   * "this": the app knows, and the agent would be guessing.
   */
  ui: {
    view: string
    selectedSlide: number
    slideSelection: number[]
    elementSelection: { path: string; label: string }[]
    brief: string
    slideCount: number
  }
  summarize: () => Record<string, unknown>
  applyDeck: (
    html: string,
    patch?: GeometryPatch,
    title?: string,
    options?: EditOptions,
  ) => DeckEditResult
  createAndOpen: (next: DeckDocument) => Promise<string | null>
  listAssets: () => Promise<{ name: string; bytes?: number }[]>
  addAsset: (sourcePath: string, name?: string) => Promise<string>
  describeAsset: (name: string, description: string) => void
  setAssetRole: (name: string, role: AssetRole) => void
  setBrief: (patch: { brief?: string; slides?: number }) => void
  /** Change the deck's look: its palette and type tokens, through the door. */
  setLook: (look: string, options?: EditOptions) => DeckEditResult
  /** Put a custom look (an organisation's own) on the deck, through the same door. */
  setCustomLook: (spec: CustomLookSpec, options?: EditOptions) => DeckEditResult
  files: DeckFileAccess
  /** The shell's brands; null on a shell (or PureCloud) that does not offer them. */
  brands: DeckBrandAccess | null
  /** The organisation's default brand as last read; null when there is none. */
  houseStyle: HouseStyle | null
  /** The brand file last saved from this deck (saveLookAsBrand), or null. */
  savedBrandPath: string | null
  rememberSavedBrand?: (path: string) => void
  /** Every slide as a PNG through the images export (refused unless the layout is verified); absolute paths. */
  exportSlideImages: () => Promise<string[]>
  /** Write bytes into the open deck's package at `assets/…` (folders made as needed); returns the package path. */
  writePackageFile: (relative: string, base64: string) => Promise<string>
  /** The desktop's image model, or null when this desktop has none. */
  generateImage: ((request: ImageRequest) => Promise<GeneratedImage>) | null
  /** One slide drawn as the renderers draw it, at its last step: a PNG data URL. */
  renderSlide: (index: number) => Promise<{ dataUrl: string; width: number; height: number }>
  draftDeck: () => Promise<unknown>
  cancelDrawerRequest: (args: Record<string, unknown>) => Promise<unknown>
  getDrawerRequest: () => Promise<unknown>
  commitDrawerRequest: (args: Record<string, unknown>) => Promise<unknown>
  slideOps: {
    add: (
      html: string,
      atIndex?: number,
      options?: EditOptions,
    ) => DeckEditResult
    update: (
      index: number,
      patch: SlideEdit,
      options?: EditOptions,
    ) => DeckEditResult
    setHtml: (
      index: number,
      html: string,
      options?: EditOptions,
    ) => DeckEditResult
    move: (from: number, to: number, options?: EditOptions) => DeckEditResult
    duplicate: (index: number, options?: EditOptions) => DeckEditResult
    remove: (index: number, options?: EditOptions) => DeckEditResult
  }
  setElement: (
    index: number,
    path: string,
    html: string,
    options?: EditOptions,
  ) => DeckEditResult
  /** Retype one element's words, leaving its markup and styling alone. */
  setElementText: (
    index: number,
    path: string,
    text: string,
    options?: EditOptions,
  ) => DeckEditResult
  /** The slide compositions on offer. */
  blocks: { id: string; label: string; description: string; steps: number; media?: 'video' }[]
  /** Add one of them, its slot filled when a file is named; null when the id is not a block. */
  addBlock: (
    blockId: string,
    atIndex?: number,
    options?: EditOptions,
    fill?: BlockFill,
  ) => DeckEditResult | null
  deleteElement: (
    index: number,
    path: string,
    options?: EditOptions,
  ) => DeckEditResult
  setElementStep: (
    index: number,
    path: string,
    step: number,
    options?: EditOptions,
  ) => DeckEditResult
  /** The revision snapshots kept for this deck, newest first. */
  listRevisions: () => RevisionEntry[]
  /** Put one back — the same restore as Undo and the History list. */
  restoreRevision: (file: string) => Promise<DeckEditResult | { error: string }>
  setSelection: (patch: {
    selectedSlide?: number
    slideIndexes?: number[]
    elementPaths?: string[]
    view?: string
  }) => void
  present: (from: number) => void
  saveDeck: () => Promise<string>
  runExport: (kind: ExportKind, notesAppendix: boolean) => Promise<string>
  stopExport: () => boolean
}
