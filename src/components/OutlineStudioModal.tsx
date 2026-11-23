/**
 * Instant Outline / Markdown Script-to-Deck Studio.
 *
 * Deterministic zero-AI Markdown compiler with live structured slide preview
 * and "Replace slides" / "Append slides" actions.
 */
import { useEffect, useMemo, useState } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import {
  DEFAULT_OUTLINE_SAMPLE,
  parseOutlineToSlides,
} from '../lib/outlineToDeck'
import { containDialogFocus } from './dialogFocus'
import { primaryLook, quiet } from '../ui/look'

export interface OutlineStudioModalProps {
  open: boolean
  onClose: () => void
  onApply: (markdown: string, mode: 'replace' | 'append') => void
}

export function OutlineStudioModal({
  open,
  onClose,
  onApply,
}: OutlineStudioModalProps): React.ReactElement | null {
  const [markdown, setMarkdown] = useState(DEFAULT_OUTLINE_SAMPLE)
  const parsed = useMemo(() => parseOutlineToSlides(markdown), [markdown])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <Scrim onClick={onClose}>
      <Modal
        role="dialog"
        aria-modal="true"
        aria-label="Outline to Deck Studio"
        onKeyDown={containDialogFocus}
        onClick={event => event.stopPropagation()}
      >
        <Head>
          <div>
            <Title>Outline Studio</Title>
            <Subtitle>
              Write or paste Markdown separated by <code>---</code>. Deterministic, instant, zero AI latency.
            </Subtitle>
          </div>
          <span style={{ flex: 1 }} />
          <QuietBtn type="button" onClick={() => setMarkdown(DEFAULT_OUTLINE_SAMPLE)}>
            Load sample
          </QuietBtn>
          <QuietBtn type="button" onClick={onClose}>
            Close
          </QuietBtn>
        </Head>

        <SyntaxBar>
          <span><code>---</code> new slide</span>
          <span><code># Title</code> headline</span>
          <span><code>- item [step]</code> build step</span>
          <span><code>&gt; quote</code> quote</span>
          <span><code>80% | label</code> stat / figures</span>
          <span><code>| a | b |</code> table</span>
          <span><code>Notes:</code> speaker notes</span>
        </SyntaxBar>

        <Split>
          <EditorPane>
            <PaneLabel htmlFor="outline-markdown-input">Markdown script</PaneLabel>
            <TextArea
              id="outline-markdown-input"
              value={markdown}
              onChange={event => setMarkdown(event.currentTarget.value)}
              spellCheck={false}
              placeholder={'# Deck title\nSubtitle\n\n---\n\n# Next slide\n- First point [step]\n- Second point [step]'}
            />
          </EditorPane>

          <PreviewPane aria-label="Parsed slides preview">
            <PaneHeader>
              <PaneLabel as="span">Live outline preview</PaneLabel>
              <CountMeta>
                {parsed.length} {parsed.length === 1 ? 'slide' : 'slides'}
              </CountMeta>
            </PaneHeader>
            {parsed.length ? (
              <PreviewList>
                {parsed.map((slide, index) => (
                  <PreviewCard key={index}>
                    <CardTop>
                      <Num>{String(index + 1).padStart(2, '0')}</Num>
                      <KindTag>{slide.kind}</KindTag>
                      {slide.steps > 0 ? <MetaTag>{slide.steps} steps</MetaTag> : null}
                      {slide.notes ? <MetaTag>notes</MetaTag> : null}
                    </CardTop>
                    <CardHeadline>{slide.headline}</CardHeadline>
                    {slide.support ? <CardSupport>{slide.support}</CardSupport> : null}
                    {slide.bullets.length ? (
                      <MiniList>
                        {slide.bullets.map((b, i) => (
                          <li key={i}>
                            {b.text}
                            {b.step ? <StepChip>step</StepChip> : null}
                          </li>
                        ))}
                      </MiniList>
                    ) : null}
                    {slide.stats.length ? (
                      <StatRow>
                        {slide.stats.map((st, i) => (
                          <StatChip key={i}>
                            <strong>{st.value}</strong> {st.label}
                          </StatChip>
                        ))}
                      </StatRow>
                    ) : null}
                    {slide.table ? (
                      <TableSummary>
                        Table: {slide.table.headers.join(' · ')} ({slide.table.rows.length} rows)
                      </TableSummary>
                    ) : null}
                  </PreviewCard>
                ))}
              </PreviewList>
            ) : (
              <EmptyPreview>Type Markdown on the left to preview slides.</EmptyPreview>
            )}
          </PreviewPane>
        </Split>

        <Footer>
          <FooterNote>
            Changes go through deck history, so you can always undo.
          </FooterNote>
          <span style={{ flex: 1 }} />
          <QuietBtn
            type="button"
            disabled={!parsed.length}
            onClick={() => {
              onApply(markdown, 'append')
              onClose()
            }}
          >
            Append {parsed.length} {parsed.length === 1 ? 'slide' : 'slides'}
          </QuietBtn>
          <PrimaryBtn
            type="button"
            disabled={!parsed.length}
            onClick={() => {
              onApply(markdown, 'replace')
              onClose()
            }}
          >
            Generate / Replace slides
          </PrimaryBtn>
        </Footer>
      </Modal>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background: rgb(12 14 18 / 0.5);
`

const Modal = styled.div`
  width: min(980px, calc(100vw - 32px));
  height: min(740px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  border: 1px solid var(--n-line, var(--platform-colors-border));
  border-radius: 3px;
  background: var(--n-sheet, var(--platform-colors-elevated));
  color: var(--n-ink, var(--platform-colors-text));
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.28);
  overflow: hidden;
`

const Head = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--n-line, var(--pure-chrome-line));
  background: var(--n-panel, var(--platform-colors-surface));
`

const Title = styled.h2`
  margin: 0;
  font-size: 15px;
  font-weight: 700;
`

const Subtitle = styled.div`
  font-size: 12px;
  color: var(--n-soft, var(--pure-chrome-soft));
  code {
    font-family: var(--platform-typography-font-family-mono, monospace);
    font-size: 11px;
  }
`

const SyntaxBar = styled.div`
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 7px 18px;
  border-bottom: 1px solid var(--n-fence, var(--pure-chrome-line));
  background: var(--n-sheet, var(--platform-colors-elevated));
  font-size: 11px;
  color: var(--n-faint, var(--pure-chrome-soft));
  code {
    font-family: var(--platform-typography-font-family-mono, monospace);
    color: var(--n-ink, var(--platform-colors-text));
    background: var(--n-panel, var(--pure-chrome-well));
    padding: 1px 4px;
    border-radius: 2px;
  }
`

const Split = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  @media (max-width: 720px) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 1fr 1fr;
  }
`

const EditorPane = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-right: 1px solid var(--n-line, var(--pure-chrome-line));
  min-height: 0;
`

const PreviewPane = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: var(--n-ground, var(--pure-chrome-well));
  min-height: 0;
  overflow-y: auto;
`

const PaneHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const PaneLabel = styled.label`
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const CountMeta = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: ${ACCENT};
  font-weight: 600;
`

const TextArea = styled.textarea`
  flex: 1;
  min-height: 0;
  resize: none;
  padding: 12px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-sheet, var(--pure-chrome-surface));
  color: var(--n-ink, var(--platform-colors-text));
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 12.5px;
  line-height: 1.55;

  &:focus {
    outline: 2px solid ${ACCENT};
    outline-offset: -1px;
  }
`

const PreviewList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const PreviewCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-sheet, var(--platform-colors-elevated));
`

const CardTop = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const Num = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10.5px;
  font-weight: 700;
  color: ${ACCENT};
`

const KindTag = styled.span`
  padding: 1px 5px;
  border-radius: 2px;
  background: var(--n-panel, var(--pure-chrome-well));
  border: 1px solid var(--n-fence, var(--pure-chrome-line));
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10px;
  text-transform: uppercase;
`

const MetaTag = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10px;
  color: var(--n-faint, var(--pure-chrome-soft));
`

const CardHeadline = styled.div`
  font-size: 13.5px;
  font-weight: 700;
`

const CardSupport = styled.div`
  font-size: 12px;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const MiniList = styled.ul`
  margin: 2px 0 0;
  padding-left: 16px;
  font-size: 11.5px;
  color: var(--n-soft, var(--pure-chrome-soft));
  li {
    margin-bottom: 2px;
  }
`

const StepChip = styled.span`
  margin-left: 6px;
  padding: 0 4px;
  border-radius: 2px;
  background: var(--p-chosen, var(--n-selected));
  color: ${ACCENT};
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 9.5px;
  font-weight: 700;
`

const StatRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

const StatChip = styled.span`
  padding: 3px 6px;
  border-radius: 2px;
  background: var(--n-panel, var(--pure-chrome-well));
  font-size: 11px;
  strong {
    color: ${ACCENT};
    margin-right: 4px;
  }
`

const TableSummary = styled.div`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const EmptyPreview = styled.div`
  padding: 24px;
  text-align: center;
  color: var(--n-faint, var(--pure-chrome-soft));
  font-size: 12.5px;
`

const Footer = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--n-line, var(--pure-chrome-line));
  background: var(--n-panel, var(--platform-colors-surface));
`

const FooterNote = styled.span`
  font-size: 12px;
  color: var(--n-faint, var(--pure-chrome-soft));
`

const QuietBtn = styled.button`
  ${quiet}
`

const PrimaryBtn = styled.button`
  ${quiet}
  ${primaryLook}
`
