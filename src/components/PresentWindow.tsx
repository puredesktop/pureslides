/**
 * Presenting.
 *
 * The app runs in an iframe, so `position: fixed` covers the iframe and
 * nothing more — a "full screen" deck framed by the shell's tab bar is not
 * presenting, it is a preview. The shell grants the frame `allow="fullscreen"`,
 * so opening asks the browser for real fullscreen and closing gives it back.
 * The overlay still paints edge to edge on its own, so a refused or exited
 * fullscreen degrades to the framed version rather than breaking.
 *
 * Two surfaces from one state: the audience sees the slide and nothing else,
 * the presenter sees what is next, the notes and the clock. Both are driven
 * by the same (slide, step) pair the board uses, so what was rehearsed is
 * what appears.
 *
 * Advancing is step-then-slide: → walks a build to its end before moving on,
 * which is what makes a build worth having. The chrome fades once the room
 * settles, and on-screen arrows are there for a touchscreen or a lectern
 * mouse — off by default, because a keyboard is the real instrument.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { SlideFrame } from './SlideFrame'
import type { DeckGeometry } from '../types'
import type { Slide } from '../lib/slides'
import type { PreviewAssetMap } from '../lib/packageAssets'
import {
  createRehearsal,
  formatDuration,
  rehearsalReducer,
  rehearsalReport,
} from '../lib/rehearsal'

interface PresentWindowProps {
  open: boolean
  onClose: () => void
  html: string
  slides: Slide[]
  geometry: DeckGeometry
  /** Package assets inlined for the frames — pictures and clips. */
  previews?: PreviewAssetMap
  from: number
  /** Kept so leaving the room lands the board where the deck got to. */
  onPositionChange?: (slide: number) => void
}

export function PresentWindow({
  open,
  onClose,
  html,
  slides,
  geometry,
  previews,
  from,
  onPositionChange,
}: PresentWindowProps): React.ReactElement | null {
  const [at, setAt] = useState({ slide: from, step: 0 })
  const [presenter, setPresenter] = useState(false)
  const [arrows, setArrows] = useState(false)
  const [blacked, setBlacked] = useState(false)
  const [idle, setIdle] = useState(false)
  const [now, setNow] = useState(0)
  const [targetInput, setTargetInput] = useState('')
  const [rehearsal, dispatchRehearsal] = useReducer(
    rehearsalReducer,
    null,
    () => createRehearsal(slides.length, from, performance.now()),
  )
  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const jump = useRef('')
  const pendingRehearsalStart = useRef<number | null>(null)
  const trackedSlide = useRef<number | null>(null)

  const current = slides[at.slide]
  const steps = current?.steps ?? 0

  const go = useCallback(
    (direction: 1 | -1) => {
      setAt(position => {
        const slide = slides[position.slide]
        const stepCount = slide?.steps ?? 0
        if (direction === 1) {
          if (position.step < stepCount) {
            return { slide: position.slide, step: position.step + 1 }
          }
          if (position.slide >= slides.length - 1) return position
          return { slide: position.slide + 1, step: 0 }
        }
        if (position.step > 0) {
          return { slide: position.slide, step: position.step - 1 }
        }
        if (position.slide <= 0) return position
        // Stepping back into a slide lands at its END, not its start —
        // otherwise going back re-runs a build the room has already seen.
        const previous = slides[position.slide - 1]
        return { slide: position.slide - 1, step: previous?.steps ?? 0 }
      })
    },
    [slides],
  )

  // Opening starts the clock and the deck; closing hands the position back.
  useEffect(() => {
    if (!open) return
    setAt({ slide: from, step: 0 })
    setBlacked(false)
    const started = performance.now()
    pendingRehearsalStart.current = from
    trackedSlide.current = null
    dispatchRehearsal({ type: 'reset', slide: from, slideCount: slides.length, now: started })
    setTargetInput('')
    setNow(started)
  }, [open, from])

  // The presenter and audience share navigation. Track a slide only after the
  // opening position has landed, so reopening from a different board selection
  // does not count the stale position from the previous session as a visit.
  useEffect(() => {
    if (!open) return
    if (pendingRehearsalStart.current !== null) {
      if (at.slide !== pendingRehearsalStart.current) return
      pendingRehearsalStart.current = null
      trackedSlide.current = at.slide
      return
    }
    if (trackedSlide.current === at.slide) return
    trackedSlide.current = at.slide
    dispatchRehearsal({ type: 'slide', slide: at.slide, now: performance.now() })
  }, [open, at.slide])

  /**
   * Take the whole display, and give it back.
   *
   * Requesting fullscreen needs a user gesture, and opening this window is
   * one — but the request has to happen while that gesture is still live, so
   * it runs in the same effect that opens rather than behind a timer. A
   * refusal is not an error worth showing: the overlay still covers the app.
   */
  useEffect(() => {
    if (!open) return
    const target = document.documentElement
    void target.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {
      /* refused, or already fullscreen — the overlay still covers the app */
    })
    return () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [open])

  // Leaving fullscreen by any route — Esc, the system, a gesture — ends the
  // presentation, so the deck is never left running behind the app chrome.
  useEffect(() => {
    if (!open) return
    const onChange = (): void => {
      if (!document.fullscreenElement) onClose()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const handle = window.setInterval(() => setNow(performance.now()), 500)
    return () => window.clearInterval(handle)
  }, [open])

  useEffect(() => {
    if (open) onPositionChange?.(at.slide)
  }, [open, at.slide, onPositionChange])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      const key = event.key
      if (/^[0-9]$/.test(key)) {
        jump.current += key
        return
      }
      if (key === 'Enter' && jump.current) {
        const wanted = Number(jump.current) - 1
        jump.current = ''
        if (wanted >= 0 && wanted < slides.length) setAt({ slide: wanted, step: 0 })
        return
      }
      jump.current = ''
      if (key === 'ArrowRight' || key === ' ' || key === 'PageDown' || key === 'n') {
        event.preventDefault()
        go(1)
      } else if (key === 'ArrowLeft' || key === 'PageUp' || key === 'p') {
        event.preventDefault()
        go(-1)
      } else if (key === 'Home') {
        setAt({ slide: 0, step: 0 })
      } else if (key === 'End') {
        const last = Math.max(0, slides.length - 1)
        setAt({ slide: last, step: slides[last]?.steps ?? 0 })
      } else if (key === 'b' || key === '.') {
        setBlacked(black => !black)
      } else if (key === 's') {
        setPresenter(view => !view)
      } else if (key === 'a') {
        setArrows(shown => !shown)
      } else if (key === 'r') {
        const resetAt = performance.now()
        dispatchRehearsal({ type: 'reset', slide: at.slide, slideCount: slides.length, now: resetAt })
        setNow(resetAt)
      } else if (key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at.slide, dispatchRehearsal, go, onClose, open, slides])

  // The chrome gets out of the way once the room settles.
  useEffect(() => {
    if (!open) return
    let handle = 0
    const wake = (): void => {
      setIdle(false)
      window.clearTimeout(handle)
      handle = window.setTimeout(() => setIdle(true), 2400)
    }
    wake()
    window.addEventListener('mousemove', wake)
    window.addEventListener('keydown', wake)
    return () => {
      window.clearTimeout(handle)
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const measure = (): void => {
      const box = stageRef.current?.getBoundingClientRect()
      if (!box) return
      setScale(Math.min(box.width / geometry.width, box.height / geometry.height))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, presenter, geometry.width, geometry.height])

  const report = useMemo(() => rehearsalReport(rehearsal, now), [rehearsal, now])
  const targetMilliseconds = useMemo(() => {
    const minutes = Number(targetInput)
    return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : null
  }, [targetInput])

  if (!open || !current) return null

  const progress = ((at.slide + 1) / slides.length) * 100

  return (
    <Scrim $presenter={presenter}>
      {presenter ? (
        <Presenter>
          <PresenterMain>
            <Label>Now · slide {at.slide + 1} of {slides.length}</Label>
            <PresenterStage ref={stageRef}>
              <SlideFrame
                html={html}
                slide={at.slide}
                step={at.step}
                geometry={geometry}
                width={geometry.width * scale}
                previews={previews}
                live
              />
            </PresenterStage>
            <Bars>
              {slides.map((slide, index) => (
                <Bar key={slide.index} $on={index <= at.slide} />
              ))}
            </Bars>
          </PresenterMain>
          <PresenterSide>
            <div>
              <Label>Next</Label>
              <NextBox>
                {slides[at.slide + 1] ? (
                  <SlideFrame
                    html={html}
                    slide={at.slide + 1}
                    step={0}
                    geometry={geometry}
                    width={260}
                    previews={previews}
                  />
                ) : (
                  <EndNote>End of deck</EndNote>
                )}
              </NextBox>
            </div>
            <NotesBlock>
              <Label>Notes</Label>
              <Notes>{current.notes || 'No notes for this slide.'}</Notes>
            </NotesBlock>
            <Clock>
              <Elapsed>{formatDuration(report.totalMilliseconds)}</Elapsed>
              <Label>{rehearsal.paused ? 'paused' : 'rehearsal total'}</Label>
              <span style={{ flex: 1 }} />
              {steps ? <Label>step {at.step} of {steps}</Label> : null}
            </Clock>
            <RehearsalBlock>
              <RehearsalHeader>
                <Label>Timing report</Label>
                <RehearsalActions>
                  <RehearsalButton
                    type="button"
                    onClick={() => {
                      const action = rehearsal.paused ? 'resume' : 'pause'
                      const changedAt = performance.now()
                      dispatchRehearsal({ type: action, now: changedAt })
                      setNow(changedAt)
                    }}
                  >
                    {rehearsal.paused ? 'Resume' : 'Pause'}
                  </RehearsalButton>
                  <RehearsalButton
                    type="button"
                    onClick={() => {
                      const resetAt = performance.now()
                      dispatchRehearsal({ type: 'reset', slide: at.slide, slideCount: slides.length, now: resetAt })
                      setNow(resetAt)
                    }}
                  >
                    Reset
                  </RehearsalButton>
                </RehearsalActions>
              </RehearsalHeader>
              <TargetRow>
                <TargetLabel htmlFor="rehearsal-target">Target (minutes)</TargetLabel>
                <TargetInput
                  id="rehearsal-target"
                  type="number"
                  min="0"
                  step="0.5"
                  inputMode="decimal"
                  placeholder="optional"
                  value={targetInput}
                  onChange={event => setTargetInput(event.currentTarget.value)}
                />
                {targetMilliseconds !== null ? (
                  <TargetStatus $over={report.totalMilliseconds > targetMilliseconds}>
                    {report.totalMilliseconds > targetMilliseconds
                      ? `+${formatDuration(report.totalMilliseconds - targetMilliseconds)}`
                      : `${formatDuration(targetMilliseconds - report.totalMilliseconds)} left`}
                  </TargetStatus>
                ) : null}
              </TargetRow>
              <ReportTable aria-label="Rehearsal timing report">
                <ReportHead>
                  <span>Slide</span>
                  <span>Time</span>
                  <span>Visits</span>
                </ReportHead>
                {slides.map((slide, index) => (
                  <ReportRow key={slide.index} aria-current={index === at.slide ? 'true' : undefined}>
                    <ReportSlide>
                      <ReportNumber>{index + 1}</ReportNumber>
                      <ReportTitle title={slide.headline || `Slide ${index + 1}`}>
                        {slide.headline || `Slide ${index + 1}`}
                      </ReportTitle>
                    </ReportSlide>
                    <ReportValue>{formatDuration(report.slides[index]?.milliseconds ?? 0)}</ReportValue>
                    <ReportValue>{report.slides[index]?.visits ?? 0}</ReportValue>
                  </ReportRow>
                ))}
              </ReportTable>
            </RehearsalBlock>
          </PresenterSide>
        </Presenter>
      ) : (
        <Stage ref={stageRef}>
          {blacked ? null : (
            <SlideFrame
              html={html}
              slide={at.slide}
              step={at.step}
              geometry={geometry}
              width={geometry.width * scale}
              previews={previews}
              live
            />
          )}
        </Stage>
      )}

      <Rail style={{ opacity: idle ? 0 : 1 }}>
        <Progress style={{ width: `${progress}%` }} />
      </Rail>
      <Counter style={{ opacity: idle ? 0 : 1 }}>
        {steps ? (
          <Dots>
            {Array.from({ length: steps + 1 }, (_unused, index) => (
              <Dot key={index} $on={index <= at.step} />
            ))}
          </Dots>
        ) : null}
        <span>
          {at.slide + 1} / {slides.length}
        </span>
      </Counter>
      <Keys style={{ opacity: idle ? 0 : 1 }}>
        ← → step, then slide · B black · S presenter · A arrows · R reset · Esc end
      </Keys>
      {arrows ? (
        <Arrows>
          <Arrow type="button" aria-label="Back" onClick={() => go(-1)}>
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M9 2.5L4.5 7 9 11.5" />
            </svg>
          </Arrow>
          <Arrow type="button" aria-label="Forward" onClick={() => go(1)}>
            <svg width="16" height="16" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 2.5L9.5 7 5 11.5" />
            </svg>
          </Arrow>
        </Arrows>
      ) : null}
    </Scrim>
  )
}

const Scrim = styled.div<{ $presenter: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 60;
  background: ${props => (props.$presenter ? '#0e0e11' : '#000000')};
`

const Stage = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
`

const Presenter = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  gap: 24px;
  padding: 26px;
  color: #e8e8ec;
  overflow: auto;

  @media (max-width: 760px) {
    flex-direction: column;
    gap: 16px;
    padding: 18px;
  }
`

const PresenterMain = styled.div`
  flex: 1.55;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const PresenterStage = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
`

const PresenterSide = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
`

const Label = styled.div`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8b8b93;
`

const NextBox = styled.div`
  margin-top: 8px;
  opacity: 0.9;
`

const EndNote = styled.div`
  padding: 26px 0;
  font-size: 14px;
  color: #6d6f73;
`

const NotesBlock = styled.div`
  flex: 1;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Notes = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid #26262c;
  border-radius: 8px;
  background: #15151a;
  padding: 16px 18px;
  font-size: 19px;
  line-height: 1.55;
  color: #d5d5db;
`

const Clock = styled.div`
  display: flex;
  align-items: baseline;
  gap: 14px;
`

const Elapsed = styled.div`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 40px;
  font-variant-numeric: tabular-nums;
  color: #ffffff;
`

const RehearsalBlock = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const RehearsalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`

const RehearsalActions = styled.div`
  display: flex;
  gap: 6px;
`

const RehearsalButton = styled.button`
  border: 1px solid #34343d;
  border-radius: 6px;
  background: #1b1b21;
  color: #e8e8ec;
  padding: 6px 9px;
  font: inherit;
  font-size: 12px;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: #282831;
  }
`

const TargetRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: #8b8b93;
  font-size: 12px;
`

const TargetLabel = styled.label`
  font-family: var(--platform-typography-font-family-mono, monospace);
  letter-spacing: 0.04em;
`

const TargetInput = styled.input`
  width: 78px;
  border: 1px solid #34343d;
  border-radius: 5px;
  background: #15151a;
  color: #e8e8ec;
  padding: 5px 7px;
  font: inherit;
  font-size: 12px;

  &:focus-visible {
    outline: 2px solid #8b8b93;
    outline-offset: 1px;
  }
`

const TargetStatus = styled.span<{ $over: boolean }>`
  color: ${props => (props.$over ? '#ef9a9a' : '#a9d6b0')};
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
`

const ReportTable = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
`

const ReportHead = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px 42px;
  gap: 8px;
  padding: 0 8px 4px;
  color: #6d6f73;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: right;

  span:first-child {
    text-align: left;
  }
`

const ReportRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px 42px;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 4px 8px;
  border-radius: 5px;
  color: #bfc0c7;
  text-align: right;

  &[aria-current='true'] {
    background: #202027;
    color: #ffffff;
  }
`

const ReportSlide = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: left;
`

const ReportNumber = styled.span`
  flex: 0 0 20px;
  color: #8b8b93;
  font-family: var(--platform-typography-font-family-mono, monospace);
`

const ReportTitle = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ReportValue = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-variant-numeric: tabular-nums;
`

const Bars = styled.div`
  display: flex;
  gap: 4px;
`

const Bar = styled.div<{ $on: boolean }>`
  height: 4px;
  flex: 1;
  border-radius: 2px;
  background: ${props => (props.$on ? '#e8e8ec' : '#33333a')};
`

const Rail = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgb(255 255 255 / 0.12);
  transition: opacity 400ms ease;
`

const Progress = styled.div`
  height: 100%;
  background: rgb(255 255 255 / 0.75);
`

const Counter = styled.div`
  position: absolute;
  top: 14px;
  right: 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 12px;
  color: rgb(255 255 255 / 0.5);
  transition: opacity 400ms ease;
`

const Dots = styled.div`
  display: flex;
  gap: 4px;
`

const Dot = styled.span<{ $on: boolean }>`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: ${props => (props.$on ? 'rgb(255 255 255 / 0.7)' : 'transparent')};
  border: 1px solid rgb(255 255 255 / 0.4);
`

const Keys = styled.div`
  position: absolute;
  bottom: 16px;
  left: 20px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgb(255 255 255 / 0.42);
  transition: opacity 400ms ease;
`

const Arrows = styled.div`
  position: absolute;
  bottom: 14px;
  right: 18px;
  display: flex;
  gap: 8px;
`

const Arrow = styled.button`
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.12);
  color: rgb(255 255 255 / 0.8);
  display: grid;
  place-items: center;
  cursor: pointer;
`
