// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createDefaultDeckDocument } from '../lib/deckDocument'
import { withDeckLook } from '../lib/deckLooks'
import { customLook, withCustomLook } from '../lib/customLook'
import {
  addSlide,
  deleteSlide,
  duplicateSlide,
  moveSlide,
  replaceSlideHtml,
  setSlideContent,
  slidesFromHtml,
  type SlideEdit,
} from '../lib/slides'
import { SLIDE_BLOCKS } from '../lib/blocks'
import type { DeckEditResult } from '../lib/deckDoor'
import type { DeckVerification } from '../lib/deckVerification'
import type { MaterialItem } from '../lib/material'
import { PURESLIDES_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  EXPOSED_TOOL_NAMES,
  PURESLIDES_AGENT_TOOLS,
  PURESLIDES_ALL_ATOMIC_TOOL_NAMES,
  PURESLIDES_CORE_TOOL_NAMES,
  PURESLIDES_EXTENDED_TOOL_NAMES,
  PURESLIDES_FUNCTION_NAMES,
  type DeckAgentToolContext,
  type EditOptions,
} from './catalog'
import {
  buildPureSlidesHandlers,
  PURESLIDES_OPERATIONS_REGISTRY,
} from './operationsRegistry'

const invoke = (shortName: string, args: Record<string, unknown> = {}) => ({
  toolCallId: `tc_${shortName}`,
  shortName,
  arguments: args,
})

function makeRichDeckHtml(): string {
  const base = createDefaultDeckDocument('Q4 Platform Review').html
  const doc = new DOMParser().parseFromString(base, 'text/html')
  const root = doc.querySelector('#deck')!
  root.innerHTML = `
    <div data-slide data-block="title" data-seconds="8" style="position: absolute; inset: 0; padding: 80px 96px">
      <h1>Platform Architecture Q4</h1>
      <p>How PureSlides unifies HTML authoring, live presenting, and offline export.</p>
      <div data-notes hidden style="display: none">Welcome everyone to the Q4 platform architecture review. Today we cover our three core milestones and measurable latency improvements.</div>
    </div>
    <div data-slide data-block="points" data-seconds="10" style="position: absolute; inset: 0; padding: 80px 96px">
      <h1>Key Engineering Wins</h1>
      <p>Measured across desktop and cloud decks.</p>
      <div data-step="1">Single HTML document model</div>
      <div data-step="3">Deterministic layout verification</div>
      <img src="assets/hero.png" alt="Architecture diagram" />
      <div data-notes hidden style="display: none">Walk through each step slowly so the audience sees how one document drives every surface.</div>
    </div>
    <div data-slide data-block="points" data-seconds="6" style="position: absolute; inset: 0; padding: 80px 96px">
      <h1>Adoption Metrics</h1>
      <p>Strong quarterly growth across teams.</p>
      <video data-video src="assets/demo.webm" playsinline></video>
    </div>
    <div data-slide data-block="points" data-seconds="6" style="position: absolute; inset: 0; padding: 80px 96px">
      <h1>Next Quarter Priorities</h1>
      <p>Focus on reliability and collaboration.</p>
      <img src="assets/brand-ref.png" alt="Accidental reference placement" />
    </div>
    <div data-slide data-block="blank" style="position: absolute; inset: 0; padding: 80px 96px"></div>
  `
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
}

interface FixtureOptions {
  html?: string
  verification?: DeckVerification
  material?: MaterialItem[]
  exporting?: boolean
  houseStyle?: DeckAgentToolContext['houseStyle']
}

function makeFixture(options: FixtureOptions = {}) {
  let html = options.html ?? makeRichDeckHtml()
  let title = 'Q4 Platform Review'
  let version = 1
  let hash = `h${version}`
  let brief = 'Present Q4 architecture wins and roadmap.'
  let slideCount = 5
  const verification: DeckVerification = options.verification ?? {
    state: 'verified',
    message: 'Layout checked',
    failedSlides: [],
    checkingSlides: [],
  }
  const material: MaterialItem[] = options.material ?? [
    {
      name: 'hero.png',
      reference: 'assets/hero.png',
      role: 'content',
      description: 'Architecture diagram',
    } as MaterialItem,
    {
      name: 'unused-chart.png',
      reference: 'assets/unused-chart.png',
      role: 'content',
      description: '',
    } as MaterialItem,
    {
      name: 'brand-ref.png',
      reference: 'assets/brand-ref.png',
      role: 'reference',
      description: 'Company website hero screenshot',
    } as MaterialItem,
  ]

  const commit = (
    nextHtml: string,
    editOptions?: EditOptions,
    nextTitle?: string,
  ): DeckEditResult => {
    if (editOptions?.baseHash && editOptions.baseHash !== hash) {
      return {
        ok: false,
        reason: 'stale',
        message: 'The deck changed since your last read',
        currentHash: hash,
      }
    }
    const changed = nextHtml !== html || (nextTitle !== undefined && nextTitle !== title)
    html = nextHtml
    if (nextTitle !== undefined) title = nextTitle
    if (changed) {
      version += 1
      hash = `h${version}`
    }
    return {
      ok: true,
      hash,
      changed,
      rebased: false,
      warning: null,
      snapshot: null,
    }
  }

  const restoreRevision = vi.fn(async (file: string) => ({
    ok: true as const,
    hash: `restored_${file}`,
    changed: true,
    rebased: false,
    warning: null,
    snapshot: null,
  }))

  const ctx: DeckAgentToolContext = {
    get document() {
      return { title, html }
    },
    get hash() {
      return hash
    },
    verification,
    documentPath: '/Work/Q4Review.deck',
    get slides() {
      return slidesFromHtml(html)
    },
    material,
    lastExportPath: null,
    exporting: options.exporting ?? false,
    get ui() {
      return {
        view: 'slides',
        selectedSlide: 1,
        slideSelection: [1],
        elementSelection: [],
        brief,
        slideCount,
      }
    },
    summarize: () => ({ title, slideCount: slidesFromHtml(html).length }),
    applyDeck: (nextHtml, _patch, nextTitle, editOpts) =>
      commit(nextHtml, editOpts, nextTitle),
    createAndOpen: vi.fn(async () => '/Work/New.deck'),
    listAssets: vi.fn(async () =>
      material.map(m => ({ name: m.name, bytes: 1024 })),
    ),
    addAsset: vi.fn(async (_src: string, name?: string) => `assets/${name ?? 'file.png'}`),
    describeAsset: vi.fn(),
    setAssetRole: vi.fn(),
    setBrief: vi.fn(patch => {
      if (patch.brief !== undefined) brief = patch.brief
      if (patch.slides !== undefined) slideCount = patch.slides
    }),
    setLook: vi.fn((look: string, editOpts?: EditOptions) =>
      commit(withDeckLook(html, look), editOpts),
    ),
    setCustomLook: vi.fn((spec, editOpts?: EditOptions) =>
      commit(withCustomLook(html, spec), editOpts),
    ),
    files: {
      readText: vi.fn(async () => ''),
      readBase64: vi.fn(async () => ({ base64: '', mimeType: 'image/png' })),
      writeText: vi.fn(async () => {}),
      writeBase64: vi.fn(async () => {}),
      ensureFolder: vi.fn(async () => {}),
    },
    brands: null,
    houseStyle: options.houseStyle ?? null,
    savedBrandPath: null,
    exportSlideImages: vi.fn(async () => []),
    writePackageFile: vi.fn(async rel => rel),
    generateImage: null,
    renderSlide: vi.fn(async () => ({
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      width: 1280,
      height: 720,
    })),
    draftDeck: vi.fn(async () => ({ id: 'req-1', baseHash: hash, status: 'prepared' })),
    cancelDrawerRequest: vi.fn(async args => ({ cancelled: true, ...args })),
    getDrawerRequest: vi.fn(async () => ({ id: 'req-1' })),
    commitDrawerRequest: vi.fn(async args => ({ committed: true, ...args })),
    slideOps: {
      add: (slideHtml, atIndex, editOpts) =>
        commit(addSlide(html, slideHtml, atIndex), editOpts),
      update: (index, patch: SlideEdit, editOpts) =>
        commit(setSlideContent(html, index, patch), editOpts),
      setHtml: (index, slideHtml, editOpts) =>
        commit(replaceSlideHtml(html, index, slideHtml), editOpts),
      move: (from, to, editOpts) => commit(moveSlide(html, from, to), editOpts),
      duplicate: (index, editOpts) =>
        commit(duplicateSlide(html, index), editOpts),
      remove: (index, editOpts) => commit(deleteSlide(html, index), editOpts),
    },
    setElement: vi.fn(() => ({ ok: true as const, hash, changed: true, rebased: false, warning: null, snapshot: null })),
    setElementText: vi.fn(() => ({ ok: true as const, hash, changed: true, rebased: false, warning: null, snapshot: null })),
    blocks: SLIDE_BLOCKS.map(({ id, label, description, steps, media }) => ({
      id,
      label,
      description,
      steps,
      ...(media ? { media } : {}),
    })),
    addBlock: vi.fn(() => ({ ok: true as const, hash, changed: true, rebased: false, warning: null, snapshot: null })),
    deleteElement: vi.fn(() => ({ ok: true as const, hash, changed: true, rebased: false, warning: null, snapshot: null })),
    setElementStep: vi.fn(() => ({ ok: true as const, hash, changed: true, rebased: false, warning: null, snapshot: null })),
    listRevisions: () => [
      {
        file: '2026-11-20T10-00-00-000Z-agent.html',
        at: '2026-11-20T10:00:00.000Z',
        reason: 'agent',
        hash: 'h0',
        byteSize: 2048,
        textChars: 420,
      },
    ],
    restoreRevision,
    setSelection: vi.fn(),
    present: vi.fn(),
    saveDeck: vi.fn(async () => '/Work/Q4Review.deck'),
    runExport: vi.fn(async kind => `/Work/Q4Review.${kind}`),
    stopExport: vi.fn(() => true),
  }

  const handlers = buildPureSlidesHandlers(() => ctx)
  return { ctx, handlers, getHtml: () => html, getHash: () => hash, restoreRevision }
}

describe('PureSlides Operations Registry (Functions + Core + Extended Escape Hatch)', () => {
  it('syncs plugin.json 1:1 with PURESLIDES_OPERATIONS_REGISTRY.manifestTools and meets check-manifests invariants', async () => {
    const manifest = (
      await import('../../plugin.json', { with: { type: 'json' } })
    ).default as {
      app: {
        agents: {
          tools: Array<{
            name: string
            risk?: string
            requiresApproval?: boolean
            description?: string
          }>
        }
      }
    }

    expect(manifest.app.agents.tools).toEqual([
      ...PURESLIDES_OPERATIONS_REGISTRY.manifestTools,
    ])
    expect([...EXPOSED_TOOL_NAMES]).toEqual([
      ...PURESLIDES_OPERATIONS_REGISTRY.exposedToolNames,
    ])
    expect([...PURESLIDES_AGENT_TOOLS]).toEqual([...EXPOSED_TOOL_NAMES])
    expect([...PURESLIDES_EXTENDED_TOOL_NAMES].sort()).toEqual(
      [...PURESLIDES_OPERATIONS_REGISTRY.extendedToolNames].sort(),
    )
    expect([...PURESLIDES_ALL_ATOMIC_TOOL_NAMES].sort()).toEqual(
      [...PURESLIDES_OPERATIONS_REGISTRY.allAtomicToolNames].sort(),
    )

    const summary = PURESLIDES_OPERATIONS_REGISTRY.auditSummary()
    expect(summary.functions).toBe(PURESLIDES_FUNCTION_NAMES.length)
    expect(summary.functions).toBe(7)
    expect(summary.coreTools).toBe(PURESLIDES_CORE_TOOL_NAMES.length)
    expect(summary.coreTools).toBe(9)
    expect(summary.extendedTools).toBe(PURESLIDES_EXTENDED_TOOL_NAMES.length)
    expect(summary.extendedTools).toBe(34)
    expect(summary.metaTools).toBe(3)
    expect(summary.totalExposed).toBe(19)
    expect(summary.totalAtomicTools).toBe(43)
    expect(summary.schemaReductionPercent).toBeGreaterThanOrEqual(55)
    expect(PURESLIDES_ATOMIC_TOOL_SCHEMAS.length).toBe(43)

    // Verify manifest-level check-manifests invariants on every exposed tool
    const releaseVerbs = new Set([
      'send',
      'merge',
      'publish',
      'deposit',
      'deploy',
      'post',
    ])
    for (const tool of manifest.app.agents.tools) {
      expect(['read', 'write', 'destructive', 'external', 'release']).toContain(
        tool.risk,
      )
      expect(typeof tool.requiresApproval).toBe('boolean')
      expect((tool.description ?? '').trim().length).toBeGreaterThanOrEqual(80)
      const firstNameWord = tool.name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[^A-Za-z]+/)
        .find(Boolean)
        ?.toLowerCase()
      const firstDescWord = (tool.description ?? '')
        .trim()
        .split(/[^A-Za-z]+/)
        .find(Boolean)
        ?.toLowerCase()
      if (tool.risk !== 'release') {
        expect(releaseVerbs.has(firstNameWord ?? '')).toBe(false)
        expect(releaseVerbs.has(firstDescWord ?? '')).toBe(false)
      }
    }
  })

  it('executes fn_deckOutlineAndBriefing, fn_visualAndLayoutAudit, fn_speakerNotesAndPacingReview, and fn_exportReadinessCheck', async () => {
    const { handlers } = makeFixture()

    // 1. fn_deckOutlineAndBriefing
    const briefing = JSON.parse(
      (
        await handlers.fn_deckOutlineAndBriefing(
          invoke('fn_deckOutlineAndBriefing', { includeNotesPreview: true }),
        )
      ).content,
    )
    expect(briefing.ok).toBe(true)
    expect(briefing.opClass).toBe('function')
    expect(briefing.data.hash).toBe('h1')
    expect(briefing.data.slideCount).toBe(5)
    expect(briefing.data.slidesWithNotes).toBe(2)
    expect(briefing.data.aim).toEqual({ scope: 'slide', slideIndex: 1 })
    expect(briefing.data.assets.byRole).toEqual({
      content: 2,
      reference: 1,
      logo: 0,
    })
    expect(briefing.data.assets.undescribedAssets).toEqual(['unused-chart.png'])
    expect(briefing.data.health.hasStepGaps).toBe(true)
    expect(briefing.data.health.trailingBlankCount).toBe(1)
    expect(briefing.data.revisionsCount).toBe(1)

    // 2. fn_visualAndLayoutAudit
    const audit = JSON.parse(
      (
        await handlers.fn_visualAndLayoutAudit(
          invoke('fn_visualAndLayoutAudit', {}),
        )
      ).content,
    )
    expect(audit.ok).toBe(true)
    expect(audit.data.counts.slides).toBe(5)
    expect(audit.data.counts.trailingBlankSlides).toBe(1)
    expect(audit.data.layoutVariety.repeatedRuns).toEqual([
      { block: 'points', startIndex: 1, length: 3 },
    ])
    expect(audit.data.assetAudit.unusedContentAssets).toEqual([
      'unused-chart.png',
    ])
    expect(audit.data.assetAudit.misplacedReferenceAssets).toEqual([
      'brand-ref.png',
    ])
    expect(audit.data.recommendedAutoFixes).toContain('renumberSteps')
    expect(audit.data.recommendedAutoFixes).toContain('trimBlankSlides')

    // 3. fn_speakerNotesAndPacingReview
    const pacing = JSON.parse(
      (
        await handlers.fn_speakerNotesAndPacingReview(
          invoke('fn_speakerNotesAndPacingReview', {
            wordsPerMinute: 140,
            targetMinutes: 10,
          }),
        )
      ).content,
    )
    expect(pacing.ok).toBe(true)
    expect(pacing.data.slideCount).toBe(5)
    expect(pacing.data.slidesWithNotes).toBe(2)
    expect(pacing.data.notesCoveragePercent).toBe(40)
    expect(pacing.data.budgetAssessment.status).toBe('under-budget')
    expect(pacing.data.slides[4].flags).toContain('missing-notes')
    expect(pacing.data.slides[4].flags).toContain('missing-headline')

    // 4. fn_exportReadinessCheck (verified deck with webm video caveat)
    const readiness = JSON.parse(
      (
        await handlers.fn_exportReadinessCheck(
          invoke('fn_exportReadinessCheck', { target: 'all' }),
        )
      ).content,
    )
    expect(readiness.ok).toBe(true)
    expect(readiness.data.readyToExport).toBe(true)
    expect(readiness.data.formatReports.pdf.notesAppendixAvailable).toBe(true)
    expect(readiness.data.formatReports.pdf.caveats.join(' ')).toMatch(/poster/i)
    expect(readiness.data.formatReports.pptx.caveats.join(' ')).toMatch(/demo\.webm/i)

    // Blocked readiness when layout verification failed
    const failed = makeFixture({
      verification: {
        state: 'failed',
        message: 'Slide 2 has overlapping text',
        failedSlides: [1],
        checkingSlides: [],
      },
    })
    const blocked = JSON.parse(
      (
        await failed.handlers.fn_exportReadinessCheck(
          invoke('fn_exportReadinessCheck', { target: 'pdf' }),
        )
      ).content,
    )
    expect(blocked.data.readyToExport).toBe(false)
    expect(blocked.data.blockers.join(' ')).toMatch(/overlapping text/i)
  })

  it('executes mutating composite functions: fn_scaffoldSlidesFromOutline, fn_polishDeckThemeAndFixes, and fn_batchUpdateSpeakerNotes', async () => {
    // 1. fn_scaffoldSlidesFromOutline (Markdown append + structured replace)
    const f1 = makeFixture({ material: [] })
    const appended = JSON.parse(
      (
        await f1.handlers.fn_scaffoldSlidesFromOutline(
          invoke('fn_scaffoldSlidesFromOutline', {
            baseHash: f1.getHash(),
            mode: 'append',
            markdown: `# Launch Milestones\nOn track for Q1.\n- API frozen [step]\n- Beta live [step]\nNotes: Highlight the beta milestone.`,
          }),
        )
      ).content,
    )
    expect(appended.ok).toBe(true)
    expect(appended.data.addedCount).toBe(1)
    expect(appended.data.totalSlides).toBe(6)
    expect(appended.data.slides[0].headline).toBe('Launch Milestones')
    expect(appended.data.slides[0].steps).toBe(2)

    const replaced = JSON.parse(
      (
        await f1.handlers.fn_scaffoldSlidesFromOutline(
          invoke('fn_scaffoldSlidesFromOutline', {
            baseHash: appended.data.hash,
            mode: 'replace',
            title: 'Executive Summary',
            brief: 'Concise 2-slide exec summary.',
            slides: [
              {
                kicker: 'Q1 EXEC',
                headline: 'Revenue Accelerated',
                support: 'Consistent growth across regions.',
                notes: 'Open with top-line momentum.',
                seconds: 12,
              },
              {
                headline: 'Key Figures',
                stats: [
                  { value: '3.2x', label: 'Pipeline growth' },
                  { value: '99.9%', label: 'Uptime' },
                ],
                notes: 'Emphasize uptime.',
              },
            ],
          }),
        )
      ).content,
    )
    expect(replaced.ok).toBe(true)
    expect(replaced.data.totalSlides).toBe(2)
    expect(slidesFromHtml(f1.getHtml())[0].seconds).toBe(12)
    expect(f1.ctx.document.title).toBe('Executive Summary')

    // Missing baseHash is refused
    await expect(
      f1.handlers.fn_scaffoldSlidesFromOutline(
        invoke('fn_scaffoldSlidesFromOutline', { markdown: '# No Hash' }),
      ),
    ).rejects.toThrow(/baseHash is required/i)

    // 2. fn_polishDeckThemeAndFixes (respects reference guard, fixes steps + blank slide + remixes slide)
    const f2 = makeFixture()
    // Refuses stock look while design reference is attached unless ignoreReference: true
    await expect(
      f2.handlers.fn_polishDeckThemeAndFixes(
        invoke('fn_polishDeckThemeAndFixes', {
          baseHash: f2.getHash(),
          look: 'paper',
        }),
      ),
    ).rejects.toThrow(/design reference/i)

    const polished = JSON.parse(
      (
        await f2.handlers.fn_polishDeckThemeAndFixes(
          invoke('fn_polishDeckThemeAndFixes', {
            baseHash: f2.getHash(),
            look: 'paper',
            ignoreReference: true,
            renumberSteps: true,
            trimBlankSlides: true,
            remixSlides: [{ index: 2, blockId: 'statement' }],
          }),
        )
      ).content,
    )
    expect(polished.ok).toBe(true)
    expect(polished.data.appliedActions).toContain('setLook:paper')
    expect(polished.data.appliedActions).toContain('renumberSteps')
    expect(polished.data.appliedActions).toContain('trimBlankSlides')
    expect(polished.data.appliedActions).toContain('remixSlide:2->statement')
    expect(polished.data.afterScore).toBeGreaterThanOrEqual(
      polished.data.beforeScore,
    )
    expect(slidesFromHtml(f2.getHtml()).length).toBe(4)

    // House-style guard on fn_polishDeckThemeAndFixes
    const houseSpec = customLook({
      name: 'pure.science',
      colors: { bg: '#0b1222', ink: '#ffffff', accent: '#3b6fe8' },
    })
    const fHouse = makeFixture({
      html: withCustomLook(makeRichDeckHtml(), houseSpec),
      material: [],
      houseStyle: { name: 'pure.science', id: 'org:ps', path: '/b.json', samples: [] } as never,
    })
    await expect(
      fHouse.handlers.fn_polishDeckThemeAndFixes(
        invoke('fn_polishDeckThemeAndFixes', {
          baseHash: fHouse.getHash(),
          highContrastLook: true,
        }),
      ),
    ).rejects.toThrow(/house style/i)

    // 3. fn_batchUpdateSpeakerNotes (all-or-nothing validation + chained hashes)
    await expect(
      f2.handlers.fn_batchUpdateSpeakerNotes(
        invoke('fn_batchUpdateSpeakerNotes', {
          baseHash: polished.data.hash,
          updates: [
            { index: 0, notes: 'Valid note' },
            { index: 99, notes: 'Out of range' },
          ],
        }),
      ),
    ).rejects.toThrow(/out of range/i)

    const batched = JSON.parse(
      (
        await f2.handlers.fn_batchUpdateSpeakerNotes(
          invoke('fn_batchUpdateSpeakerNotes', {
            baseHash: polished.data.hash,
            updates: [
              { index: 2, notes: 'Highlight adoption trend.', seconds: 9 },
              { index: 3, headline: 'Q1 Roadmap', notes: 'Close with next quarter focus.' },
            ],
          }),
        )
      ).content,
    )
    expect(batched.ok).toBe(true)
    expect(batched.data.updatedCount).toBe(2)
    const updatedSlides = slidesFromHtml(f2.getHtml())
    expect(updatedSlides[2].notes).toBe('Highlight adoption trend.')
    expect(updatedSlides[2].seconds).toBe(9)
    expect(updatedSlides[3].headline).toBe('Q1 Roadmap')
    expect(updatedSlides[3].notes).toBe('Close with next quarter focus.')
  })

  it('discovers and routes extended tools safely via discoverAppTools, callExtendedReadTool, and callExtendedTool', async () => {
    const { handlers, getHash, restoreRevision } = makeFixture()

    // Discovery by query
    const discovered = JSON.parse(
      (
        await handlers.discoverAppTools(
          invoke('discoverAppTools', { query: 'revision' }),
        )
      ).content,
    )
    expect(discovered.appSlug).toBe('slides')
    expect(
      discovered.operations.some((op: { name: string }) => op.name === 'listRevisions'),
    ).toBe(true)
    expect(
      discovered.operations.some((op: { name: string }) => op.name === 'restoreRevision'),
    ).toBe(true)

    // Exact schema inspection via names
    const described = JSON.parse(
      (
        await handlers.discoverAppTools(
          invoke('discoverAppTools', { names: ['restoreRevision', 'listBlocks'] }),
        )
      ).content,
    )
    expect(described.mode).toBe('describe')
    const restoreInfo = described.operations.find(
      (op: { name: string }) => op.name === 'restoreRevision',
    )
    expect(restoreInfo.invokeVia).toBe('callExtendedTool')
    expect(restoreInfo.requiresConfirmDestructive).toBe(true)
    expect(restoreInfo.inputSchema.type).toBe('object')

    // Read-only extended tool succeeds via callExtendedReadTool
    const blocksRes = JSON.parse(
      (
        await handlers.callExtendedReadTool(
          invoke('callExtendedReadTool', { tool: 'listBlocks', arguments: {} }),
        )
      ).content,
    )
    expect(blocksRes.blocks.length).toBeGreaterThan(10)

    // Refusals on callExtendedReadTool: direct core tool & mutating extended tool
    await expect(
      handlers.callExtendedReadTool(
        invoke('callExtendedReadTool', { tool: 'getDeckContext' }),
      ),
    ).rejects.toThrow(/already directly exposed/i)
    await expect(
      handlers.callExtendedReadTool(
        invoke('callExtendedReadTool', { tool: 'moveSlide' }),
      ),
    ).rejects.toThrow(/cannot run through callExtendedReadTool/i)

    // Mutating extended tool enforces baseHash AND succeeds when supplied
    await expect(
      handlers.callExtendedTool(
        invoke('callExtendedTool', {
          tool: 'moveSlide',
          arguments: { from: 2, to: 1 },
        }),
      ),
    ).rejects.toThrow(/baseHash is required/i)

    const moved = JSON.parse(
      (
        await handlers.callExtendedTool(
          invoke('callExtendedTool', {
            tool: 'moveSlide',
            arguments: { from: 2, to: 1, baseHash: getHash() },
          }),
        )
      ).content,
    )
    expect(moved.from).toBe(2)
    expect(moved.to).toBe(1)

    // Refusals on callExtendedTool: read-only tool, direct core tool, destructive without confirmDestructive
    await expect(
      handlers.callExtendedTool(
        invoke('callExtendedTool', { tool: 'listRevisions' }),
      ),
    ).rejects.toThrow(/read-only/i)
    await expect(
      handlers.callExtendedTool(
        invoke('callExtendedTool', { tool: 'exportDeck' }),
      ),
    ).rejects.toThrow(/already directly exposed/i)
    await expect(
      handlers.callExtendedTool(
        invoke('callExtendedTool', {
          tool: 'restoreRevision',
          arguments: { file: '2026-11-20T10-00-00-000Z-agent.html' },
        }),
      ),
    ).rejects.toThrow(/confirmDestructive: true/i)

    // Destructive extended tool succeeds when confirmDestructive: true is supplied
    const restored = JSON.parse(
      (
        await handlers.callExtendedTool(
          invoke('callExtendedTool', {
            tool: 'restoreRevision',
            arguments: { file: '2026-11-20T10-00-00-000Z-agent.html' },
            confirmDestructive: true,
          }),
        )
      ).content,
    )
    expect(restored.restored).toBe('2026-11-20T10-00-00-000Z-agent.html')
    expect(restoreRevision).toHaveBeenCalledOnce()
  })
})
