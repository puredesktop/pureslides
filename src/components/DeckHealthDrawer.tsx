/**
 * Live Deck Polish & Accessibility Drawer.
 *
 * Surfaces `checkDeck` + `typeCheck` + `copyCheck` + live layout overlaps
 * with a 0–100 health score, clickable jump-to-slide links, and 1-click
 * deterministic Auto-Fixes.
 */
import { useEffect, useMemo } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { evaluateDeckHealth } from '../lib/deckHealth'
import type { DeckVerification } from '../lib/deckVerification'
import { containDialogFocus } from './dialogFocus'
import { primaryLook, quiet } from '../ui/look'

export interface DeckHealthDrawerProps {
  open: boolean
  onClose: () => void
  html: string
  verification: DeckVerification
  availableAssets?: readonly string[]
  onSelectSlide: (slideIndex: number) => void
  onRecheck: () => void
  onAutoFixSteps: () => void
  onAutoFixContrast: () => void
  onAutoFixTrimBlanks: () => void
}

export function DeckHealthDrawer({
  open,
  onClose,
  html,
  verification,
  availableAssets,
  onSelectSlide,
  onRecheck,
  onAutoFixSteps,
  onAutoFixContrast,
  onAutoFixTrimBlanks,
}: DeckHealthDrawerProps): React.ReactElement | null {
  const report = useMemo(
    () => evaluateDeckHealth(html, verification, { availableAssets }),
    [html, verification, availableAssets],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const scoreTone =
    report.score >= 85 ? 'good' : report.score >= 60 ? 'warn' : 'bad'

  return (
    <Scrim onClick={onClose}>
      <Drawer
        role="dialog"
        aria-modal="true"
        aria-label="Deck Health and Polish"
        onKeyDown={containDialogFocus}
        onClick={event => event.stopPropagation()}
      >
        <Head>
          <div>
            <Title>Deck Health &amp; Polish</Title>
            <Subtitle>Typography, copy clarity, accessibility &amp; layout check</Subtitle>
          </div>
          <span style={{ flex: 1 }} />
          <QuietBtn type="button" onClick={onRecheck}>
            Re-check
          </QuietBtn>
          <QuietBtn type="button" onClick={onClose}>
            Close
          </QuietBtn>
        </Head>

        <ScoreCard>
          <ScoreNum $tone={scoreTone} data-health-score={report.score}>
            {report.score}
          </ScoreNum>
          <ScoreRight>
            <ScoreLabel>
              {report.score >= 90
                ? 'Room-ready'
                : report.score >= 70
                  ? 'Solid — a few quick polishes available'
                  : 'Needs polish before presenting'}
            </ScoreLabel>
            <ScoreTrack>
              <ScoreFill $tone={scoreTone} style={{ width: `${report.score}%` }} />
            </ScoreTrack>
            <ScoreMeta>
              {verification.message} · {report.findings.length}{' '}
              {report.findings.length === 1 ? 'finding' : 'findings'}
              {report.trailingBlankCount > 0
                ? ` · ${report.trailingBlankCount} blank trailing`
                : ''}
            </ScoreMeta>
          </ScoreRight>
        </ScoreCard>

        <Section>
          <SectionHead>1-Click Deterministic Auto-Fixes</SectionHead>
          <FixRow>
            <FixBtn
              type="button"
              onClick={onAutoFixSteps}
              title="Renumber data-step attributes sequentially from 1 on every slide"
            >
              Renumber build steps{report.hasStepGaps ? ' (needed)' : ''}
            </FixBtn>
            <FixBtn
              type="button"
              onClick={onAutoFixContrast}
              title="Switch to the high-contrast Clear look (Atkinson Hyperlegible, AAA contrast)"
            >
              High-contrast Clear look{report.hasContrastIssues ? ' (recommended)' : ''}
            </FixBtn>
            <FixBtn
              type="button"
              disabled={report.trailingBlankCount === 0}
              onClick={onAutoFixTrimBlanks}
              title="Remove blank slides at the end of the deck"
            >
              Trim blank trailing slides ({report.trailingBlankCount})
            </FixBtn>
          </FixRow>
        </Section>

        <Body>
          {report.overlapSlides.length > 0 ? (
            <Section>
              <SectionHead>Layout Overlaps ({report.overlapSlides.length})</SectionHead>
              {report.overlapSlides.map(slideNum => (
                <FindingCard key={`overlap-${slideNum}`} $error>
                  <FindingTop>
                    <SeverityTag $error>Layout</SeverityTag>
                    <FindingMsg>Slide {slideNum} has overlapping content</FindingMsg>
                  </FindingTop>
                  <FindingFix>
                    Scaling cannot separate colliding pinned elements — remix the layout or shorten text.
                  </FindingFix>
                  <JumpBtn
                    type="button"
                    onClick={() => {
                      onSelectSlide(slideNum - 1)
                      onClose()
                    }}
                  >
                    Go to slide {slideNum}
                  </JumpBtn>
                </FindingCard>
              ))}
            </Section>
          ) : null}

          <Section>
            <SectionHead>
              Checks ({report.findings.length})
            </SectionHead>
            {report.findings.length === 0 ? (
              <CleanState>
                All static typography, copy, contrast, and structure checks passed.
              </CleanState>
            ) : (
              report.findings.map((finding, idx) => (
                <FindingCard
                  key={`${finding.code}-${finding.slide ?? 'deck'}-${idx}`}
                  $error={finding.severity === 'error'}
                >
                  <FindingTop>
                    <SeverityTag $error={finding.severity === 'error'}>
                      {finding.severity === 'error' ? 'Error' : finding.code.startsWith('type-') ? 'Type' : finding.code.startsWith('copy-') ? 'Copy' : 'Check'}
                    </SeverityTag>
                    <FindingMsg>{finding.message}</FindingMsg>
                  </FindingTop>
                  <FindingFix>{finding.fix}</FindingFix>
                  {finding.slide !== undefined ? (
                    <JumpBtn
                      type="button"
                      onClick={() => {
                        onSelectSlide(finding.slide!)
                        onClose()
                      }}
                    >
                      Go to slide {finding.slide + 1}
                    </JumpBtn>
                  ) : null}
                </FindingCard>
              ))
            )}
          </Section>
        </Body>
      </Drawer>
    </Scrim>
  )
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  z-index: 42;
  display: flex;
  justify-content: flex-end;
  background: rgb(12 14 18 / 0.36);
`

const Drawer = styled.div`
  width: min(440px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--n-line, var(--platform-colors-border));
  background: var(--n-sheet, var(--platform-colors-elevated));
  color: var(--n-ink, var(--platform-colors-text));
  box-shadow: -12px 0 36px rgb(0 0 0 / 0.2);
`

const Head = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--n-line, var(--pure-chrome-line));
  background: var(--n-panel, var(--platform-colors-surface));
`

const Title = styled.h2`
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
`

const Subtitle = styled.div`
  font-size: 11.5px;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const ScoreCard = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--n-fence, var(--pure-chrome-line));
`

const ScoreNum = styled.div<{ $tone: 'good' | 'warn' | 'bad' }>`
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 3px;
  display: grid;
  place-items: center;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 22px;
  font-weight: 700;
  border: 2px solid
    ${props =>
      props.$tone === 'good'
        ? 'var(--p-done-text, #2e7d32)'
        : props.$tone === 'warn'
          ? 'var(--b-amber, #c68a00)'
          : 'var(--p-failed-text, #c62828)'};
  color: ${props =>
    props.$tone === 'good'
      ? 'var(--p-done-text, #2e7d32)'
      : props.$tone === 'warn'
        ? 'var(--p-needs-you-text, #936c00)'
        : 'var(--p-failed-text, #c62828)'};
`

const ScoreRight = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const ScoreLabel = styled.div`
  font-size: 13px;
  font-weight: 600;
`

const ScoreTrack = styled.div`
  height: 6px;
  border-radius: 2px;
  background: var(--n-panel, var(--pure-chrome-well));
  overflow: hidden;
`

const ScoreFill = styled.div<{ $tone: 'good' | 'warn' | 'bad' }>`
  height: 100%;
  background: ${props =>
    props.$tone === 'good'
      ? 'var(--p-done-text, #2e7d32)'
      : props.$tone === 'warn'
        ? 'var(--b-amber, #c68a00)'
        : 'var(--p-failed-text, #c62828)'};
`

const ScoreMeta = styled.div`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: var(--n-faint, var(--pure-chrome-soft));
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
`

const SectionHead = styled.div`
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const FixRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

const FixBtn = styled.button`
  ${quiet}
  height: 26px;
  font-size: 11.5px;
`

const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid var(--n-fence, var(--pure-chrome-line));
`

const FindingCard = styled.div<{ $error?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid
    ${props =>
      props.$error
        ? 'var(--p-failed-text, var(--platform-colors-danger))'
        : 'var(--n-line, var(--pure-chrome-line))'};
  border-radius: 3px;
  background: var(--n-panel, var(--platform-colors-surface));
`

const FindingTop = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const SeverityTag = styled.span<{ $error?: boolean }>`
  flex: none;
  padding: 1px 5px;
  border-radius: 2px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  background: ${props =>
    props.$error
      ? 'var(--p-failed-text, #c62828)'
      : 'var(--n-selected, var(--pure-chrome-selection))'};
  color: ${props => (props.$error ? '#ffffff' : 'var(--n-ink, var(--platform-colors-text))')};
`

const FindingMsg = styled.span`
  font-size: 12.5px;
  font-weight: 600;
`

const FindingFix = styled.div`
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const JumpBtn = styled.button`
  align-self: flex-start;
  margin-top: 2px;
  padding: 3px 8px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-sheet, var(--pure-chrome-surface));
  color: ${ACCENT};
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    border-color: ${ACCENT};
  }
`

const CleanState = styled.div`
  padding: 16px;
  border: 1px dashed var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  font-size: 12.5px;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const QuietBtn = styled.button`
  ${quiet}
  height: 26px;
  font-size: 11.5px;
`

export const PrimaryActionBtn = styled.button`
  ${quiet}
  ${primaryLook}
`
