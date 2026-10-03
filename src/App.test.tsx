// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DeckAgentToolContext } from './agents/catalog'
const mocks = vi.hoisted(() => ({
  previews: {} as Record<string, string>,
  binary: vi.fn(),
  resource: null as { path: string } | null,
  clear: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  create: vi.fn(),
  context: null as unknown as DeckAgentToolContext,
  newDeck: null as unknown as () => void,
}))
vi.mock('@purescience/platform-ui/bridge/react/usePlatformBridge', () => ({
  usePlatformBridge: () => ({ ready: true, meta: {} }),
}))
vi.mock(
  '@purescience/platform-ui/bridge/react/usePlatformViewportResource',
  () => ({
    usePlatformViewportResource: () => ({
      resource: mocks.resource,
      clearResource: mocks.clear,
    }),
  }),
)
vi.mock('@purescience/platform-ui/bridge/documents', () => ({
  autosavePlatformDocument: mocks.save,
  createPlatformDraft: mocks.create,
  onPlatformDocumentsChanged: () => () => {},
  touchPlatformRecentDocument: vi.fn(async () => {}),
}))
vi.mock('@purescience/platform-ui/bridge/workspace', () => ({
  updateCurrentWorkspaceTab: vi.fn(),
  toggleAgentDrawer: vi.fn(),
}))
vi.mock('@purescience/platform-ui/bridge/react/useVideoDrop', () => ({
  useVideoDrop: vi.fn(),
  useImageDrop: vi.fn(),
}))
vi.mock('@purescience/platform-bridge/components/AppFrame', () => ({
  AppFrame: ({
    children,
    inert,
  }: {
    children: React.ReactNode
    inert?: boolean
  }) => createElement('div', { inert }, children),
}))
vi.mock('@purescience/platform-ui/components/common/documents', () => ({
  DocumentHeaderActions: () => null,
  DocumentSwitcher: ({ onCreateNew }: { onCreateNew: () => void }) => {
    mocks.newDeck = onCreateNew
    return null
  },
}))
vi.mock('./hooks/usePureSlidesAgentTools', () => ({
  usePureSlidesAgentTools: (_ready: boolean, context: DeckAgentToolContext) => {
    mocks.context = context
  },
}))
vi.mock('./bridge/platformBridge', () => ({
  readTextFile: mocks.read,
  listFiles: mocks.list,
  readBinaryDataUrl: mocks.binary,
  readBinaryBase64: vi.fn(),
  writeTextFile: vi.fn(),
  writeBinaryFile: vi.fn(),
  createFolder: vi.fn(),
  deletePath: vi.fn(),
  recordOperation: vi.fn(),
  revealPath: vi.fn(),
  cancelShellRender: vi.fn(),
  isStandaloneDevMode: () => false,
}))
vi.mock('./components/SlideBoardView', () => ({
  SlideBoardView: ({ previews }: { previews: Record<string, string> }) => {
    mocks.previews = previews
    return null
  },
}))
vi.mock('./components/AssetsPane', () => ({ AssetsPane: () => null }))
vi.mock('./components/NewDeckWizard', () => ({ NewDeckWizard: () => null }))
vi.mock('./components/PresentWindow', () => ({ PresentWindow: () => null }))
vi.mock('./components/ExportDialog', () => ({ ExportDialog: () => null }))
vi.mock('./components/HtmlDialog', () => ({ HtmlDialog: () => null }))
vi.mock('./components/HistoryDialog', () => ({ HistoryDialog: () => null }))
vi.mock('./lib/measureDeck', () => ({ measureDeck: vi.fn(async () => null) }))
import { App } from './App'
import { createDefaultDeckDocument } from './lib/deckDocument'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root, host: HTMLDivElement
const htmlA = createDefaultDeckDocument('Deck A').html,
  htmlB = createDefaultDeckDocument('Deck B').html
const files = new Map<string, string>()
function packageAt(path: string, html: string, title: string) {
  files.set(`${path}/index.html`, html)
  files.set(
    `${path}/manifest.json`,
    JSON.stringify({
      title,
      brief: `${title} brief`,
      look: 'ink',
      slideCount: 9,
    }),
  )
}
async function render(path?: string) {
  mocks.resource = path ? { path } : null
  await act(async () => root.render(createElement(App)))
}
beforeEach(() => {
  vi.clearAllMocks()
  files.clear()
  mocks.resource = null
  packageAt('/A.deck', htmlA, 'Deck A')
  packageAt('/B.deck', htmlB, 'Deck B')
  mocks.read.mockImplementation(async (path: string) => {
    if (!files.has(path)) throw Error('ENOENT')
    return files.get(path)!
  })
  mocks.list.mockResolvedValue({ entries: [] })
  mocks.save.mockImplementation(
    async ({
      path,
      files: payload,
    }: {
      path: string
      files: { name: string; content: string }[]
    }) => {
      for (const file of payload)
        files.set(`${path}/${file.name}`, file.content)
      return { savedAt: '2026-10-03T00:00:00Z' }
    },
  )
  mocks.create.mockResolvedValue({ path: '/Draft.deck' })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})
it('flushes edited deck A to A before installing B and never saves B into A', async () => {
  await render('/A.deck')
  const edited = htmlA.replace('Deck A', 'A edited')
  await act(async () => {
    mocks.context.applyDeck(edited, undefined, undefined, {
      baseHash: mocks.context.hash,
    })
  })
  mocks.save.mockClear()
  await render('/B.deck')
  expect(mocks.context.document.title).toBe('Deck B')
  expect(
    mocks.save.mock.calls.filter(([request]) => request.path === '/A.deck'),
  ).toHaveLength(1)
  expect(files.get('/A.deck/index.html')).toBe(edited)
  expect(files.get('/B.deck/index.html')).toBe(htmlB)
  expect(JSON.parse(files.get('/A.deck/manifest.json')!).brief).toBe(
    'Deck A brief',
  )
})
it('keeps A and its metadata if saving before a switch fails', async () => {
  await render('/A.deck')
  mocks.clear.mockClear()
  mocks.save.mockRejectedValue(Error('Disk full'))
  await render('/B.deck')
  expect(mocks.context.document.title).toBe('Deck A')
  expect(mocks.context.ui.brief).toBe('Deck A brief')
  expect(mocks.clear).not.toHaveBeenCalled()
  expect(host.querySelector('[inert]')).toBeNull()
})
it('new deck saves its predecessor before clearing its source and metadata', async () => {
  await render('/A.deck')
  mocks.save.mockClear()
  await act(async () => mocks.newDeck())
  expect(mocks.save.mock.calls[0][0].path).toBe('/A.deck')
  expect(files.get('/A.deck/index.html')).toBe(htmlA)
  expect(mocks.context.document.title).toBe('Untitled deck')
  expect(mocks.context.ui.brief).toBe('')
})
it('does not publish partial metadata from a failed package open', async () => {
  await render('/A.deck')
  files.set('/B.deck/manifest.json', '{broken')
  await render('/B.deck')
  expect(mocks.context.document.html).toBe(htmlA)
  expect(mocks.context.ui.brief).toBe('Deck A brief')
})
it('latest host open wins over an earlier delayed package read', async () => {
  await render('/A.deck')
  let finish!: (html: string) => void
  mocks.read.mockImplementation(async (path: string) => {
    if (path === '/B.deck/index.html')
      return new Promise<string>(resolve => {
        finish = resolve
      })
    if (!files.has(path)) throw Error('ENOENT')
    return files.get(path)!
  })
  await render('/B.deck')
  expect(host.querySelector('[inert]')).not.toBeNull()
  packageAt('/C.deck', createDefaultDeckDocument('Deck C').html, 'Deck C')
  await render('/C.deck')
  expect(mocks.context.document.title).toBe('Deck C')
  await act(async () => finish(htmlB))
  expect(mocks.context.document.title).toBe('Deck C')
  expect(mocks.context.ui.brief).toBe('Deck C brief')
})

it('opens its requested deck under StrictMode and consumes the resource once', async () => {
  mocks.resource = { path: '/A.deck' }
  await act(async () =>
    root.render(createElement(StrictMode, null, createElement(App))),
  )
  expect(mocks.context.document.title).toBe('Deck A')
  expect(mocks.clear).toHaveBeenCalledTimes(1)
  expect(host.querySelector('[inert]')).toBeNull()
})

it('never lets delayed assets from A replace B previews with the same filename', async () => {
  let finish!: (value: string) => void
  mocks.list.mockImplementation(async (path: string) => ({
    entries: path.endsWith('/assets')
      ? [{ name: 'logo.png', byteLength: 100 }]
      : [],
  }))
  mocks.binary.mockImplementation(async (path: string) =>
    path.startsWith('/A.deck/')
      ? new Promise<string>(resolve => {
          finish = resolve
        })
      : 'data:image/png;base64,B',
  )
  await render('/A.deck')
  await render('/B.deck')
  expect(mocks.previews['logo.png']).toBe('data:image/png;base64,B')
  await act(async () => finish('data:image/png;base64,A'))
  expect(mocks.previews['logo.png']).toBe('data:image/png;base64,B')
})
