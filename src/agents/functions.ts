/**
 * High-level composite PureSlides App Functions (`fn_*`).
 *
 * Each function collapses 3–12 atomic tool round-trips into one auditable call
 * using PureSlides' own deterministic libraries (`deckHealth`, `outlineToDeck`,
 * `layoutRemix`, `checkDeck`, `slides`, `deckLooks`, `customLook`, `rehearsal`)
 * and routing every write through the app's single document door.
 */
import {
  defineAppFunction,
  type AppFunctionDefinition,
} from '@purescience/platform-ui/bridge/appFunctions'
import { checkDeck, hasBlockingFinding } from '../lib/checkDeck'
import {
  contrastNotes,
  customLook,
  customLookFromHtml,
  CustomLookError,
  fontNotes,
  withCustomLook,
  type CustomLookInput,
} from '../lib/customLook'
import { geometryFromHtml } from '../lib/deckDocument'
import {
  autoFixHighContrastLook,
  autoFixRenumberSteps,
  autoFixTrimBlankSlides,
  evaluateDeckHealth,
} from '../lib/deckHealth'
import { DECK_LOOKS, deckLook, lookFromHtml, withDeckLook } from '../lib/deckLooks'
import { wearsHouseStyle } from '../lib/houseStyle'
import {
  REMIXABLE_BLOCK_IDS,
  remixSlideLayout,
  type RemixableBlockId,
} from '../lib/layoutRemix'
import { outlineToDeckHtml } from '../lib/outlineToDeck'
import { referencedAssetNames } from '../lib/packageAssets'
import { formatDuration } from '../lib/rehearsal'
import { slidesFromHtml, wordsOf, type SlideEdit } from '../lib/slides'
import { bundledFamily } from '../fonts/registry'
import { nearestBundled } from '../lib/brand'
import {
  AgentDeckToolError,
  MISSING_BASE_HASH_MESSAGE,
  type DeckAgentToolContext,
} from './catalog'

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : undefined

function requireBaseHash(args: Record<string, unknown>): string {
  const baseHash = typeof args.baseHash === 'string' ? args.baseHash.trim() : ''
  if (!baseHash) {
    throw new AgentDeckToolError(MISSING_BASE_HASH_MESSAGE)
  }
  return baseHash
}

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter(Boolean).length
}

function slideOnScreenWords(html: string): number[] {
  if (typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
  if (!root) return []
  const childSlides = [...root.children].filter(el => el.matches('[data-slide]'))
  const slides = childSlides.length ? childSlides : root.children.length ? [root] : []
  return slides.map(slide => {
    const clone = slide.cloneNode(true) as Element
    clone.querySelectorAll('style, script, [data-notes]').forEach(n => n.remove())
    return countWords(wordsOf(clone))
  })
}

async function resolveAvailableAssets(ctx: DeckAgentToolContext): Promise<string[]> {
  const names = new Set((ctx.material ?? []).map(item => item.name))
  if (ctx.documentPath && typeof ctx.listAssets === 'function') {
    try {
      const files = await ctx.listAssets()
      for (const file of files) {
        if (file?.name) names.add(file.name)
      }
    } catch {
      // Fall back to ctx.material when package asset listing is unavailable.
    }
  }
  return [...names]
}

interface StructuredSlideSpec {
  kicker?: string
  headline?: string
  support?: string
  bullets?: Array<string | { text: string; step?: boolean }>
  stats?: Array<{ value: string; label: string }>
  quote?: { text: string; attribution?: string }
  table?: { headers: string[]; rows: string[][] }
  notes?: string
  seconds?: number
}

function structuredSlidesToMarkdown(specs: StructuredSlideSpec[]): string {
  const blocks: string[] = []
  for (const spec of specs) {
    const lines: string[] = []
    const kicker = str(spec.kicker)
    if (kicker) lines.push(`Kicker: ${kicker}`)
    const headline = str(spec.headline)
    if (headline) lines.push(`# ${headline}`)
    const support = str(spec.support)
    if (support) lines.push(support)

    if (spec.quote && str(spec.quote.text)) {
      lines.push(`> ${str(spec.quote.text)}`)
      if (str(spec.quote.attribution)) {
        lines.push(`> — ${str(spec.quote.attribution)}`)
      }
    }

    if (Array.isArray(spec.stats)) {
      for (const stat of spec.stats) {
        const value = str(stat?.value)
        const label = str(stat?.label)
        if (value && label) lines.push(`${value} | ${label}`)
      }
    }

    if (spec.table && Array.isArray(spec.table.headers) && spec.table.headers.length > 0) {
      const headers = spec.table.headers.map(h => String(h ?? '').trim())
      lines.push(`| ${headers.join(' | ')} |`)
      lines.push(`| ${headers.map(() => '---').join(' | ')} |`)
      const rows = Array.isArray(spec.table.rows) ? spec.table.rows : []
      for (const row of rows) {
        if (!Array.isArray(row)) continue
        lines.push(`| ${row.map(c => String(c ?? '').trim()).join(' | ')} |`)
      }
    }

    if (Array.isArray(spec.bullets)) {
      for (const item of spec.bullets) {
        if (typeof item === 'string' && item.trim()) {
          lines.push(`- ${item.trim()}`)
        } else if (item && typeof item === 'object' && str(item.text)) {
          lines.push(`- ${str(item.text)}${item.step ? ' [step]' : ''}`)
        }
      }
    }

    const notes = str(spec.notes)
    if (notes) lines.push(`Notes: ${notes}`)

    if (lines.length > 0) blocks.push(lines.join('\n'))
  }
  return blocks.join('\n\n---\n\n')
}

function applySecondsToSlideRange(
  html: string,
  startIndex: number,
  secondsList: Array<number | undefined>,
): string {
  if (typeof DOMParser === 'undefined') return html
  if (!secondsList.some(s => typeof s === 'number' && Number.isFinite(s) && s > 0)) {
    return html
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
  if (!root) return html
  const slides = [...root.children].filter(el => el.matches('[data-slide]'))
  let changed = false
  secondsList.forEach((sec, offset) => {
    const target = slides[startIndex + offset]
    if (target && typeof sec === 'number' && Number.isFinite(sec) && sec > 0) {
      target.setAttribute('data-seconds', String(sec))
      changed = true
    }
  })
  return changed ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n` : html
}

function checkLookGuards(
  ctx: DeckAgentToolContext,
  targetLookId: string,
  args: Record<string, unknown>,
): void {
  const references = (ctx.material ?? [])
    .filter(item => item.role === 'reference')
    .map(item => item.name)
  if (references.length && args.ignoreReference !== true) {
    throw new AgentDeckToolError(
      `This deck has a design reference (${references.join(', ')}): a stock look would ignore it. Pass ignoreReference: true only if the user explicitly asked for the ${targetLookId} look.`,
    )
  }
  const wearing = ctx.houseStyle
    ? customLookFromHtml(ctx.document.html)?.name
    : undefined
  if (wearsHouseStyle(wearing, ctx.houseStyle) && args.ignoreHouseStyle !== true) {
    throw new AgentDeckToolError(
      `This deck is in ${wearing}, the organisation's house style: a stock look would replace it. Pass ignoreHouseStyle: true only if the user explicitly asked for the ${targetLookId} look.`,
    )
  }
}

export const PURESLIDES_FUNCTIONS: readonly AppFunctionDefinition<DeckAgentToolContext>[] = [
  // 1. Deck Outline & Briefing (Read)
  defineAppFunction<DeckAgentToolContext>({
    name: 'fn_deckOutlineAndBriefing',
    category: 'deck',
    risk: 'read',
    requiresApproval: false,
    replaces: [
      'getDeckContext',
      'listSlides',
      'listAssets',
      'listRevisions',
      'checkDeck',
    ],
    description:
      'Read a complete single-call presentation briefing: deck metadata, content hash (for baseHash), active aim, look and brand posture, ordered slide outline with notes coverage, asset inventory, revision count, and health summary.',
    inputSchema: {
      type: 'object',
      properties: {
        includeNotesPreview: {
          type: 'boolean',
          description:
            'Include full speaker notes text for each slide (default true). Set false for a compact outline on long decks.',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const includeNotes = args.includeNotesPreview !== false
      const html = ctx.document.html
      const slides = slidesFromHtml(html)
      const geometry = geometryFromHtml(html)
      const availableAssets = await resolveAvailableAssets(ctx)
      const health = evaluateDeckHealth(html, ctx.verification, { availableAssets })
      const customSpec = customLookFromHtml(html)
      const stockLookId = customSpec ? null : lookFromHtml(html)
      const stockDef = stockLookId ? deckLook(stockLookId) : null

      const aim = ctx.ui.elementSelection.length
        ? {
            scope: 'elements' as const,
            slideIndex: ctx.ui.selectedSlide,
            elements: ctx.ui.elementSelection,
          }
        : ctx.ui.slideSelection.length > 1
          ? { scope: 'slides' as const, slideIndexes: ctx.ui.slideSelection }
          : { scope: 'slide' as const, slideIndex: ctx.ui.selectedSlide }

      const material = ctx.material ?? []
      const roleCounts = { content: 0, reference: 0, logo: 0 }
      const undescribedAssets: string[] = []
      for (const item of material) {
        const role = item.role ?? 'content'
        if (role === 'reference') roleCounts.reference += 1
        else if (role === 'logo') roleCounts.logo += 1
        else roleCounts.content += 1
        if (!item.description?.trim()) undescribedAssets.push(item.name)
      }

      const outline = slides.map(slide => ({
        index: slide.index,
        headline: slide.headline,
        support: slide.support,
        block: slide.block || 'custom',
        steps: slide.steps,
        seconds: slide.seconds,
        hasNotes: Boolean(slide.notes.trim()),
        notesWords: countWords(slide.notes),
        ...(includeNotes && slide.notes.trim() ? { notes: slide.notes } : {}),
        ...(slide.asset ? { asset: slide.asset } : {}),
        ...(slide.synthetic ? { synthetic: true } : {}),
      }))

      const blockingErrorCount = health.findings.filter(f => f.severity === 'error').length
      const warningCount = health.findings.filter(f => f.severity === 'warning').length
      const slidesWithNotes = outline.filter(s => s.hasNotes).length
      const lookSummary = customSpec
        ? {
            kind: 'custom' as const,
            name: customSpec.name,
            headingFont: customSpec.type.heading,
            bodyFont: customSpec.type.body,
            hasMotif: Boolean(customSpec.motif),
            colors: customSpec.colors,
          }
        : {
            kind: 'stock' as const,
            id: stockDef?.id ?? 'auto',
            label: stockDef?.label ?? 'Auto',
            headingFont: stockDef?.type.heading ?? 'Inter',
            bodyFont: stockDef?.type.body ?? 'Inter',
          }

      return {
        mutated: false,
        summary: `Deck "${ctx.document.title || 'Untitled'}" (${slides.length} slide${slides.length === 1 ? '' : 's'}, health ${health.score}/100, layout ${ctx.verification.state}).`,
        data: {
          ...ctx.summarize(),
          title: ctx.document.title,
          documentPath: ctx.documentPath,
          hash: ctx.hash,
          geometry,
          view: ctx.ui.view,
          brief: ctx.ui.brief,
          targetSlides: ctx.ui.slideCount,
          aim,
          look: lookSummary,
          ...(ctx.houseStyle
            ? {
                houseStyle: {
                  name: ctx.houseStyle.name,
                  deckIsInIt: wearsHouseStyle(customSpec?.name, ctx.houseStyle),
                  samples: ctx.houseStyle.samples,
                },
              }
            : {}),
          slideCount: slides.length,
          slidesWithNotes,
          outline,
          assets: {
            total: material.length,
            byRole: roleCounts,
            undescribedAssets,
            items: material.map(item => ({
              name: item.name,
              reference: item.reference,
              role: item.role ?? 'content',
              description: item.description,
            })),
          },
          health: {
            score: health.score,
            verification: {
              state: ctx.verification.state,
              message: ctx.verification.message,
              overlappingSlides: ctx.verification.failedSlides,
              checkingSlides: ctx.verification.checkingSlides,
            },
            blockingErrorCount,
            warningCount,
            trailingBlankCount: health.trailingBlankCount,
            hasStepGaps: health.hasStepGaps,
            hasContrastIssues: health.hasContrastIssues,
          },
          revisionsCount: ctx.listRevisions().length,
          exporting: ctx.exporting,
          lastExportPath: ctx.lastExportPath,
        },
      }
    },
  }),

  // 2. Scaffold Slides from Outline or Structured Specs (Write)
  defineAppFunction<DeckAgentToolContext>({
    name: 'fn_scaffoldSlidesFromOutline',
    category: 'slides',
    risk: 'write',
    requiresApproval: true,
    replaces: ['listBlocks', 'addSlide', 'addBlock', 'updateSlide', 'setDeck'],
    description:
      'Build and insert one or more complete, token-styled slides from a Markdown outline (separated by ---) or structured slide specs in one call. Requires baseHash from getDeckContext; supports append or replace mode and returns the new hash plus immediate lint findings.',
    inputSchema: {
      type: 'object',
      properties: {
        baseHash: {
          type: 'string',
          description:
            'The deck hash from getDeckContext or fn_deckOutlineAndBriefing. Required.',
        },
        markdown: {
          type: 'string',
          description:
            'Markdown outline with slides separated by --- (# headline, - bullets with optional [step], > quotes, "80% | label" stats, | tables |, Kicker:, Notes:).',
        },
        slides: {
          type: 'array',
          description:
            'Structured slide specifications as an alternative to markdown.',
          items: {
            type: 'object',
            properties: {
              kicker: { type: 'string' },
              headline: { type: 'string' },
              support: { type: 'string' },
              bullets: {
                type: 'array',
                items: {
                  oneOf: [
                    { type: 'string' },
                    {
                      type: 'object',
                      properties: {
                        text: { type: 'string' },
                        step: { type: 'boolean' },
                      },
                      required: ['text'],
                    },
                  ],
                },
              },
              stats: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    value: { type: 'string' },
                    label: { type: 'string' },
                  },
                  required: ['value', 'label'],
                },
              },
              quote: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  attribution: { type: 'string' },
                },
                required: ['text'],
              },
              table: {
                type: 'object',
                properties: {
                  headers: { type: 'array', items: { type: 'string' } },
                  rows: {
                    type: 'array',
                    items: { type: 'array', items: { type: 'string' } },
                  },
                },
                required: ['headers', 'rows'],
              },
              notes: { type: 'string' },
              seconds: { type: 'number', minimum: 1 },
            },
          },
        },
        mode: {
          type: 'string',
          enum: ['append', 'replace'],
          description:
            'Whether to append slides after existing ones (default) or replace all existing slides.',
        },
        title: {
          type: 'string',
          description: 'Optional updated deck title.',
        },
        brief: {
          type: 'string',
          description: 'Optional deck brief to record alongside the scaffolded slides.',
        },
      },
      required: ['baseHash'],
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const baseHash = requireBaseHash(args)
      const mode = args.mode === 'replace' ? 'replace' : 'append'
      const rawMarkdown = str(args.markdown)
      const structuredSpecs = Array.isArray(args.slides)
        ? (args.slides as StructuredSlideSpec[])
        : null

      if (!rawMarkdown && (!structuredSpecs || structuredSpecs.length === 0)) {
        throw new AgentDeckToolError(
          'Provide either non-empty "markdown" or a non-empty "slides" array.',
        )
      }

      const sourceMarkdown = rawMarkdown ?? structuredSlidesToMarkdown(structuredSpecs!)
      const existingCount = slidesFromHtml(ctx.document.html).length
      const compiled = outlineToDeckHtml(ctx.document.html, sourceMarkdown, mode)
      if (!compiled.slides.length) {
        throw new AgentDeckToolError(
          'Could not parse any slides from the provided outline or slide specs.',
        )
      }

      const startIndex = mode === 'replace' ? 0 : existingCount
      const nextHtml = structuredSpecs
        ? applySecondsToSlideRange(
            compiled.html,
            startIndex,
            structuredSpecs.map(s => num(s?.seconds)),
          )
        : compiled.html

      const findings = checkDeck(nextHtml)
      if (hasBlockingFinding(findings)) {
        throw new AgentDeckToolError(
          `Compiled slides failed validation: ${findings
            .filter(f => f.severity === 'error')
            .map(f => f.message)
            .join('; ')}`,
        )
      }

      const title = str(args.title)
      const result = ctx.applyDeck(nextHtml, undefined, title, { baseHash })
      if (!result.ok) {
        throw new AgentDeckToolError(
          result.reason === 'stale'
            ? `${result.message}. currentHash: ${result.currentHash}`
            : result.message,
        )
      }

      const brief = str(args.brief)
      if (brief) {
        ctx.setBrief({ brief, slides: slidesFromHtml(nextHtml).length })
      }

      const totalSlides = slidesFromHtml(nextHtml).length
      return {
        mutated: result.changed,
        summary: `${mode === 'replace' ? 'Replaced deck with' : 'Appended'} ${compiled.slides.length} scaffolded slide${compiled.slides.length === 1 ? '' : 's'} (total ${totalSlides}, hash ${result.hash}).`,
        data: {
          mode,
          hash: result.hash,
          changed: result.changed,
          addedCount: compiled.slides.length,
          totalSlides,
          slides: compiled.slides.map((s, offset) => ({
            index: startIndex + offset,
            kind: s.kind,
            headline: s.headline,
            support: s.support,
            steps: s.steps,
            hasNotes: Boolean(s.notes.trim()),
          })),
          findings,
          ...(result.warning ? { textRemoved: result.warning } : {}),
        },
      }
    },
  }),

  // 3. Visual & Layout Audit Across All Slides (Read)
  defineAppFunction<DeckAgentToolContext>({
    name: 'fn_visualAndLayoutAudit',
    category: 'audit',
    risk: 'read',
    requiresApproval: false,
    replaces: ['checkDeck', 'listSlides', 'listAssets', 'getDeckContext'],
    description:
      'Audit visual layout, typography, contrast, build steps, layout variety, asset usage, and live overlap verification across all slides in one call. Returns a 0–100 health score, grouped blocking errors and warnings, and recommended deterministic fixes.',
    inputSchema: {
      type: 'object',
      properties: {
        includeCleanSlides: {
          type: 'boolean',
          description:
            'Include slides with zero findings in perSlide summary (default false: only slides needing attention).',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const includeClean = args.includeCleanSlides === true
      const html = ctx.document.html
      const slides = slidesFromHtml(html)
      const availableAssets = await resolveAvailableAssets(ctx)
      const health = evaluateDeckHealth(html, ctx.verification, { availableAssets })

      const blockingErrors = health.findings.filter(f => f.severity === 'error')
      const warnings = health.findings.filter(f => f.severity === 'warning')
      const overlapSet = new Set(health.overlapSlides)

      const findingsBySlide = new Map<number, typeof health.findings>()
      const deckLevelFindings: typeof health.findings = []
      for (const finding of health.findings) {
        if (typeof finding.slide === 'number') {
          const list = findingsBySlide.get(finding.slide) ?? []
          list.push(finding)
          findingsBySlide.set(finding.slide, list)
        } else {
          deckLevelFindings.push(finding)
        }
      }

      const perSlide = slides
        .map(slide => {
          const slideFindings = findingsBySlide.get(slide.index) ?? []
          const hasOverlap = overlapSet.has(slide.index)
          return {
            index: slide.index,
            headline: slide.headline,
            block: slide.block || 'custom',
            hasOverlap,
            findingCount: slideFindings.length + (hasOverlap ? 1 : 0),
            findings: slideFindings,
          }
        })
        .filter(item => includeClean || item.findingCount > 0)

      // Layout variety analysis
      const blockCounts: Record<string, number> = {}
      const repeatedRuns: Array<{ block: string; startIndex: number; length: number }> = []
      let runBlock = ''
      let runStart = 0
      let runLen = 0
      slides.forEach((slide, idx) => {
        const block = slide.block || 'custom'
        blockCounts[block] = (blockCounts[block] ?? 0) + 1
        if (block === runBlock) {
          runLen += 1
        } else {
          if (runLen >= 3) {
            repeatedRuns.push({ block: runBlock, startIndex: runStart, length: runLen })
          }
          runBlock = block
          runStart = idx
          runLen = 1
        }
      })
      if (runLen >= 3) {
        repeatedRuns.push({ block: runBlock, startIndex: runStart, length: runLen })
      }

      // Asset hygiene analysis
      const referenced = new Set(referencedAssetNames(html))
      const material = ctx.material ?? []
      const unusedContentAssets = material
        .filter(item => (item.role ?? 'content') === 'content' && !referenced.has(item.name))
        .map(item => item.name)
      const misplacedReferenceAssets = material
        .filter(item => item.role === 'reference' && referenced.has(item.name))
        .map(item => item.name)

      const recommendedAutoFixes: string[] = []
      if (health.hasStepGaps) recommendedAutoFixes.push('renumberSteps')
      if (health.trailingBlankCount > 0) recommendedAutoFixes.push('trimBlankSlides')
      if (health.hasContrastIssues) recommendedAutoFixes.push('highContrastLook')

      return {
        mutated: false,
        summary: `Visual/layout audit: score ${health.score}/100, ${blockingErrors.length} blocking error(s), ${warnings.length} warning(s), ${health.overlapSlides.length} overlapping slide(s).`,
        data: {
          hash: ctx.hash,
          score: health.score,
          clean:
            blockingErrors.length === 0 &&
            warnings.length === 0 &&
            ctx.verification.state === 'verified',
          verification: {
            state: ctx.verification.state,
            message: ctx.verification.message,
            overlappingSlides: health.overlapSlides,
          },
          counts: {
            slides: slides.length,
            blockingErrors: blockingErrors.length,
            warnings: warnings.length,
            trailingBlankSlides: health.trailingBlankCount,
          },
          deckLevelFindings,
          perSlide,
          layoutVariety: {
            uniqueBlocks: Object.keys(blockCounts).length,
            blockCounts,
            repeatedRuns,
          },
          assetAudit: {
            referencedAssets: [...referenced],
            unusedContentAssets,
            misplacedReferenceAssets,
          },
          recommendedAutoFixes,
        },
      }
    },
  }),

  // 4. Coordinated Theme, Typography, Layout Remix & Auto-Fix Polish (Write)
  defineAppFunction<DeckAgentToolContext>({
    name: 'fn_polishDeckThemeAndFixes',
    category: 'design',
    risk: 'write',
    requiresApproval: true,
    replaces: [
      'setLook',
      'setCustomLook',
      'setElementStep',
      'deleteSlide',
      'setSlideHtml',
      'checkDeck',
    ],
    description:
      'Apply a coordinated theme, typography, layout remix, and deterministic auto-fix polish pass in one call (stock or custom look, step-gap renumbering, trailing blank slide trimming, and slide layout remixing). Respects house-style and reference guards; returns before/after health score and new hash.',
    inputSchema: {
      type: 'object',
      properties: {
        baseHash: {
          type: 'string',
          description:
            'The deck hash from getDeckContext or fn_deckOutlineAndBriefing. Required.',
        },
        look: {
          type: 'string',
          enum: ['auto', 'ink', 'paper', 'signal', 'brief', 'gallery', 'clear'],
          description: 'Optional stock look to apply.',
        },
        ignoreReference: {
          type: 'boolean',
          description:
            'Set true only when the user explicitly asked for a stock look despite an attached design reference.',
        },
        ignoreHouseStyle: {
          type: 'boolean',
          description:
            'Set true only when the user explicitly asked for a stock look on a deck using the organisation house style.',
        },
        customLook: {
          type: 'object',
          description:
            'Optional custom look token updates merged onto the current custom look.',
          properties: {
            name: { type: 'string' },
            colors: {
              type: 'object',
              properties: {
                bg: { type: 'string' },
                ink: { type: 'string' },
                muted: { type: 'string' },
                accent: { type: 'string' },
                accent2: { type: 'string' },
                highlight: { type: 'string' },
                surface: { type: 'string' },
                line: { type: 'string' },
                inverse: { type: 'string' },
                onInverse: { type: 'string' },
                inverseMuted: { type: 'string' },
              },
            },
            fonts: {
              type: 'object',
              properties: {
                heading: { type: 'string' },
                body: { type: 'string' },
                mono: { type: 'string' },
                label: { type: 'string', enum: ['body', 'mono'] },
                headingWeight: { type: 'integer', minimum: 100, maximum: 1000 },
                bodyWeight: { type: 'integer', minimum: 100, maximum: 1000 },
                labelWeight: { type: 'integer', minimum: 100, maximum: 1000 },
                headingCase: { type: 'string', enum: ['none', 'upper'] },
                trackingDisplay: { type: 'string' },
              },
            },
            scale: {
              type: 'object',
              properties: {
                base: { type: 'number', minimum: 18, maximum: 40 },
                ratio: { type: 'number', minimum: 1.1, maximum: 1.7 },
              },
            },
            radius: { type: 'number', minimum: 0, maximum: 64 },
          },
        },
        renumberSteps: {
          type: 'boolean',
          description:
            'Deterministically renumber build steps sequentially from 1 on every slide to eliminate step gaps.',
        },
        trimBlankSlides: {
          type: 'boolean',
          description:
            'Deterministically remove trailing blank slides (always keeping at least one slide).',
        },
        highContrastLook: {
          type: 'boolean',
          description:
            'Switch to the high-contrast "clear" look (respects house-style and reference guards).',
        },
        remixSlides: {
          type: 'array',
          description:
            'Remix specific slides into a different layout block while preserving their content.',
          items: {
            type: 'object',
            properties: {
              index: { type: 'integer', minimum: 0 },
              blockId: {
                type: 'string',
                enum: [...REMIXABLE_BLOCK_IDS],
              },
            },
            required: ['index', 'blockId'],
          },
        },
      },
      required: ['baseHash'],
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const baseHash = requireBaseHash(args)
      const lookId = str(args.look)?.toLowerCase()
      const hasCustomLook = Boolean(
        args.customLook &&
          typeof args.customLook === 'object' &&
          !Array.isArray(args.customLook),
      )
      const renumberSteps = args.renumberSteps === true
      const trimBlankSlides = args.trimBlankSlides === true
      const highContrastLook = args.highContrastLook === true
      const remixSlides = Array.isArray(args.remixSlides)
        ? (args.remixSlides as Array<{ index: number; blockId: string }>)
        : []

      if (
        !lookId &&
        !hasCustomLook &&
        !renumberSteps &&
        !trimBlankSlides &&
        !highContrastLook &&
        remixSlides.length === 0
      ) {
        throw new AgentDeckToolError(
          'Specify at least one polish action: look, customLook, renumberSteps, trimBlankSlides, highContrastLook, or remixSlides.',
        )
      }

      if (lookId && !DECK_LOOKS.some(l => l.id === lookId)) {
        throw new AgentDeckToolError(
          `look must be one of ${DECK_LOOKS.map(l => l.id).join(', ')}`,
        )
      }
      if (lookId && hasCustomLook) {
        throw new AgentDeckToolError(
          'Pass either stock "look" or "customLook", not both in the same call.',
        )
      }

      const effectiveStockLook = lookId ?? (highContrastLook ? 'clear' : undefined)
      if (effectiveStockLook) {
        checkLookGuards(ctx, effectiveStockLook, args)
      }

      const currentSlides = slidesFromHtml(ctx.document.html)
      for (const item of remixSlides) {
        const idx = Number(item?.index)
        if (!Number.isInteger(idx) || idx < 0 || idx >= currentSlides.length) {
          throw new AgentDeckToolError(
            `remixSlides index ${String(item?.index)} is out of range (0..${Math.max(0, currentSlides.length - 1)}).`,
          )
        }
        if (!REMIXABLE_BLOCK_IDS.includes(item.blockId as RemixableBlockId)) {
          throw new AgentDeckToolError(
            `remixSlides blockId "${String(item.blockId)}" must be one of ${REMIXABLE_BLOCK_IDS.join(', ')}.`,
          )
        }
      }

      const availableAssets = await resolveAvailableAssets(ctx)
      const beforeHealth = evaluateDeckHealth(ctx.document.html, ctx.verification, {
        availableAssets,
      })

      const appliedActions: string[] = []
      const notes: string[] = []
      let nextHtml = ctx.document.html
      let customSpecResult = null as ReturnType<typeof customLook> | null

      if (hasCustomLook) {
        const cl = obj(args.customLook)
        const base: CustomLookInput = customLookFromHtml(nextHtml) ?? {}
        const colors = obj(cl.colors)
        const fonts = obj(cl.fonts)
        const scale = obj(cl.scale)
        const face = (value: unknown, fallback: string | undefined, role: string) => {
          const name = str(value)
          if (!name) return fallback
          const carried = (base.faces ?? []).some(
            f => f.family.toLowerCase() === name.toLowerCase(),
          )
          if (carried || bundledFamily(name)) {
            return carried ? name : bundledFamily(name)!.family
          }
          const near = nearestBundled(name, role === 'mono' ? 'JetBrains Mono' : 'Inter')
          if (near.note) notes.push(near.note)
          return near.family
        }
        try {
          customSpecResult = customLook({
            ...base,
            name: str(cl.name) ?? base.name,
            colors: {
              ...base.colors,
              ...Object.fromEntries(
                [
                  'bg',
                  'ink',
                  'muted',
                  'accent',
                  'accent2',
                  'highlight',
                  'surface',
                  'line',
                  'inverse',
                  'onInverse',
                  'inverseMuted',
                ]
                  .filter(k => str(colors[k]))
                  .map(k => [k, str(colors[k])]),
              ),
            },
            type: {
              ...base.type,
              heading: face(fonts.heading, base.type?.heading, 'heading'),
              body: face(fonts.body, base.type?.body, 'body'),
              mono: face(fonts.mono, base.type?.mono, 'mono'),
              ...(str(fonts.label)
                ? { label: fonts.label === 'mono' ? 'mono' : 'body' }
                : {}),
              ...(num(fonts.headingWeight)
                ? { headingWeight: num(fonts.headingWeight) }
                : {}),
              ...(num(fonts.bodyWeight) ? { bodyWeight: num(fonts.bodyWeight) } : {}),
              ...(num(fonts.labelWeight) ? { labelWeight: num(fonts.labelWeight) } : {}),
              ...(str(fonts.headingCase)
                ? { headingCase: fonts.headingCase === 'upper' ? 'upper' : 'none' }
                : {}),
              ...(str(fonts.trackingDisplay)
                ? { trackingDisplay: str(fonts.trackingDisplay) }
                : {}),
              ...(num(scale.base) ? { base: num(scale.base) } : {}),
              ...(num(scale.ratio) ? { ratio: num(scale.ratio) } : {}),
            },
            ...(num(cl.radius) !== undefined ? { radius: num(cl.radius) } : {}),
          })
          notes.push(...fontNotes(customSpecResult), ...contrastNotes(customSpecResult))
        } catch (err) {
          if (err instanceof CustomLookError) {
            throw new AgentDeckToolError(err.message)
          }
          throw err
        }
      }

      const hasHtmlTransforms =
        renumberSteps || trimBlankSlides || remixSlides.length > 0

      // Route pure look changes through their dedicated callbacks; combined passes land atomically via applyDeck.
      let editResult
      if (effectiveStockLook && !hasHtmlTransforms) {
        editResult = ctx.setLook(effectiveStockLook, { baseHash })
        nextHtml = withDeckLook(nextHtml, effectiveStockLook)
        appliedActions.push(`setLook:${effectiveStockLook}`)
      } else if (customSpecResult && !hasHtmlTransforms) {
        editResult = ctx.setCustomLook(customSpecResult, { baseHash })
        nextHtml = withCustomLook(nextHtml, customSpecResult)
        appliedActions.push(`setCustomLook:${customSpecResult.name}`)
      } else {
        if (effectiveStockLook) {
          nextHtml =
            effectiveStockLook === 'clear' && highContrastLook && !lookId
              ? autoFixHighContrastLook(nextHtml)
              : withDeckLook(nextHtml, effectiveStockLook)
          appliedActions.push(`setLook:${effectiveStockLook}`)
        }
        if (customSpecResult) {
          nextHtml = withCustomLook(nextHtml, customSpecResult)
          appliedActions.push(`setCustomLook:${customSpecResult.name}`)
        }
        if (remixSlides.length > 0) {
          for (const item of remixSlides) {
            const remixed = remixSlideLayout(
              nextHtml,
              item.index,
              item.blockId as RemixableBlockId,
            )
            if (remixed !== nextHtml) {
              nextHtml = remixed
              appliedActions.push(`remixSlide:${item.index}->${item.blockId}`)
            }
          }
        }
        if (renumberSteps) {
          const fixed = autoFixRenumberSteps(nextHtml)
          if (fixed !== nextHtml) {
            nextHtml = fixed
            appliedActions.push('renumberSteps')
          }
        }
        if (trimBlankSlides) {
          const trimmed = autoFixTrimBlankSlides(nextHtml)
          if (trimmed !== nextHtml) {
            nextHtml = trimmed
            appliedActions.push('trimBlankSlides')
          }
        }
        editResult = ctx.applyDeck(nextHtml, undefined, undefined, { baseHash })
      }

      if (!editResult.ok) {
        throw new AgentDeckToolError(
          editResult.reason === 'stale'
            ? `${editResult.message}. currentHash: ${editResult.currentHash}`
            : editResult.message,
        )
      }

      const afterHealth = evaluateDeckHealth(nextHtml, ctx.verification, {
        availableAssets,
      })

      return {
        mutated: editResult.changed,
        summary: `Applied ${appliedActions.length ? appliedActions.join(', ') : 'no-op polish'} (health ${beforeHealth.score} → ${afterHealth.score}/100, hash ${editResult.hash}).`,
        data: {
          hash: editResult.hash,
          changed: editResult.changed,
          appliedActions,
          beforeScore: beforeHealth.score,
          afterScore: afterHealth.score,
          remainingFindings: afterHealth.findings,
          ...(notes.length ? { notes } : {}),
        },
      }
    },
  }),

  // 5. Speaker Notes & Pacing Review (Read)
  defineAppFunction<DeckAgentToolContext>({
    name: 'fn_speakerNotesAndPacingReview',
    category: 'narrative',
    risk: 'read',
    requiresApproval: false,
    replaces: ['listSlides', 'getDeckContext'],
    description:
      'Review speaker notes coverage, narrative arc, on-slide word density, build press counts, and estimated speaking duration across the entire deck. Optionally compares total pacing against targetMinutes and flags slides missing notes or headlines.',
    inputSchema: {
      type: 'object',
      properties: {
        wordsPerMinute: {
          type: 'number',
          minimum: 80,
          maximum: 220,
          description:
            'Speaking pace in words per minute used to estimate delivery time (default 135).',
        },
        targetMinutes: {
          type: 'number',
          minimum: 1,
          description:
            'Optional target presentation length in minutes to compare total pacing against.',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const rawWpm = num(args.wordsPerMinute) ?? 135
      const wpm = Math.max(80, Math.min(220, Math.round(rawWpm)))
      const targetMinutes = num(args.targetMinutes)
      if (targetMinutes !== undefined && targetMinutes <= 0) {
        throw new AgentDeckToolError('targetMinutes must be a positive number.')
      }

      const slides = slidesFromHtml(ctx.document.html)
      const onSlideWordCounts = slideOnScreenWords(ctx.document.html)

      let totalSteps = 0
      let totalEstimatedSeconds = 0
      let configuredVideoSeconds = 0
      let slidesWithNotes = 0

      const slidePacing = slides.map((slide, idx) => {
        const onSlideWords = onSlideWordCounts[idx] ?? countWords(`${slide.headline} ${slide.support}`)
        const notesWords = countWords(slide.notes)
        const hasNotes = notesWords > 0
        if (hasNotes) slidesWithNotes += 1
        totalSteps += slide.steps
        configuredVideoSeconds += slide.seconds

        const estimatedSpeakSeconds = hasNotes
          ? Math.max(15, Math.round((notesWords / wpm) * 60) + slide.steps * 4)
          : Math.max(15, Math.round((Math.max(onSlideWords, 20) / wpm) * 60) + slide.steps * 6)
        totalEstimatedSeconds += estimatedSpeakSeconds

        const flags: string[] = []
        if (!hasNotes) flags.push('missing-notes')
        if (!slide.headline.trim()) flags.push('missing-headline')
        if (onSlideWords > 55) flags.push('dense-slide')
        if (notesWords > 250) flags.push('long-notes')

        return {
          index: slide.index,
          headline: slide.headline,
          support: slide.support,
          block: slide.block || 'custom',
          steps: slide.steps,
          configuredSeconds: slide.seconds,
          onSlideWords,
          notesWords,
          hasNotes,
          estimatedSpeakSeconds,
          flags,
        }
      })

      const notesCoveragePercent = slides.length
        ? Math.round((slidesWithNotes / slides.length) * 100)
        : 0
      const formattedDuration = formatDuration(totalEstimatedSeconds * 1000)

      let budgetAssessment: Record<string, unknown> | undefined
      if (targetMinutes !== undefined) {
        const targetSeconds = Math.round(targetMinutes * 60)
        const deltaSeconds = totalEstimatedSeconds - targetSeconds
        const tolerance = Math.max(30, Math.round(targetSeconds * 0.1))
        const status =
          Math.abs(deltaSeconds) <= tolerance
            ? 'on-target'
            : deltaSeconds > 0
              ? 'over-budget'
              : 'under-budget'
        budgetAssessment = {
          targetMinutes,
          targetSeconds,
          deltaSeconds,
          status,
        }
      }

      const attentionSlides = slidePacing.filter(s => s.flags.length > 0)

      return {
        mutated: false,
        summary: `Narrative review: ${slides.length} slide(s), ${notesCoveragePercent}% notes coverage, est. ${formattedDuration} at ${wpm} wpm (${attentionSlides.length} slide(s) flagged).`,
        data: {
          hash: ctx.hash,
          wordsPerMinute: wpm,
          slideCount: slides.length,
          totalSteps,
          totalPresses: slides.length + totalSteps,
          slidesWithNotes,
          notesCoveragePercent,
          totalEstimatedSeconds,
          formattedDuration,
          configuredVideoSeconds,
          ...(budgetAssessment ? { budgetAssessment } : {}),
          attentionCount: attentionSlides.length,
          slides: slidePacing,
        },
      }
    },
  }),

  // 6. Batch Update Speaker Notes, Headlines & Timing (Write)
  defineAppFunction<DeckAgentToolContext>({
    name: 'fn_batchUpdateSpeakerNotes',
    category: 'narrative',
    risk: 'write',
    requiresApproval: true,
    replaces: ['updateSlide'],
    description:
      'Update speaker notes, headlines, support lines, or hold seconds across multiple slides in one call instead of repeating updateSlide per slide. Requires baseHash from getDeckContext, validates every slide index before writing, and returns the final hash and updated pacing.',
    inputSchema: {
      type: 'object',
      properties: {
        baseHash: {
          type: 'string',
          description:
            'The deck hash from getDeckContext or fn_speakerNotesAndPacingReview. Required.',
        },
        updates: {
          type: 'array',
          minItems: 1,
          description: 'List of slide patches to apply in order.',
          items: {
            type: 'object',
            properties: {
              index: {
                type: 'integer',
                minimum: 0,
                description: 'Zero-based slide index.',
              },
              headline: { type: 'string' },
              support: { type: 'string' },
              notes: {
                type: 'string',
                description: 'Speaker notes (presenter view only).',
              },
              seconds: {
                type: 'number',
                minimum: 1,
                description: 'Hold duration in seconds for timed video export.',
              },
            },
            required: ['index'],
          },
        },
      },
      required: ['baseHash', 'updates'],
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const baseHash = requireBaseHash(args)
      if (!Array.isArray(args.updates) || args.updates.length === 0) {
        throw new AgentDeckToolError('updates must be a non-empty array of slide patches.')
      }

      const slideCount = slidesFromHtml(ctx.document.html).length
      const validated: Array<{ index: number; patch: SlideEdit }> = []

      for (const raw of args.updates) {
        const entry = obj(raw)
        const index = Number(entry.index)
        if (!Number.isInteger(index) || index < 0 || index >= slideCount) {
          throw new AgentDeckToolError(
            `Slide index ${String(entry.index)} is out of range — deck has ${slideCount} slide(s).`,
          )
        }
        const patch: SlideEdit = {}
        if (typeof entry.headline === 'string') patch.headline = entry.headline
        if (typeof entry.support === 'string') patch.support = entry.support
        if (typeof entry.notes === 'string') patch.notes = entry.notes
        if (entry.seconds !== undefined) {
          const seconds = Number(entry.seconds)
          if (!Number.isFinite(seconds) || seconds <= 0) {
            throw new AgentDeckToolError(
              `Slide ${index}: seconds must be a positive number.`,
            )
          }
          patch.seconds = seconds
        }
        if (Object.keys(patch).length === 0) {
          throw new AgentDeckToolError(
            `Slide ${index}: provide at least one of headline, support, notes, or seconds.`,
          )
        }
        validated.push({ index, patch })
      }

      let currentHash = baseHash
      let anyChanged = false
      const applied: Array<{ index: number; fields: string[] }> = []

      for (const item of validated) {
        const result = ctx.slideOps.update(item.index, item.patch, {
          baseHash: currentHash,
        })
        if (!result.ok) {
          throw new AgentDeckToolError(
            result.reason === 'stale'
              ? `${result.message}. currentHash: ${result.currentHash}`
              : result.message,
          )
        }
        currentHash = result.hash
        if (result.changed) anyChanged = true
        applied.push({ index: item.index, fields: Object.keys(item.patch) })
      }

      return {
        mutated: anyChanged,
        summary: `Updated ${applied.length} slide${applied.length === 1 ? '' : 's'} in one batch (hash ${currentHash}).`,
        data: {
          hash: currentHash,
          changed: anyChanged,
          updatedCount: applied.length,
          updates: applied,
        },
      }
    },
  }),

  // 7. Export & Presentation Readiness Gate (Read)
  defineAppFunction<DeckAgentToolContext>({
    name: 'fn_exportReadinessCheck',
    category: 'export',
    risk: 'read',
    requiresApproval: false,
    replaces: ['checkDeck', 'getDeckContext', 'listSlides', 'listAssets'],
    description:
      'Run a pre-flight export and presentation readiness gate for pdf, pptx, images, video, or all formats in one call. Evaluates live layout verification, blocking lint errors, missing or remote assets, video codec caveats, and speaker notes coverage before calling exportDeck.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['pdf', 'pptx', 'images', 'video', 'all'],
          description: 'Target export format to evaluate (default "all").',
        },
      },
      additionalProperties: false,
    },
    run: async (ctx, args) => {
      const target =
        str(args.target) && ['pdf', 'pptx', 'images', 'video', 'all'].includes(str(args.target)!)
          ? (str(args.target) as 'pdf' | 'pptx' | 'images' | 'video' | 'all')
          : 'all'

      const html = ctx.document.html
      const slides = slidesFromHtml(html)
      const availableAssets = await resolveAvailableAssets(ctx)
      const findings = checkDeck(html, { availableAssets })
      const blockingFindings = findings.filter(f => f.severity === 'error')
      const warnings = findings.filter(f => f.severity === 'warning')

      const blockers: string[] = []
      if (!ctx.documentPath) blockers.push('No deck package is currently open.')
      if (ctx.exporting) blockers.push('Another export is already in flight.')
      if (slides.length === 0) blockers.push('Deck has zero slides.')
      if (ctx.verification.state === 'failed') {
        blockers.push(
          `Layout verification failed with overlapping text on slide(s): ${ctx.verification.failedSlides
            .map(i => i + 1)
            .join(', ')}.`,
        )
      } else if (ctx.verification.state === 'checking') {
        blockers.push(
          'Layout verification is still checking slides in a visible frame; exportDeck refuses unverified layouts.',
        )
      }
      for (const err of blockingFindings) {
        blockers.push(`${err.code}: ${err.message}`)
      }

      const slidesWithNotes = slides.filter(s => s.notes.trim().length > 0).length
      const totalVideoSeconds = slides.reduce((acc, s) => acc + s.seconds, 0)
      const hasVideoTag = /<video\b/i.test(html)
      const videoFormatWarnings = warnings.filter(w => w.code === 'video-format')
      const videoEmptyWarnings = warnings.filter(w => w.code === 'video-empty')
      const networkWarnings = warnings.filter(w =>
        ['remote-image', 'remote-video', 'remote-font', 'remote-script'].includes(w.code),
      )
      const missingAssetWarnings = warnings.filter(w => w.code === 'missing-asset')

      const formatReports: Record<string, Record<string, unknown>> = {}
      const include = (fmt: 'pdf' | 'pptx' | 'images' | 'video') =>
        target === 'all' || target === fmt

      if (include('pdf')) {
        formatReports.pdf = {
          ready: blockers.length === 0,
          pageCount: slides.length,
          notesAppendixAvailable: slidesWithNotes > 0,
          slidesWithNotes,
          caveats: [
            ...(hasVideoTag
              ? ['Embedded videos print as their poster frame or a labelled panel in PDF.']
              : []),
            ...missingAssetWarnings.map(w => w.message),
          ],
        }
      }
      if (include('pptx')) {
        formatReports.pptx = {
          ready: blockers.length === 0,
          slideCount: slides.length,
          speakerNotesAttached: slidesWithNotes,
          caveats: [
            ...videoFormatWarnings.map(w => w.message),
            ...videoEmptyWarnings.map(w => w.message),
          ],
        }
      }
      if (include('images')) {
        formatReports.images = {
          ready: blockers.length === 0,
          pngCount: slides.length,
          caveats: [
            ...missingAssetWarnings.map(w => w.message),
            ...networkWarnings.map(w => w.message),
          ],
        }
      }
      if (include('video')) {
        formatReports.video = {
          ready: blockers.length === 0,
          slideCount: slides.length,
          estimatedDurationSeconds: totalVideoSeconds,
          formattedDuration: formatDuration(totalVideoSeconds * 1000),
          caveats: [
            ...videoEmptyWarnings.map(w => w.message),
            ...networkWarnings.map(w => w.message),
          ],
        }
      }

      const readyToExport = blockers.length === 0
      const readyToPresent = blockingFindings.length === 0 && slides.length > 0

      return {
        mutated: false,
        summary: readyToExport
          ? `Export readiness PASSED for ${target} (${slides.length} slide(s), layout verified, ${warnings.length} non-blocking warning(s)).`
          : `Export readiness BLOCKED for ${target}: ${blockers.length} blocker(s) found.`,
        data: {
          target,
          hash: ctx.hash,
          readyToExport,
          readyToPresent,
          verification: {
            state: ctx.verification.state,
            message: ctx.verification.message,
            overlappingSlides: ctx.verification.failedSlides,
            checkingSlides: ctx.verification.checkingSlides,
          },
          blockers,
          warningCount: warnings.length,
          warnings,
          formatReports,
          recommendedNextAction: readyToExport
            ? target === 'all'
              ? 'Call saveDeck, then exportDeck with kind: "pdf" | "pptx" | "images" | "video".'
              : `Call saveDeck, then exportDeck with { kind: "${target}" }.`
            : 'Resolve all listed blockers (fix overlapping slides or checkDeck errors) before calling exportDeck.',
        },
      }
    },
  }),
]
