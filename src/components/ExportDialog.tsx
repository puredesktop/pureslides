/**
 * Getting the deck out.
 *
 * Three destinations from one document, and the dialog says what each one
 * does rather than making anyone guess: paper reveals every build because
 * paper has no presses, images are one file per slide, video puts the slides
 * on a clock. Whatever was exported last stays reachable underneath — the
 * file is the durable fact, not this dialog's state.
 */
import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { checkDeck, hasBlockingFinding } from '../lib/checkDeck'
import { deckSeconds } from '../lib/deckDocument'
import type { DeckVerification } from '../lib/deckVerification'
import { canEncodeVideo } from '../lib/encodeMp4'
import { containDialogFocus } from './dialogFocus'
import type { ExportKind, ExportProgressState } from '../types'
import type { Slide } from '../lib/slides'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  html: string
  slides: Slide[]
  /** Asset names currently present under `assets/` in the package, for missing-media checks. */
  availableAssets?: readonly string[]
  progress: ExportProgressState
  lastExportPath: string | null
  /**
   * The same state the pipeline gates on. The dialog reflects it; it does
   * not enforce it — `exportDeck` refuses on its own, for every caller.
   */
  verification: DeckVerification
  onExport: (kind: ExportKind, notesAppendix: boolean) => void
  onCancel: () => void
  onReveal: (path: string) => void
  /** Jump directly to a slide with a warning or layout failure. */
  onSelectSlide?: (slideIndex: number) => void
  /** Optional direct Portable HTML browser download (used in standalone dev mode). */
  standaloneDev?: boolean
}

const KINDS: { id: ExportKind; label: string; note: string }[] = [
  {
    id: 'html',
    label: 'Portable HTML',
    note: 'One self-contained .html presentation with built-in keyboard, touch, grid, blackout, whiteout, and fullscreen player. Zero dependencies — works offline anywhere.',
  },
  {
    id: 'pdf',
    label: 'PDF',
    note: 'One page per slide, every build revealed. A video prints as its poster, or a panel naming the clip. Speaker notes as an appendix, if you want them.',
  },
  { id: 'images', label: 'Images', note: 'Every slide as a PNG, numbered.' },
  {
    id: 'pptx',
    label: 'PowerPoint',
    note: 'One picture slide per slide, exactly as the board shows it, speaker notes attached, and every video placed as a real clip that plays. Opens in PowerPoint, Keynote and Google Slides; the text is a picture, not type.',
  },
  {
    id: 'video',
    label: 'Video',
    note: 'Slides on a clock — each holds for its seconds and its build steps play through.',
  },
]

export function ExportDialog({
  open,
  onClose,
  html,
  slides,
  availableAssets,
  progress,
  lastExportPath,
  verification,
  onExport,
  onCancel,
  onReveal,
  onSelectSlide,
  standaloneDev = false,
}: ExportDialogProps): React.ReactElement | null {
  const [kind, setKind] = useState<ExportKind>(standaloneDev ? 'html' : 'pdf')
  const [notesAppendix, setNotesAppendix] = useState(false)
  const [showAllFindings, setShowAllFindings] = useState(false)
  const working =
    progress.phase === 'preparing' || progress.phase === 'working'

  useEffect(() => {
    if (!open) return
    setShowAllFindings(false)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const findings = checkDeck(html, { availableAssets })
  const layoutFailed = verification.state === 'failed'
  const layoutChecking = verification.state === 'checking'
  const blocked =
    kind === 'html' && standaloneDev
      ? hasBlockingFinding(findings)
      : hasBlockingFinding(findings) || layoutFailed
  const blocking = findings.filter(finding => finding.severity === 'error')
  const warnings = findings.filter(finding => finding.severity === 'warning')
  const allFindings = [...blocking, ...warnings]
  const visibleFindings = showAllFindings ? allFindings : allFindings.slice(0, 4)
  const hiddenFindingsCount = Math.max(0, allFindings.length - visibleFindings.length)
  const hasNotes = slides.some(slide => slide.notes.trim())
  const runtime = deckSeconds(slides.map(slide => slide.seconds))
  const videoEncoderAvailable = canEncodeVideo()
  const justExported = progress.phase === 'done' && Boolean(progress.outputPath)
  const output = (progress.phase === 'done' && progress.outputPath) || lastExportPath

  const jumpToSlide = (slideIndex: number): void => {
    onSelectSlide?.(slideIndex)
    onClose()
  }

  return (
    <Scrim onClick={working ? undefined : onClose}>
      <Dialog
        role="dialog"
        aria-modal="true"
        aria-label="Export deck"
        onKeyDown={containDialogFocus}
        onClick={event => event.stopPropagation()}
      >
        <Head>
          <Title>Export</Title>
          <span style={{ flex: 1 }} />
          <Mono>
            {slides.length} {slides.length === 1 ? 'slide' : 'slides'}
          </Mono>
        </Head>

        <Section>
          <SectionHead>To</SectionHead>
          {KINDS.map(option => (
            <Choice
              key={option.id}
              type="button"
              disabled={working}
              $active={kind === option.id}
              onClick={() => setKind(option.id)}
            >
              <ChoiceText>
                <ChoiceLabel>{option.label}</ChoiceLabel>
                <ChoiceNote>
                  {option.id === 'video'
                    ? `${option.note} Runs ${runtime}s in all.${videoEncoderAvailable ? '' : ' Note: this runtime has no MP4 encoder, so it exports a PNG frame sequence.'}`
                    : option.note}
                </ChoiceNote>
              </ChoiceText>
              <Radio $on={kind === option.id} />
            </Choice>
          ))}
          {kind === 'pdf' && hasNotes ? (
            <Toggle>
              <input
                id="export-notes"
                type="checkbox"
                checked={notesAppendix}
                disabled={working}
                onChange={event => setNotesAppendix(event.currentTarget.checked)}
              />
              <label htmlFor="export-notes">Add a speaker-notes appendix</label>
            </Toggle>
          ) : null}
        </Section>

        <Section>
          <SectionHead>
            Check
            <Mono>
              {blocking.length
                ? `${blocking.length} blocking`
                : warnings.length
                  ? `${warnings.length} to know about`
                  : 'clean'}
            </Mono>
          </SectionHead>
          <Finding $error={layoutFailed} $quiet={verification.state === 'verified'}>
            <strong>{verification.message}</strong>
            {layoutFailed
              ? ' — scaling cannot fix overlapping text; change the layout, then export.'
              : layoutChecking
                ? ' — every slide is measured again, in a frame with its fonts loaded, before anything is written.'
                : ' — every slide measured cleanly with its fonts loaded.'}
            {layoutFailed && onSelectSlide && verification.failedSlides.length ? (
              <JumpLinks>
                {verification.failedSlides.map(slideIdx => (
                  <JumpButton
                    key={slideIdx}
                    type="button"
                    onClick={() => jumpToSlide(slideIdx)}
                  >
                    Go to slide {slideIdx + 1}
                  </JumpButton>
                ))}
              </JumpLinks>
            ) : null}
          </Finding>
          {allFindings.length ? (
            <>
              {visibleFindings.map((finding, index) => (
                <Finding
                  key={`${finding.code}-${finding.slide ?? 'deck'}-${index}`}
                  $error={finding.severity === 'error'}
                >
                  <div>
                    <strong>{finding.message}</strong> — {finding.fix}
                  </div>
                  {finding.slide !== undefined && onSelectSlide ? (
                    <JumpButton
                      type="button"
                      onClick={() => jumpToSlide(finding.slide!)}
                    >
                      Go to slide {finding.slide + 1}
                    </JumpButton>
                  ) : null}
                </Finding>
              ))}
              {hiddenFindingsCount > 0 ? (
                <GhostButton type="button" onClick={() => setShowAllFindings(true)}>
                  Show {hiddenFindingsCount} more {hiddenFindingsCount === 1 ? 'finding' : 'findings'}
                </GhostButton>
              ) : null}
            </>
          ) : (
            <Note>Nothing here will surprise you on the page.</Note>
          )}
        </Section>

        <Section>
          {working ? (
            <>
              <Progress
                {...(progress.phase === 'preparing'
                  ? {}
                  : { value: progress.unit, max: progress.unitCount || slides.length })}
              />
              <Note>{progress.message}</Note>
              <GhostButton type="button" onClick={onCancel}>
                Stop
              </GhostButton>
            </>
          ) : (
            <PrimaryButton
              type="button"
              disabled={blocked}
              title={
                layoutFailed
                  ? verification.message
                  : blocked
                    ? 'Fix the errors above first'
                    : layoutChecking
                      ? 'The layout is checked first; the export runs once every slide passes.'
                      : undefined
              }
              onClick={() => onExport(kind, notesAppendix)}
            >
              {layoutChecking ? 'Check & export' : 'Export'}{' '}
              {KINDS.find(option => option.id === kind)?.label}
            </PrimaryButton>
          )}
          {progress.phase === 'error' ? <ErrorLine>{progress.message}</ErrorLine> : null}
        </Section>

        {output && !working ? (
          <Section>
            <SectionHead>{justExported ? 'Exported' : 'Last export'}</SectionHead>
            {justExported && progress.message ? <Note>{progress.message}</Note> : null}
            <Row>
              <Mono title={output}>{output.split('/').pop()}</Mono>
              <span style={{ flex: 1 }} />
              <GhostButton type="button" onClick={() => onReveal(output)}>
                Reveal in Files
              </GhostButton>
            </Row>
          </Section>
        ) : null}

        <Row>
          <span style={{ flex: 1 }} />
          <GhostButton type="button" onClick={onClose}>
            {working ? 'Hide — keeps going' : 'Close'}
          </GhostButton>
        </Row>
      </Dialog>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  background: rgb(12 12 14 / 0.45);
`

const Dialog = styled.div`
  width: min(560px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  /* The popover surface, opaque: the chrome surface is glass on a glass desk, and the editor showed through. */
  background: var(--platform-colors-elevated, #fff);
  box-shadow: 0 18px 50px rgb(15 15 18 / 0.28);
`

const Head = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
`

const Title = styled.h2`
  margin: 0;
  font-size: 18px;
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionHead = styled.div`
  display: flex;
  justify-content: space-between;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--platform-colors-text-secondary);
`

const Choice = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: ${props =>
    props.$active
      ? `2px solid ${ACCENT}`
      : '1px solid var(--platform-colors-border)'};
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
`

const ChoiceText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const ChoiceLabel = styled.span`
  font-size: 13.5px;
  font-weight: 600;
`

const ChoiceNote = styled.span`
  font-size: 11.5px;
  color: var(--platform-colors-text-secondary);
`

const Radio = styled.span<{ $on: boolean }>`
  margin-left: auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  box-sizing: border-box;
  border: ${props =>
    props.$on ? `5px solid ${ACCENT}` : '1.5px solid var(--platform-colors-border)'};
`

const Toggle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--platform-colors-text-secondary);
`

const Note = styled.div`
  font-size: 13px;
  color: var(--platform-colors-text-secondary);
`

const Mono = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: var(--platform-colors-text-secondary);
`

const Finding = styled.div<{ $error?: boolean; $quiet?: boolean }>`
  padding: 8px 10px;
  border: 1px solid
    ${props => (props.$error ? 'var(--platform-colors-danger)' : 'var(--platform-colors-border)')};
  border-radius: 0;
  font-size: 12px;
  color: ${props =>
    props.$error ? 'var(--platform-colors-danger)' : 'var(--platform-colors-text-secondary)'};
  ${props => (props.$quiet ? 'border-style: dashed;' : '')}
`

const Progress = styled.progress`
  width: 100%;
  accent-color: ${ACCENT};
`

const PrimaryButton = styled.button`
  padding: 10px 14px;
  border: 0;
  border-radius: 0;
  background: ${ACCENT};
  color: var(--pure-chrome-on-accent);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`

const GhostButton = styled.button`
  padding: 7px 12px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: var(--platform-colors-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
`

const ErrorLine = styled.div`
  font-size: 12px;
  color: var(--platform-colors-danger);
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const JumpLinks = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
`

const JumpButton = styled.button`
  margin-top: 6px;
  padding: 3px 8px;
  border: 1px solid var(--platform-colors-border);
  border-radius: 0;
  background: var(--platform-colors-surface);
  color: ${ACCENT};
  font: inherit;
  font-size: 11px;
  cursor: pointer;
`
