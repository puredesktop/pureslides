import {
  createAppOperationsRegistry,
  defineAppTool,
  type AppAtomicToolDefinition,
  type BuildHandlersOptions,
} from '@purescience/platform-ui/bridge/appFunctions'
import type {
  AgentToolHandler,
  AgentToolHandlerResult,
} from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { PURESLIDES_ATOMIC_TOOL_SCHEMAS } from './atomicToolSchemas'
import {
  AgentDeckToolError,
  BASE_HASH_REQUIRED_TOOLS,
  MISSING_BASE_HASH_MESSAGE,
  type DeckAgentToolContext,
} from './catalog'
import { PURESLIDES_FUNCTIONS } from './functions'
import {
  addAssetHandler,
  addBlockHandler,
  addSlideHandler,
  checkDeckHandler,
  createDeckHandler,
  deleteElementHandler,
  deleteSlideHandler,
  describeAssetHandler,
  draftDeckHandler,
  duplicateSlideHandler,
  exportDeckHandler,
  getDeckContextHandler,
  getSlideHandler,
  listAssetsHandler,
  listBlocksHandler,
  listRevisionsHandler,
  listSlidesHandler,
  moveSlideHandler,
  presentHandler,
  restoreRevisionHandler,
  saveDeckHandler,
  setAssetRoleHandler,
  setBriefHandler,
  setDeckHandler,
  setElementHandler,
  setElementStepHandler,
  setElementTextHandler,
  setLookHandler,
  setSelectionHandler,
  setSlideHtmlHandler,
  stopExportHandler,
  updateSlideHandler,
} from './handlers'
import {
  listLookFontsHandler,
  makeMotifHandler,
  saveLookAsBrandHandler,
  setCustomLookHandler,
  viewSlideHandler,
} from './lookTools'
import {
  listBrandsHandler,
  proposeBrandToOrganisationHandler,
  proposeSamplesToOrganisationHandler,
} from './orgTools'

type AtomicRunner = (
  ctx: DeckAgentToolContext,
  args: Record<string, unknown>,
) => AgentToolHandlerResult | Promise<AgentToolHandlerResult>

const ATOMIC_RUNNERS: Record<string, AtomicRunner> = {
  getDeckContext: ctx => getDeckContextHandler(ctx),
  getSlide: (ctx, args) => getSlideHandler(ctx, args),
  listSlides: ctx => listSlidesHandler(ctx),
  listAssets: ctx => listAssetsHandler(ctx),
  checkDeck: ctx => checkDeckHandler(ctx),
  createDeck: (ctx, args) => createDeckHandler(ctx, args),
  setDeck: (ctx, args) => setDeckHandler(ctx, args),
  addSlide: (ctx, args) => addSlideHandler(ctx, args),
  updateSlide: (ctx, args) => updateSlideHandler(ctx, args),
  setSlideHtml: (ctx, args) => setSlideHtmlHandler(ctx, args),
  moveSlide: (ctx, args) => moveSlideHandler(ctx, args),
  duplicateSlide: (ctx, args) => duplicateSlideHandler(ctx, args),
  deleteSlide: (ctx, args) => deleteSlideHandler(ctx, args),
  setElement: (ctx, args) => setElementHandler(ctx, args),
  setElementText: (ctx, args) => setElementTextHandler(ctx, args),
  listBlocks: ctx => listBlocksHandler(ctx),
  addBlock: (ctx, args) => addBlockHandler(ctx, args),
  deleteElement: (ctx, args) => deleteElementHandler(ctx, args),
  setElementStep: (ctx, args) => setElementStepHandler(ctx, args),
  addAsset: (ctx, args) => addAssetHandler(ctx, args),
  setAssetRole: (ctx, args) => setAssetRoleHandler(ctx, args),
  describeAsset: (ctx, args) => describeAssetHandler(ctx, args),
  setBrief: (ctx, args) => setBriefHandler(ctx, args),
  setLook: (ctx, args) => setLookHandler(ctx, args),
  listLookFonts: () => listLookFontsHandler(),
  setCustomLook: (ctx, args) => setCustomLookHandler(ctx, args),
  makeMotif: (ctx, args) => makeMotifHandler(ctx, args),
  saveLookAsBrand: (ctx, args) => saveLookAsBrandHandler(ctx, args),
  listBrands: ctx => listBrandsHandler(ctx),
  proposeBrandToOrganisation: (ctx, args) =>
    proposeBrandToOrganisationHandler(ctx, args),
  proposeSamplesToOrganisation: (ctx, args) =>
    proposeSamplesToOrganisationHandler(ctx, args),
  viewSlide: (ctx, args) => viewSlideHandler(ctx, args),
  draftDeck: ctx => draftDeckHandler(ctx),
  getDrawerRequest: async ctx => ({
    content: JSON.stringify(await ctx.getDrawerRequest()),
  }),
  cancelDrawerRequest: async (ctx, args) => ({
    content: JSON.stringify(await ctx.cancelDrawerRequest(args)),
  }),
  commitDrawerRequest: async (ctx, args) => ({
    content: JSON.stringify(await ctx.commitDrawerRequest(args)),
  }),
  setSelection: (ctx, args) => setSelectionHandler(ctx, args),
  present: (ctx, args) => presentHandler(ctx, args),
  saveDeck: ctx => saveDeckHandler(ctx),
  exportDeck: (ctx, args) => exportDeckHandler(ctx, args),
  stopExport: ctx => stopExportHandler(ctx),
  listRevisions: ctx => listRevisionsHandler(ctx),
  restoreRevision: (ctx, args) => restoreRevisionHandler(ctx, args),
}

const atomicTools: AppAtomicToolDefinition<DeckAgentToolContext>[] =
  PURESLIDES_ATOMIC_TOOL_SCHEMAS.map(schema =>
    defineAppTool<DeckAgentToolContext>({
      ...schema,
      run: async (ctx, args) => {
        if (BASE_HASH_REQUIRED_TOOLS.has(schema.name)) {
          const baseHash = args.baseHash
          if (typeof baseHash !== 'string' || !baseHash.trim()) {
            throw new AgentDeckToolError(MISSING_BASE_HASH_MESSAGE)
          }
        }
        const runner = ATOMIC_RUNNERS[schema.name]
        if (!runner) {
          throw new AgentDeckToolError(
            `Missing atomic tool handler for "${schema.name}".`,
          )
        }
        return runner(ctx, args)
      },
    }),
  )

/**
 * PureSlides' unified Operations Registry built on `@purescience/platform-ui/bridge/appFunctions`:
 *   - 7 composite `function` workflows (`fn_*`, always exposed)
 *   - 9 core atomic tools (~21% of 43, always exposed)
 *   - 3 universal escape-hatch meta-tools (always exposed)
 *   - 34 extended specialist atomic tools (hidden by default, 100% reachable on demand)
 */
export const PURESLIDES_OPERATIONS_REGISTRY =
  createAppOperationsRegistry<DeckAgentToolContext>({
    appSlug: 'slides',
    appName: 'PureSlides',
    functions: PURESLIDES_FUNCTIONS,
    tools: atomicTools,
  })

export function buildPureSlidesHandlers(
  getCtx: () => DeckAgentToolContext,
  options: BuildHandlersOptions<DeckAgentToolContext> = {},
): Record<string, AgentToolHandler> {
  return PURESLIDES_OPERATIONS_REGISTRY.buildHandlers(getCtx, {
    createError: message => new AgentDeckToolError(message),
    ...options,
  })
}
