/**
 * The organisation's brands, for this app: list them (the house style
 * marked), start a new deck in the house style, and propose a brand or a
 * deck's slides to the organisation for an administrator to approve.
 *
 * Every function here is called both by a drawer tool and by the app's own
 * controls (the new-deck path, "Propose to organisation…"), over the same
 * context, so the person and the agent do the same thing.
 */
import {
  agentToolErrorContent,
  formatAgentToolJson,
} from '@purescience/platform-ui/bridge/agentToolHelpers'
import type { AgentToolHandlerResult } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { customLook, customLookFromHtml } from '../lib/customLook'
import {
  brandListing,
  deckBrandFile,
  deckTakesHouseStyle,
  houseStyleCaption,
  MAX_SAMPLE_IMAGES,
  pickSlideImages,
  readBrandArgument,
  wearsHouseStyle,
} from '../lib/houseStyle'
import type { DeckAgentToolContext } from './catalog'
import { bringBrand, resolveBrandPath, saveDeckLookAsBrand } from './lookTools'

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

export const NO_ORGANISATION_WORDS =
  'This desktop cannot propose to an organisation: it needs a PureDesktop that is managed by an organisation’s PureServer.'

/** The brands the agent may use, the organisation's default first and marked. */
export async function listBrandsHandler(context: DeckAgentToolContext): Promise<AgentToolHandlerResult> {
  if (!context.brands)
    return {
      content: formatAgentToolJson({
        brands: [],
        note: 'This desktop does not list brands. Use setCustomLook with the absolute path of a .designsystem.json file the person names.',
      }),
    }
  try {
    const brands = brandListing(await context.brands.list())
    const house = brands.find(brand => brand.default)
    const detail = house ? await context.brands.default().catch(() => null) : null
    return {
      content: formatAgentToolJson({
        brands,
        ...(house
          ? {
              houseStyle: house.name,
              ...(detail?.samples?.length ? { houseStyleSamples: detail.samples } : {}),
              note: `${house.name} is the organisation’s house style: a new deck starts in it. Look at its sample images with view_image first. A reference or brand the person gives still wins. Pass an id to setCustomLook brand (or createDeck brand) to use another.`,
            }
          : { note: 'No organisation house style here. Pass an id to setCustomLook brand to use one of these.' }),
      }),
    }
  } catch (error) {
    return agentToolErrorContent(`the brands could not be listed: ${message(error)}`)
  }
}

export interface StartedInBrand {
  applied: boolean
  /** The brand's name, when one was applied. */
  name?: string
  path?: string
  samples?: string[]
  notes?: string[]
  motifsToGenerate?: { name: string; description: string }[]
  /** Why nothing was applied. */
  why?: string
}

/**
 * Put a brand on the open deck through the door: its files come into the
 * package and its look goes on the root. `stillWanted` is asked again just
 * before the look lands, so a look somebody chose meanwhile is never undone.
 */
export async function startInBrand(
  context: DeckAgentToolContext,
  brand: { path: string; name?: string; samples?: string[] },
  stillWanted: () => boolean = () => true,
): Promise<StartedInBrand> {
  if (!stillWanted()) return { applied: false, why: 'a look was chosen' }
  const brought = await bringBrand(context, brand.path)
  if (!stillWanted()) return { applied: false, why: 'a look was chosen' }
  const spec = customLook(brought.input)
  const result = context.setCustomLook(spec)
  if (!result.ok) return { applied: false, why: result.message }
  return {
    applied: true,
    name: spec.name,
    path: brand.path,
    ...(brand.samples?.length ? { samples: brand.samples } : {}),
    ...(brought.notes.length ? { notes: brought.notes } : {}),
    ...(brought.motifIdeas.length ? { motifsToGenerate: brought.motifIdeas } : {}),
  }
}

/**
 * A NEW deck starts in the organisation's house style when it has a stock
 * look, no design reference, and nobody chose a look. One `default()` call
 * answers null when there is no organisation; then nothing happens.
 */
export async function startInHouseStyle(
  context: DeckAgentToolContext,
  deck: { html: string; material: readonly { role?: string | null }[]; chosen?: () => boolean },
): Promise<StartedInBrand | null> {
  if (!context.brands) return null
  const house = await context.brands.default()
  if (!house) return null
  const chosen = deck.chosen ?? (() => false)
  if (!deckTakesHouseStyle({ html: deck.html, material: deck.material, chosen: chosen() }))
    return { applied: false, name: house.name, why: 'the deck already has a look or a reference' }
  return startInBrand(context, { path: house.path, name: house.name, samples: house.samples }, () => !chosen())
}

/** What createDeck and the new-deck path answer about the brand the deck started in. */
export function startedWords(started: StartedInBrand | null, house: boolean): Record<string, unknown> {
  if (!started) return {}
  if (!started.applied) return started.name ? { houseStyle: started.name, houseStyleApplied: false, why: started.why } : {}
  return {
    brand: started.name,
    ...(house ? { houseStyle: started.name, say: houseStyleCaption(started.name ?? '') } : {}),
    ...(started.samples?.length
      ? { samples: started.samples, look: 'Look at these sample images with view_image before writing slides: they show the brand in use.' }
      : {}),
    ...(started.notes?.length ? { notes: started.notes } : {}),
    ...(started.motifsToGenerate?.length
      ? { motifsToGenerate: started.motifsToGenerate, nextMotif: 'These motifs have a description and no art yet: generate each with makeMotif from its description, then use it.' }
      : {}),
    next: house
      ? 'The deck is in the organisation’s house style. Keep it (do not call setLook) unless the person asks for another look or gives a reference; then their choice wins. Tell the person which brand the deck is in.'
      : 'The deck is in this brand. Tell the person which brand it is in.',
  }
}

/** The brand to propose: one named by id or path, or the brand saved from this deck (saved now if it never was). */
export async function proposeBrandFromDeck(
  context: DeckAgentToolContext,
  input: { brand?: string; note?: string },
): Promise<{ message: string; organisation: string; path?: string; id?: string; savedNow?: boolean }> {
  if (!context.brands) throw new Error(NO_ORGANISATION_WORDS)
  const note = input.note?.trim() || undefined
  const arg = readBrandArgument(input.brand)
  if (arg?.kind === 'path') {
    const answer = await context.brands.propose({ path: arg.path, ...(note ? { note } : {}) })
    return { message: answer.message, organisation: answer.organisation, path: arg.path }
  }
  if (arg?.kind === 'id') {
    const answer = await context.brands.propose({ id: arg.id, ...(note ? { note } : {}) })
    return { message: answer.message, organisation: answer.organisation, id: arg.id }
  }
  // This deck's own look.
  if (!context.documentPath) throw new Error('There is no deck open.')
  let path = context.savedBrandPath
  let savedNow = false
  if (!path) {
    const spec = customLookFromHtml(context.document.html)
    if (!spec) throw new Error('This deck has a stock look, so it has no brand of its own to propose. Make its look first (setCustomLook).')
    if (wearsHouseStyle(spec.name, context.houseStyle))
      throw new Error(`This deck is already in ${spec.name}, the organisation’s house style. Propose its slides as samples instead.`)
    const hasReference = context.material.some(item => item.role === 'reference')
    // A house style must carry at least one sample image: with no reference, the deck's own slides are its samples.
    const extraReferences = hasReference ? [] : pickSlideImages(await context.exportSlideImages()).slice(0, MAX_SAMPLE_IMAGES)
    path = deckBrandFile(context.documentPath, spec.name)
    await saveDeckLookAsBrand(context, { path, extraReferences })
    savedNow = true
  }
  const answer = await context.brands.propose({ path, ...(note ? { note } : {}) })
  return { message: answer.message, organisation: answer.organisation, path, savedNow }
}

/** Sample images for one of the organisation's brands (its default when none is named): given files, or this deck's slides. */
export async function proposeDeckSamples(
  context: DeckAgentToolContext,
  input: { brand?: string; images?: string[]; slides?: number[]; note?: string },
): Promise<{ message: string; organisation: string; images: string[] }> {
  if (!context.brands) throw new Error(NO_ORGANISATION_WORDS)
  const note = input.note?.trim() || undefined
  let images: string[]
  if (input.images?.length) {
    const bad = input.images.find(image => !image.startsWith('/') || !/\.(png|jpe?g|webp)$/i.test(image))
    if (bad) throw new Error(`${bad} is not an absolute PNG, JPEG or WebP path`)
    if (input.images.length > MAX_SAMPLE_IMAGES) throw new Error(`At most ${MAX_SAMPLE_IMAGES} images go in one proposal.`)
    images = input.images
  } else {
    if (!context.documentPath) throw new Error('There is no deck open: name the images to propose.')
    images = pickSlideImages(await context.exportSlideImages(), input.slides)
    if (!images.length) throw new Error('No slide pictures came out of the export.')
  }
  const answer = await context.brands.proposeSamples({
    images,
    ...(input.brand?.trim() ? { brand: input.brand.trim() } : {}),
    ...(note ? { note } : {}),
  })
  return { message: answer.message, organisation: answer.organisation, images }
}

export async function proposeBrandToOrganisationHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  try {
    const result = await proposeBrandFromDeck(context, { brand: str(args.brand), note: str(args.note) })
    return {
      content: formatAgentToolJson({
        proposed: true,
        ...result,
        next: 'Tell the person what was sent and that an administrator approves it on the organisation’s server.',
      }),
    }
  } catch (error) {
    return agentToolErrorContent(message(error))
  }
}

export async function proposeSamplesToOrganisationHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const images = Array.isArray(args.images) ? args.images.map(str).filter((v): v is string => Boolean(v)) : undefined
  const slides = Array.isArray(args.slides)
    ? args.slides.map(Number).filter(n => Number.isInteger(n) && n >= 0)
    : undefined
  try {
    const result = await proposeDeckSamples(context, {
      ...(str(args.brand) ? { brand: str(args.brand) } : {}),
      ...(images?.length ? { images } : {}),
      ...(slides?.length ? { slides } : {}),
      ...(str(args.note) ? { note: str(args.note) } : {}),
    })
    return {
      content: formatAgentToolJson({
        proposed: true,
        ...result,
        next: 'Tell the person what was sent: once an administrator approves them, these pictures join the brand’s references.',
      }),
    }
  } catch (error) {
    return agentToolErrorContent(message(error))
  }
}
