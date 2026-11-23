/**
 * Grid / Lightbox Slide Sorter (`G`).
 *
 * Responsive multi-column deck overview with live miniature SlideFrame
 * previews, drag-to-reorder, slide numbers, step/notes badges, overlap marks,
 * and quick open / duplicate / delete actions.
 */
import { useState } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { SlideFrame } from './SlideFrame'
import type { DeckGeometry } from '../types'
import type { Slide } from '../lib/slides'
import type { SlideEvidenceMap } from '../lib/deckVerification'
import { quiet } from '../ui/look'

export interface SlideGridSorterProps {
  html: string
  slides: Slide[]
  geometry: DeckGeometry
  selected: number
  previews: Record<string, string>
  evidence: SlideEvidenceMap
  onSelect: (index: number) => void
  onOpenSlide: (index: number) => void
  onMove: (from: number, to: number) => void
  onDuplicate: (index: number) => void
  onDelete: (index: number) => void
  onAddSlide: () => void
  onLayout: (slide: number, report: import('../lib/deckVerification').LayoutReport, html: string) => void
}

export function SlideGridSorter({
  html,
  slides,
  geometry,
  selected,
  previews,
  evidence,
  onSelect,
  onOpenSlide,
  onMove,
  onDuplicate,
  onDelete,
  onAddSlide,
  onLayout,
}: SlideGridSorterProps): React.ReactElement {
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  const handleDropOn = (targetIndex: number) => {
    if (dragging !== null && dragging !== targetIndex) {
      onMove(dragging, targetIndex)
    }
    setDragging(null)
    setDropTarget(null)
  }

  return (
    <GridRoot aria-label="Slide grid sorter">
      <GridHeader>
        <HeaderTitle>Slide Sorter</HeaderTitle>
        <HeaderMeta>
          {slides.length} {slides.length === 1 ? 'slide' : 'slides'} · Drag cards to reorder · Double-click to open stage
        </HeaderMeta>
        <span style={{ flex: 1 }} />
        <ActionBtn type="button" onClick={onAddSlide}>
          + Add slide
        </ActionBtn>
      </GridHeader>

      <GridCanvas>
        {slides.map(item => {
          const isSelected = item.index === selected
          const isOver = dropTarget === item.index && dragging !== null && dragging !== item.index
          const overlapCount = evidence[item.index]?.overlaps ?? 0
          return (
            <GridCard
              key={item.index}
              data-grid-slide={item.index}
              $selected={isSelected}
              $dragging={dragging === item.index}
              $dropOver={isOver}
              draggable
              onClick={() => onSelect(item.index)}
              onDoubleClick={() => onOpenSlide(item.index)}
              onDragStart={event => {
                setDragging(item.index)
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', String(item.index))
              }}
              onDragOver={event => {
                event.preventDefault()
                if (dragging !== null && dropTarget !== item.index) {
                  setDropTarget(item.index)
                }
              }}
              onDragLeave={() => {
                if (dropTarget === item.index) setDropTarget(null)
              }}
              onDrop={event => {
                event.preventDefault()
                handleDropOn(item.index)
              }}
              onDragEnd={() => {
                setDragging(null)
                setDropTarget(null)
              }}
            >
              <PreviewWrap>
                <SlideFrame
                  html={html}
                  slide={item.index}
                  step={item.steps}
                  geometry={geometry}
                  width={260}
                  previews={previews}
                  onLayout={onLayout}
                />
                <SlideNum $selected={isSelected}>
                  {String(item.index + 1).padStart(2, '0')}
                </SlideNum>
                <Badges>
                  {overlapCount > 0 ? (
                    <Badge $warn title={`${overlapCount} overlapping elements`}>
                      overlap
                    </Badge>
                  ) : null}
                  {item.steps > 0 ? (
                    <Badge title={`Builds in ${item.steps} steps`}>
                      {item.steps} {item.steps === 1 ? 'step' : 'steps'}
                    </Badge>
                  ) : null}
                  {item.notes ? <Badge title="Has speaker notes">notes</Badge> : null}
                </Badges>
              </PreviewWrap>

              <CardFooter>
                <CardInfo>
                  <CardTitle title={item.headline || `Slide ${item.index + 1}`}>
                    {item.headline || `Slide ${item.index + 1}`}
                  </CardTitle>
                  <CardBlock>{item.block || 'slide'}</CardBlock>
                </CardInfo>
                <CardActions>
                  <MiniBtn
                    type="button"
                    title={`Open slide ${item.index + 1} on stage`}
                    onClick={event => {
                      event.stopPropagation()
                      onOpenSlide(item.index)
                    }}
                  >
                    Edit
                  </MiniBtn>
                  <MiniBtn
                    type="button"
                    title={`Duplicate slide ${item.index + 1}`}
                    onClick={event => {
                      event.stopPropagation()
                      onDuplicate(item.index)
                    }}
                  >
                    Dup
                  </MiniBtn>
                  <MiniBtn
                    type="button"
                    $danger
                    disabled={slides.length <= 1}
                    title={slides.length <= 1 ? 'A deck keeps at least one slide' : `Delete slide ${item.index + 1}`}
                    onClick={event => {
                      event.stopPropagation()
                      onDelete(item.index)
                    }}
                  >
                    Del
                  </MiniBtn>
                </CardActions>
              </CardFooter>
            </GridCard>
          )
        })}

        <AddTile type="button" onClick={onAddSlide}>
          <span>+ Add a slide</span>
        </AddTile>
      </GridCanvas>
    </GridRoot>
  )
}

const GridRoot = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--n-ground, var(--pure-chrome-well));
  overflow: hidden;
`

const GridHeader = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--n-line, var(--pure-chrome-line));
  background: var(--n-panel, var(--platform-colors-surface));
`

const HeaderTitle = styled.span`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--n-ink, var(--platform-colors-text));
`

const HeaderMeta = styled.span`
  font-size: 12px;
  color: var(--n-faint, var(--pure-chrome-soft));
`

const ActionBtn = styled.button`
  ${quiet}
  height: 26px;
  font-size: 12px;
`

const GridCanvas = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(276px, 1fr));
  align-content: start;
  gap: 18px;
`

const GridCard = styled.div<{ $selected: boolean; $dragging: boolean; $dropOver: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border-radius: 3px;
  border: 1px solid
    ${props =>
      props.$dropOver
        ? ACCENT
        : props.$selected
          ? ACCENT
          : 'var(--n-line, var(--pure-chrome-line))'};
  background: ${props =>
    props.$selected ? 'var(--p-chosen, var(--n-selected))' : 'var(--n-sheet, var(--platform-colors-elevated))'};
  box-shadow: ${props =>
    props.$dropOver
      ? `0 0 0 2px ${ACCENT}`
      : props.$selected
        ? 'var(--p-chosen-edge, none)'
        : 'none'};
  opacity: ${props => (props.$dragging ? 0.45 : 1)};
  cursor: grab;
  transition: border-color 100ms ease, background 100ms ease;

  &:hover {
    border-color: ${props => (props.$selected ? ACCENT : 'var(--n-strong, var(--pure-chrome-line))')};
  }
`

const PreviewWrap = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid var(--n-fence, var(--pure-chrome-line));
  background: #ffffff;
`

const SlideNum = styled.span<{ $selected: boolean }>`
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 6px;
  border-radius: 2px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10px;
  font-weight: 700;
  background: ${props => (props.$selected ? ACCENT : 'rgb(20 23 26 / 0.84)')};
  color: #ffffff;
`

const Badges = styled.div`
  position: absolute;
  bottom: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
`

const Badge = styled.span<{ $warn?: boolean }>`
  padding: 2px 5px;
  border-radius: 2px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 9.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${props => (props.$warn ? 'var(--p-failed-text, #c62828)' : 'rgb(255 255 255 / 0.92)')};
  color: ${props => (props.$warn ? '#ffffff' : '#14171a')};
`

const CardFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
`

const CardInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const CardTitle = styled.div`
  font-size: 12.5px;
  font-weight: 600;
  color: var(--n-ink, var(--platform-colors-text));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const CardBlock = styled.div`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--n-faint, var(--pure-chrome-soft));
`

const CardActions = styled.div`
  flex: none;
  display: flex;
  gap: 4px;
`

const MiniBtn = styled.button<{ $danger?: boolean }>`
  height: 22px;
  padding: 0 7px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-sheet, var(--pure-chrome-surface));
  color: ${props =>
    props.$danger
      ? 'var(--p-failed-text, var(--platform-colors-danger))'
      : 'var(--n-ink, var(--platform-colors-text))'};
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--n-hover, var(--pure-chrome-hover));
  }
  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
`

const AddTile = styled.button`
  min-height: 188px;
  border: 1px dashed var(--n-strong, var(--pure-chrome-line));
  border-radius: 3px;
  background: transparent;
  color: var(--n-soft, var(--pure-chrome-soft));
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  display: grid;
  place-items: center;
  cursor: pointer;

  &:hover {
    border-color: ${ACCENT};
    color: var(--n-ink, var(--platform-colors-text));
    background: var(--n-sheet, var(--pure-chrome-surface));
  }
`
