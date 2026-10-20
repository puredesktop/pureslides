/**
 * Tags for the shared agent activity layer: what a tool call names, marked on
 * screen. Attributes only — nothing here changes behaviour.
 *
 * Every slide tool counts slides from 0 (`index`, `slideIndex`, `from`, `to`,
 * `atIndex`, `selectedSlide`, `slideIndexes`, `fromSlide`), so a slide carries
 * each of those keys with its 0-based index.
 */

export interface AgentRefProps {
  'data-agent-ref': string
  'data-agent-label': string
}

const SLIDE_INDEX_KEYS = [
  'index',
  'slideIndex',
  'from',
  'to',
  'atIndex',
  'selectedSlide',
  'slideIndexes',
  'fromSlide',
] as const

/** A slide (thumbnail or the one on stage) at its 0-based position. */
export function slideAgentRefs(index: number, headline?: string): AgentRefProps {
  return {
    'data-agent-ref': SLIDE_INDEX_KEYS.map(key => `${key}:${index}`).join(' '),
    'data-agent-label': headline || `Slide ${index + 1}`,
  }
}

/** A file in the deck's assets/ folder, named as addAsset/setAssetRole/describeAsset (`name`) and updateSlide/addBlock (`asset`) take it. */
export function assetAgentRefs(name: string): AgentRefProps {
  return {
    'data-agent-ref': [name, `name:${name}`, `asset:${name}`, `assets/${name}`].join(' '),
    'data-agent-label': name,
  }
}

/** A block in the add-a-slide picker, as addBlock takes it. */
export function blockAgentRefs(id: string, label: string): AgentRefProps {
  return {
    'data-agent-ref': `blockId:${id}`,
    'data-agent-label': label,
  }
}

/** A saved revision, as restoreRevision takes it. */
export function revisionAgentRefs(file: string, label: string): AgentRefProps {
  return {
    'data-agent-ref': [file, `file:${file}`].join(' '),
    'data-agent-label': label,
  }
}

/** The open deck, by the documentPath the reads answer with. */
export function deckAgentRefs(path: string | null | undefined, title?: string): Partial<AgentRefProps> {
  if (!path) return {}
  return {
    'data-agent-ref': [path, `documentPath:${path}`, `path:${path}`].join(' '),
    'data-agent-label': title || path.split('/').pop() || path,
  }
}
