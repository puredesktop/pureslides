/**
 * Registering PureSlides' exposed operations with the platform:
 *   - 7 composite `fn_*` functions (always exposed)
 *   - 9 core atomic tools (~21% of 43, always exposed)
 *   - 3 universal escape-hatch meta-tools (`discoverAppTools`,
 *     `callExtendedReadTool`, `callExtendedTool`) giving full on-demand access
 *     to all 34 specialist atomic tools.
 *
 * Handlers read `contextRef.current`, so a tool called mid-export sees the
 * state as it is now rather than as it was when the drawer opened.
 */
import { useMemo, useRef } from 'react'
import { REVIEW_TOOL_NAMES } from '@purescience/platform-ui/review/tools'
import type { AgentToolHandler } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import { usePlatformAgentTools } from '@purescience/platform-ui/bridge/react/usePlatformAgentTools'
import {
  AgentDeckToolError,
  BASE_HASH_REQUIRED_TOOLS,
  EXPOSED_TOOL_NAMES,
  MISSING_BASE_HASH_MESSAGE,
  PURESLIDES_AGENT_LOG_LABEL,
  type DeckAgentToolContext,
} from '../agents/catalog'
import { buildPureSlidesHandlers } from '../agents/operationsRegistry'

export { BASE_HASH_REQUIRED_TOOLS, MISSING_BASE_HASH_MESSAGE }

export function usePureSlidesAgentTools(
  ready: boolean,
  context: DeckAgentToolContext,
  mayChangeDeck: () => boolean = () => true,
  reviewTools: Partial<Record<(typeof REVIEW_TOOL_NAMES)[number], AgentToolHandler>> = {},
): void {
  const contextRef = useRef(context)
  contextRef.current = context
  const mayChangeRef = useRef(mayChangeDeck)
  mayChangeRef.current = mayChangeDeck
  const reviewRef = useRef(reviewTools)
  reviewRef.current = reviewTools

  const registryHandlers = useMemo(
    () =>
      buildPureSlidesHandlers(() => contextRef.current, {
        beforeInvoke: ({ name, risk }) => {
          if (
            (risk !== 'read' || name === 'setSelection') &&
            name !== 'stopExport' &&
            !mayChangeRef.current()
          ) {
            throw new AgentDeckToolError(
              'Wait for the deck to finish opening, then read getDeckContext again before changing it.',
            )
          }
        },
      }),
    [],
  )

  // Statically key-preserving registration so `scripts/check-manifests.mjs`
  // can verify every manifest tool has a live registered handler at build time.
  const handlers = useMemo(
    () =>
      Object.fromEntries(
        EXPOSED_TOOL_NAMES.map(name => [
          name,
          async (invoke: Parameters<AgentToolHandler>[0]) => {
            if ((REVIEW_TOOL_NAMES as readonly string[]).includes(name)) {
              if ((name === 'openReview' || name === 'settleReviewNote') && !mayChangeRef.current()) {
                throw new AgentDeckToolError('Wait for the deck to finish opening, then read getDeckContext again before changing it.')
              }
              const handler = reviewRef.current[name as (typeof REVIEW_TOOL_NAMES)[number]]
              return handler ? handler(invoke) : { content: 'Review is not available here.', isError: true }
            }
            return registryHandlers[name]!(invoke)
          },
        ]),
      ),
    [registryHandlers],
  )

  usePlatformAgentTools({
    ready,
    tools: EXPOSED_TOOL_NAMES,
    logLabel: PURESLIDES_AGENT_LOG_LABEL,
    errorType: AgentDeckToolError,
    handlers,
  })
}
