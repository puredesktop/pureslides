/**
 * The tools for a deck in an organisation's own look: see the reference,
 * build a custom look from it (or from a saved brand), generate the brand's
 * motif with the image model, look at a rendered slide beside the reference,
 * and save the look back as a brand other apps can use.
 *
 * Every write goes through the deck's one door (setCustomLook) or into the
 * package's assets; nothing here edits slides.
 */
import {
  agentToolErrorContent,
  formatAgentToolJson,
  readAgentToolStringArg,
} from '@purescience/platform-ui/bridge/agentToolHelpers'
import type { AgentToolHandlerResult } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { BUNDLED_FONT_URLS } from '../fonts/urls'
import { bundledFamily } from '../fonts/registry'
import {
  brandFromLook,
  BrandError,
  DESIGN_SYSTEM_SUFFIX,
  lookFontCatalogue,
  lookFromBrand,
  nearestBundled,
  parseBrand,
} from '../lib/brand'
import { brandPathProblem, readBrandArgument } from '../lib/houseStyle'
import {
  contrastNotes,
  customLook,
  customLookFromHtml,
  customLookTokens,
  CustomLookError,
  fontNotes,
  type CustomLookInput,
  type CustomLookSpec,
  type MotifPlacement,
} from '../lib/customLook'
import { slidesFromHtml } from '../lib/slides'
import type { DeckAgentToolContext, EditOptions } from './catalog'

const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' }
const mimeOf = (path: string) => IMAGE_MIME[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/png'
const baseName = (path: string) => path.split('/').pop() ?? path
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'motif'

function editOptions(args: Record<string, unknown>): EditOptions {
  const baseHash = readAgentToolStringArg(args, 'baseHash')?.trim()
  return baseHash ? { baseHash } : {}
}

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : undefined)

/** The pictures a tool can hand back to the model: PNG and JPEG (view_image shows the rest). */
const read0 = (path: string): 'image/png' | 'image/jpeg' | null => {
  const mime = mimeOf(path)
  return mime === 'image/png' || mime === 'image/jpeg' ? mime : null
}

/** A design reference attached to the deck, by name: what a stock look would ignore. */
export function referenceAssets(context: DeckAgentToolContext): string[] {
  return context.material.filter(item => item.role === 'reference').map(item => item.name)
}

export function listLookFontsHandler(): AgentToolHandlerResult {
  return {
    content: formatAgentToolJson({
      fonts: lookFontCatalogue(),
      note: 'These open (OFL) faces ship with the app and travel in every deck. Match a brand by classification — geometric, grotesque, humanist, serif, mono; x-height; width; the shape of a, g and t — then choose the closest. A brand with its own woff2 files uses those instead (setCustomLook with brand).',
    }),
  }
}

/** A package path for an asset named by the agent: `x.png`, `assets/x.png` or `assets/motifs/x.png`. */
function packageAsset(name: string): string {
  const clean = name.replace(/^\.\//, '')
  return clean.startsWith('assets/') ? clean : `assets/${clean}`
}

/** What a brand brings to the deck: the look's starting tokens, and the files it copied into the package. */
export interface BroughtBrand {
  input: CustomLookInput
  notes: string[]
  brought: string[]
  motifIdeas: { name: string; description: string }[]
}

/**
 * Read a brand file, bring its fonts, motif art and logos into the deck's
 * package, and answer the look it describes (not yet on the deck). Used by
 * setCustomLook, by createDeck and by a new deck starting in the house style.
 */
export async function bringBrand(context: DeckAgentToolContext, brandPath: string): Promise<BroughtBrand> {
  const brand = parseBrand(await context.files.readText(brandPath))
  const look = lookFromBrand(brand, brandPath)
  const brought: string[] = []
  for (const copy of look.copies) {
    const read = await context.files.readBase64(copy.from, 8 * 1024 * 1024)
    await context.writePackageFile(copy.to, read.base64)
    brought.push(copy.to)
  }
  if (look.motif) {
    const read = await context.files.readBase64(look.motif.from, 16 * 1024 * 1024)
    await context.writePackageFile(look.motif.to, read.base64)
    brought.push(look.motif.to)
  }
  for (const logo of look.logos) {
    const reference = await context.addAsset(logo.from, logo.name)
    context.setAssetRole(reference.replace(/^assets\//, ''), 'logo')
    brought.push(reference)
  }
  return { input: look.input, notes: [...look.notes], brought, motifIdeas: look.motifIdeas }
}

/**
 * The brand file a `brand` argument names: an absolute .designsystem.json
 * path as it is, or an id from listBrands looked up through the shell.
 * Answers the words of a refusal when it names nothing usable.
 */
export async function resolveBrandPath(
  context: DeckAgentToolContext,
  value: string,
): Promise<{ path: string; name?: string; samples?: string[] } | { error: string }> {
  const arg = readBrandArgument(value)
  if (!arg || arg.kind === 'none') return { error: 'brand must be an id from listBrands or the absolute path of a .designsystem.json file' }
  if (arg.kind === 'path') {
    const problem = brandPathProblem(arg.path)
    return problem ? { error: problem } : { path: arg.path }
  }
  if (!context.brands) return { error: `"${arg.id}" is not a path, and this desktop does not list brands: give the absolute path of a .designsystem.json file` }
  try {
    const detail = await context.brands.get(arg.id)
    return { path: detail.path, name: detail.name, samples: detail.samples }
  } catch (error) {
    return { error: `there is no brand "${arg.id}" (call listBrands for the ids): ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Build the custom look from a brand file, explicit tokens, or both
 * (explicit wins), bring the brand's files into the package, and put it on
 * the deck through the door.
 */
export async function setCustomLookHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  if (!context.documentPath) return agentToolErrorContent('there is no deck open — create one first')
  const notes: string[] = []
  let brought: string[] = []
  let base: CustomLookInput = {}
  const brandArg = str(args.brand)
  let motifIdeas: { name: string; description: string }[] = []
  let brandName: string | undefined
  try {
    if (brandArg) {
      const resolved = await resolveBrandPath(context, brandArg)
      if ('error' in resolved) return agentToolErrorContent(resolved.error)
      brandName = resolved.name
      const look = await bringBrand(context, resolved.path)
      notes.push(...look.notes)
      motifIdeas = look.motifIdeas
      brought = look.brought
      base = look.input
    } else {
      // Building on the look already there: a second call adjusts it rather than starting over.
      const current = customLookFromHtml(context.document.html)
      if (current) base = current
    }

    const colors = obj(args.colors)
    const fonts = obj(args.fonts)
    const scale = obj(args.scale)
    const motifArg = args.motif === null ? null : obj(args.motif)
    const face = (value: unknown, fallback: string | undefined, role: string) => {
      const name = str(value)
      if (!name) return fallback
      const carried = (base.faces ?? []).some(f => f.family.toLowerCase() === name.toLowerCase())
      if (carried || bundledFamily(name)) return carried ? name : bundledFamily(name)!.family
      const near = nearestBundled(name, role === 'mono' ? 'JetBrains Mono' : 'Inter')
      if (near.note) notes.push(near.note)
      return near.family
    }
    const input: CustomLookInput = {
      ...base,
      name: str(args.name) ?? base.name,
      colors: {
        ...base.colors,
        ...Object.fromEntries(
          ['bg', 'ink', 'muted', 'accent', 'accent2', 'highlight', 'surface', 'line', 'inverse', 'onInverse', 'inverseMuted']
            .filter(key => str(colors[key]))
            .map(key => [key, str(colors[key])]),
        ),
      },
      type: {
        ...base.type,
        heading: face(fonts.heading, base.type?.heading, 'heading'),
        body: face(fonts.body, base.type?.body, 'body'),
        mono: face(fonts.mono, base.type?.mono, 'mono'),
        ...(str(fonts.label) ? { label: fonts.label === 'mono' ? 'mono' : 'body' } : {}),
        ...(num(fonts.headingWeight) ? { headingWeight: num(fonts.headingWeight) } : {}),
        ...(num(fonts.bodyWeight) ? { bodyWeight: num(fonts.bodyWeight) } : {}),
        ...(num(fonts.labelWeight) ? { labelWeight: num(fonts.labelWeight) } : {}),
        ...(str(fonts.headingCase) ? { headingCase: fonts.headingCase === 'upper' ? 'upper' : 'none' } : {}),
        ...(str(fonts.trackingDisplay) ? { trackingDisplay: str(fonts.trackingDisplay) } : {}),
        ...(num(scale.base) ? { base: num(scale.base) } : {}),
        ...(num(scale.ratio) ? { ratio: num(scale.ratio) } : {}),
      },
      ...(num(args.radius) !== undefined ? { radius: num(args.radius) } : {}),
      ...(motifArg === null
        ? { motif: null }
        : str(motifArg.asset)
          ? {
              motif: {
                file: packageAsset(str(motifArg.asset)!),
                on: motifArg.on === 'marked' ? 'marked' : 'all',
                placement: (str(motifArg.placement) as MotifPlacement) ?? 'cover',
                opacity: num(motifArg.opacity) ?? 1,
              },
            }
          : {}),
    }
    const spec = customLook(input)
    const result = context.setCustomLook(spec, editOptions(args))
    if (!result.ok) return agentToolErrorContent(result.reason === 'stale' ? `${result.message}. currentHash: ${result.currentHash}` : result.message)
    notes.push(...fontNotes(spec), ...contrastNotes(spec))
    return {
      content: formatAgentToolJson({
        look: 'custom',
        name: spec.name,
        colors: spec.colors,
        type: { heading: spec.type.heading, body: spec.type.body, mono: spec.type.mono, label: spec.type.label, headingWeight: spec.type.headingWeight, headingCase: spec.type.headingCase },
        scale: Object.fromEntries(Object.entries(customLookTokens(spec)).filter(([key]) => key.startsWith('size-'))),
        radius: spec.radius,
        motif: spec.motif ?? null,
        brandFaces: spec.faces.map(f => `${f.family} ${f.weight}${f.style === 'italic' ? ' italic' : ''}`),
        ...(brandName ? { brand: brandName } : {}),
        ...(brought.length ? { brought } : {}),
        ...(notes.length ? { notes } : {}),
        ...(motifIdeas.length
          ? { motifsToGenerate: motifIdeas, nextMotif: 'These motifs have a description and no art yet: generate each with makeMotif from its description and the reference, then use it.' }
          : !spec.motif
            ? {
                nextMotif: context.generateImage
                  ? 'The look has no motif yet. If the reference has a recurring graphic idea (glowing nodes and lines, a grain, a light field, a texture), generate it now with makeMotif, prompted from the reference and passing it as reference, before writing slides. Do not draw it with CSS shapes or SVG lines.'
                  : 'The look has no motif and this desktop has no image model: say so; a simple SVG stand-in in the brand colours is the only fallback.',
              }
            : {}),
        hash: result.hash,
        changed: result.changed,
        tokens:
          'Write slides with --slide-* tokens: --slide-accent-2 (a second-colour line), --slide-highlight (a small bright note), --slide-label-font (tags and kickers), --slide-radius (cards and buttons), plus every stock token. Put data-motif="none" on a slide that should stand clear of the motif.',
        next: spec.motif || !context.generateImage
          ? 'viewSlide with compareWith set to the reference, and fix what differs, before you call the deck done.'
          : 'makeMotif for the reference’s motif (see nextMotif), then write the slides, then viewSlide with compareWith set to the reference and fix what differs before you call the deck done.',
      }),
    }
  } catch (error) {
    if (error instanceof CustomLookError || error instanceof BrandError) return agentToolErrorContent(error.message)
    return agentToolErrorContent(error instanceof Error ? error.message : String(error))
  }
}

/** Words added to every motif prompt: art for behind slides, not a picture with words in it. */
export function motifPrompt(prompt: string, spec: CustomLookSpec | null): string {
  const palette = spec
    ? ` Use only this palette: ground ${spec.colors.bg}, accent ${spec.colors.accent}, second accent ${spec.colors.accent2}, highlight ${spec.colors.highlight}.`
    : ''
  return `${prompt.trim()}${palette} This is background art for 16:9 presentation slides in an organisation's brand: a wide, calm composition with large quiet areas (especially the left half and the centre) where headlines and text will sit, detail and brightness kept toward the edges. No text, letters, numbers, logos, watermarks, user interface or frames. Match the reference image's style, light and colour exactly when one is given.`
}

/**
 * Generate the brand's motif or texture with the desktop's image model and
 * keep it in the package's assets/motifs/; by default it becomes the custom
 * look's motif. The picture comes back so the agent can judge it.
 */
export async function makeMotifHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  if (!context.documentPath) return agentToolErrorContent('there is no deck open — create one first')
  const prompt = str(args.prompt)
  if (!prompt) return agentToolErrorContent('prompt is required: describe the motif (what, its light and texture) from the reference and the brand')
  if (!context.generateImage)
    return agentToolErrorContent(
      'this desktop has no image model to generate with. Say so to the person (Settings › Models › Images). Only then fall back to a simpler motif drawn as SVG with the brand colours, and say that it is a fallback.',
    )
  const name = slug(str(args.name) ?? 'motif')
  const sourceImages: { base64: string; mimeType: string; name?: string }[] = []
  const reference = str(args.reference)
  if (reference) {
    const path = reference.startsWith('/') ? reference : `${context.documentPath}/${packageAsset(reference)}`
    try {
      const read = await context.files.readBase64(path, 12 * 1024 * 1024)
      sourceImages.push({ base64: read.base64, mimeType: read.mimeType ?? mimeOf(path), name: baseName(path) })
    } catch (error) {
      return agentToolErrorContent(`could not read the reference ${reference}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const spec = customLookFromHtml(context.document.html)
  const size = args.size === '1024x1024' || args.size === '1024x1536' ? args.size : '1536x1024'
  let image
  try {
    image = await context.generateImage({ prompt: motifPrompt(prompt, spec), size, quality: 'high', outputFormat: 'png', ...(sourceImages.length ? { sourceImages } : {}) })
  } catch (error) {
    return agentToolErrorContent(`the image model could not make the motif: ${error instanceof Error ? error.message : String(error)}`)
  }
  const extension = image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType === 'image/webp' ? 'webp' : 'png'
  const file = await context.writePackageFile(`assets/motifs/${name}.${extension}`, image.base64)
  const use = args.use !== false
  let applied: Record<string, unknown> = {}
  if (use) {
    if (!spec)
      applied = { applied: false, why: 'the deck has no custom look yet: call setCustomLook with motif.asset set to this file' }
    else {
      try {
        const next = customLook({
          ...spec,
          motif: {
            file,
            on: args.on === 'marked' ? 'marked' : 'all',
            placement: (str(args.placement) as MotifPlacement) ?? spec.motif?.placement ?? 'cover',
            opacity: num(args.opacity) ?? spec.motif?.opacity ?? 1,
          },
        })
        const result = context.setCustomLook(next, editOptions(args))
        applied = result.ok ? { applied: true, hash: result.hash } : { applied: false, why: result.message }
      } catch (error) {
        applied = { applied: false, why: error instanceof Error ? error.message : String(error) }
      }
    }
  }
  return {
    content: formatAgentToolJson({
      file,
      model: image.modelId,
      ...applied,
      look: 'This is the generated motif. Check it against the reference: palette, light, density, and quiet room for type. Regenerate with a sharper prompt if it is off; then viewSlide to see it behind real slides.',
    }),
    ...(image.mimeType === 'image/png' || image.mimeType === 'image/jpeg'
      ? { images: [{ mimeType: image.mimeType as 'image/png' | 'image/jpeg', data: image.base64 }] }
      : {}),
  }
}

/**
 * Look at a slide as it renders, beside the reference when one is named, to
 * compare the look before calling it done.
 */
export async function viewSlideHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  if (!context.documentPath) return agentToolErrorContent('there is no deck open')
  const slides = slidesFromHtml(context.document.html)
  const index = args.index === undefined ? context.ui.selectedSlide : Number(args.index)
  if (!Number.isInteger(index) || index < 0 || !slides[index])
    return agentToolErrorContent(`index must be a slide number from listSlides — the deck has ${slides.length}`)
  const images: { mimeType: 'image/png' | 'image/jpeg'; data: string }[] = []
  let picture
  try {
    picture = await context.renderSlide(index)
  } catch (error) {
    return agentToolErrorContent(`slide ${index + 1} could not be drawn: ${error instanceof Error ? error.message : String(error)}`)
  }
  images.push({ mimeType: 'image/png', data: picture.dataUrl.replace(/^data:[^,]*,/, '') })
  const compareWith = str(args.compareWith) ?? (args.compare === false ? undefined : referenceAssets(context)[0])
  let compared: string | null = null
  if (compareWith) {
    const path = compareWith.startsWith('/') ? compareWith : `${context.documentPath}/${packageAsset(compareWith)}`
    try {
      const mimeType = read0(path)
      if (mimeType) {
        const read = await context.files.readBase64(path, 12 * 1024 * 1024)
        images.push({ mimeType, data: read.base64 })
        compared = path
      }
    } catch {
      compared = null
    }
  }
  return {
    content: formatAgentToolJson({
      slide: index + 1,
      size: `${picture.width} × ${picture.height}`,
      images: compared ? ['the slide as it renders', `the reference: ${baseName(compared)}`] : ['the slide as it renders'],
      compare: compared
        ? 'Compare them as a person who knows the brand would: ground colour, the headline face, its weight and tracking, the second-colour line, the label style, the motif (its light, density, placement), the button or rule shapes, the space. Name every difference, fix it (setCustomLook, makeMotif, setSlideHtml), and look again.'
        : 'Look at it as the room will. Attach the reference (setAssetRole reference) or pass compareWith to compare with it.',
    }),
    images,
  }
}

export interface SaveLookOptions {
  path: string
  id?: string
  guidelines?: string[]
  voice?: string[]
  motifName?: string
  motifDescription?: string
  logosOnDark?: boolean
  /** More sample images for the brand's references (absolute paths inside the deck's package, e.g. exported slides). */
  extraReferences?: string[]
}

/**
 * Write the deck's custom look as a brand file with its folder beside it,
 * and remember it as the brand saved from this deck. Throws the words to
 * show when it cannot.
 */
export async function saveDeckLookAsBrand(
  context: DeckAgentToolContext,
  options: SaveLookOptions,
): Promise<{ saved: string; files: string[] }> {
  if (!context.documentPath) throw new BrandError('there is no deck open')
  const spec = customLookFromHtml(context.document.html)
  if (!spec) throw new BrandError('the deck has a stock look; make a custom look first (setCustomLook)')
  const { path } = options
  if (!path || !path.startsWith('/') || !path.endsWith(DESIGN_SYSTEM_SUFFIX))
    throw new BrandError(`path must be the absolute path of the brand file to write, ending in ${DESIGN_SYSTEM_SUFFIX}`)
  const pkg = context.documentPath.replace(/\/+$/, '')
  const logos = context.material.filter(item => item.role === 'logo').map(item => ({ file: `assets/${item.name}`, onDark: Boolean(options.logosOnDark) }))
  const references = [
    ...context.material.filter(item => item.role === 'reference').map(item => ({ file: `assets/${item.name}`, ...(item.description ? { note: item.description } : {}) })),
    ...(options.extraReferences ?? [])
      .filter(file => file.startsWith(`${pkg}/`))
      .map(file => ({ file: file.slice(pkg.length + 1), note: 'A slide from a deck in this look.' })),
  ]
  const motifDescription = options.motifDescription
  const motifs = spec.motif
    ? [{ name: options.motifName ?? 'Motif', description: motifDescription ?? 'The brand’s background art, generated from its reference.', file: spec.motif.file }]
    : motifDescription
      ? [{ name: options.motifName ?? 'Motif', description: motifDescription }]
      : []
  const { json, copies } = brandFromLook({
    spec,
    path,
    ...(options.id ? { id: options.id } : {}),
    ...(options.guidelines ? { guidelines: options.guidelines } : {}),
    ...(options.voice ? { voice: options.voice } : {}),
    logos,
    references,
    motifs,
  })
  const folder = path.replace(/\/[^/]*$/, '')
  for (const copy of copies) {
    const target = `${folder}/${copy.to}`
    await context.files.ensureFolder(target.replace(/\/[^/]*$/, ''))
    const bundled = BUNDLED_FONT_URLS[copy.from.replace(/^assets\//, '')]
    const base64 = bundled ? bundled.replace(/^data:[^,]*,/, '') : (await context.files.readBase64(`${pkg}/${copy.from}`, 16 * 1024 * 1024)).base64
    await context.files.writeBase64(target, base64)
  }
  await context.files.writeText(path, json)
  context.rememberSavedBrand?.(path)
  return { saved: path, files: copies.map(copy => copy.to) }
}

/** Write the deck's custom look back as a brand other apps (Canvas, PureSite, PureDesign) read. */
export async function saveLookAsBrandHandler(
  context: DeckAgentToolContext,
  args: Record<string, unknown>,
): Promise<AgentToolHandlerResult> {
  const list = (value: unknown) => (Array.isArray(value) ? value.map(str).filter((v): v is string => Boolean(v)) : undefined)
  try {
    const result = await saveDeckLookAsBrand(context, {
      path: str(args.path) ?? '',
      ...(str(args.id) ? { id: str(args.id) } : {}),
      ...(list(args.guidelines) ? { guidelines: list(args.guidelines) } : {}),
      ...(list(args.voice) ? { voice: list(args.voice) } : {}),
      ...(str(args.motifName) ? { motifName: str(args.motifName) } : {}),
      ...(str(args.motifDescription) ? { motifDescription: str(args.motifDescription) } : {}),
      logosOnDark: Boolean(args.logosOnDark),
    })
    return {
      content: formatAgentToolJson({
        ...result,
        note: 'Saved in the shared brand format (pure-design-system v1 with fonts, logos, motifs and references beside it). Canvas, PureSite and PureDesign read it; PureSlides reads it back with setCustomLook brand.',
        ...(context.brands
          ? { propose: 'To offer it to the organisation as a house style, call proposeBrandToOrganisation (no brand argument proposes this saved brand). It needs at least one reference image.' }
          : {}),
      }),
    }
  } catch (error) {
    return agentToolErrorContent(error instanceof Error ? error.message : String(error))
  }
}
