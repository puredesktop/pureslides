/**
 * Command Palette (`⌘K` / `Ctrl+K`).
 *
 * Fuzzy search across:
 * - Slides (jump)
 * - All 17 SLIDE_BLOCKS (insert)
 * - All 7 DECK_LOOKS (apply)
 * - Actions (Present, Grid View, Outline Studio, Theme Studio, Deck Health,
 *   Share, Export, Portable HTML, Duplicate, Undo, Redo)
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { blockCatalogue } from '../lib/blocks'
import { DECK_LOOKS } from '../lib/deckLooks'
import type { Slide } from '../lib/slides'

export interface CommandItem {
  id: string
  category: 'Action' | 'Slide' | 'Insert Block' | 'Look'
  label: string
  detail?: string
  shortcut?: string
  run: () => void
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  slides: Slide[]
  onSelectSlide: (index: number) => void
  onAddBlock: (blockId: string) => void
  onApplyLook: (lookId: string) => void
  onPresent: () => void
  onToggleGrid: () => void
  onOpenOutline: () => void
  onOpenThemeStudio: () => void
  onOpenHealth: () => void
  onOpenShare: () => void
  onOpenExport: () => void
  onExportPortableHtml: () => void
  onDuplicateSlide: () => void
  onUndo?: () => void
  onRedo?: () => void
}

function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const t = text.toLowerCase()
  if (t.includes(q)) return 100 - t.indexOf(q)
  let qi = 0
  let score = 0
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) {
      qi += 1
      score += 2
    }
  }
  return qi === q.length ? score : 0
}

export function CommandPalette({
  open,
  onClose,
  slides,
  onSelectSlide,
  onAddBlock,
  onApplyLook,
  onPresent,
  onToggleGrid,
  onOpenOutline,
  onOpenThemeStudio,
  onOpenHealth,
  onOpenShare,
  onOpenExport,
  onExportPortableHtml,
  onDuplicateSlide,
  onUndo,
  onRedo,
}: CommandPaletteProps): React.ReactElement | null {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const allItems = useMemo<CommandItem[]>(() => {
    const actions: CommandItem[] = [
      { id: 'act-present', category: 'Action', label: 'Present deck', detail: 'Start fullscreen & presenter console', shortcut: '⌥⌘P', run: onPresent },
      { id: 'act-grid', category: 'Action', label: 'Toggle Grid / Stage view', detail: 'Switch between slide sorter lightbox and stage', shortcut: 'G', run: onToggleGrid },
      { id: 'act-outline', category: 'Action', label: 'Outline Studio (Markdown to Deck)', detail: 'Write or paste Markdown slides', run: onOpenOutline },
      { id: 'act-theme', category: 'Action', label: 'Theme & Typography Studio', detail: 'Customize colors, bundled OFL fonts, scale & radius', run: onOpenThemeStudio },
      { id: 'act-health', category: 'Action', label: 'Deck Health & Accessibility', detail: 'View health score, warnings & 1-click auto-fixes', run: onOpenHealth },
      { id: 'act-share', category: 'Action', label: 'Share live deck & Q&A', detail: 'Publish to PureCloud or export Portable HTML', run: onOpenShare },
      { id: 'act-export', category: 'Action', label: 'Export deck…', detail: 'PDF, Images, PowerPoint, Video, Portable HTML', run: onOpenExport },
      { id: 'act-portable', category: 'Action', label: 'Download Portable HTML', detail: 'Single offline self-contained presentation file', run: onExportPortableHtml },
      { id: 'act-dup', category: 'Action', label: 'Duplicate current slide', shortcut: '⌘D', run: onDuplicateSlide },
    ]
    if (onUndo) actions.push({ id: 'act-undo', category: 'Action', label: 'Undo', shortcut: '⌘Z', run: onUndo })
    if (onRedo) actions.push({ id: 'act-redo', category: 'Action', label: 'Redo', shortcut: '⇧⌘Z', run: onRedo })

    const slideItems: CommandItem[] = slides.map(s => ({
      id: `slide-${s.index}`,
      category: 'Slide',
      label: `Slide ${s.index + 1}: ${s.headline || 'Untitled'}`,
      detail: s.block || 'slide',
      run: () => onSelectSlide(s.index),
    }))

    const blockItems: CommandItem[] = blockCatalogue().map(b => ({
      id: `block-${b.id}`,
      category: 'Insert Block',
      label: `Insert ${b.label}`,
      detail: b.description,
      run: () => onAddBlock(b.id),
    }))

    const lookItems: CommandItem[] = DECK_LOOKS.map(l => ({
      id: `look-${l.id}`,
      category: 'Look',
      label: `Apply look: ${l.label}`,
      detail: l.note,
      run: () => onApplyLook(l.id),
    }))

    return [...actions, ...slideItems, ...blockItems, ...lookItems]
  }, [
    slides,
    onSelectSlide,
    onAddBlock,
    onApplyLook,
    onPresent,
    onToggleGrid,
    onOpenOutline,
    onOpenThemeStudio,
    onOpenHealth,
    onOpenShare,
    onOpenExport,
    onExportPortableHtml,
    onDuplicateSlide,
    onUndo,
    onRedo,
  ])

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 18)
    return allItems
      .map(item => ({
        item,
        score: fuzzyScore(query, `${item.category} ${item.label} ${item.detail ?? ''}`),
      }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(entry => entry.item)
  }, [allItems, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) return null

  const execute = (item: CommandItem | undefined) => {
    if (!item) return
    onClose()
    item.run()
  }

  return (
    <Scrim onClick={onClose}>
      <Box
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex(i => (filtered.length ? (i + 1) % filtered.length : 0))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex(i => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0))
          } else if (event.key === 'Enter') {
            event.preventDefault()
            execute(filtered[activeIndex])
          }
        }}
      >
        <SearchRow>
          <SearchInput
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Jump to slide, insert block, apply look, or run action…"
            aria-label="Search commands"
            onChange={event => setQuery(event.currentTarget.value)}
          />
          <EscHint>ESC</EscHint>
        </SearchRow>

        <List role="listbox" aria-label="Matching commands">
          {filtered.length === 0 ? (
            <Empty>No matching slides, blocks, looks, or actions.</Empty>
          ) : (
            filtered.map((item, idx) => (
              <Row
                key={item.id}
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                $active={idx === activeIndex}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => execute(item)}
              >
                <CategoryTag>{item.category}</CategoryTag>
                <RowText>
                  <RowLabel>{item.label}</RowLabel>
                  {item.detail ? <RowDetail>{item.detail}</RowDetail> : null}
                </RowText>
                {item.shortcut ? <Shortcut>{item.shortcut}</Shortcut> : null}
              </Row>
            ))
          )}
        </List>
      </Box>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: min(14vh, 110px);
  background: rgb(12 14 18 / 0.44);
`

const Box = styled.div`
  width: min(580px, calc(100vw - 32px));
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--n-line, var(--platform-colors-border));
  border-radius: 3px;
  background: var(--n-sheet, var(--platform-colors-elevated));
  color: var(--n-ink, var(--platform-colors-text));
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.3);
  overflow: hidden;
`

const SearchRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--n-line, var(--pure-chrome-line));
`

const SearchInput = styled.input`
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--n-ink, var(--platform-colors-text));
  font: inherit;
  font-size: 14px;
  &:focus {
    outline: none;
  }
`

const EscHint = styled.span`
  padding: 2px 6px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 2px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10px;
  color: var(--n-faint, var(--pure-chrome-soft));
`

const List = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
`

const Row = styled.button<{ $active: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border: 0;
  background: ${props =>
    props.$active ? 'var(--p-chosen, var(--n-selected))' : 'transparent'};
  box-shadow: ${props => (props.$active ? 'var(--p-chosen-edge, none)' : 'none')};
  color: var(--n-ink, var(--platform-colors-text));
  text-align: left;
  font: inherit;
  cursor: pointer;
`

const CategoryTag = styled.span`
  flex: none;
  min-width: 78px;
  padding: 2px 5px;
  border-radius: 2px;
  background: var(--n-panel, var(--pure-chrome-well));
  border: 1px solid var(--n-fence, var(--pure-chrome-line));
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  text-align: center;
  color: ${ACCENT};
`

const RowText = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
`

const RowLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const RowDetail = styled.span`
  font-size: 11px;
  color: var(--n-faint, var(--pure-chrome-soft));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Shortcut = styled.span`
  flex: none;
  padding: 2px 5px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 2px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10px;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const Empty = styled.div`
  padding: 24px 14px;
  text-align: center;
  font-size: 12.5px;
  color: var(--n-faint, var(--pure-chrome-soft));
`
