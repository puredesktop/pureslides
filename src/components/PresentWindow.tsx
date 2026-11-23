/**
 * Presenting — Pro Presenter Console & Dual-Window / Broadcast Stage.
 *
 * Supports:
 * - Fullscreen audience view + Presenter Console (`S`)
 * - Dual-Window Audience Stage (`window.open` + `BroadcastChannel` + `postMessage` sync)
 * - Live Laser Pointer (`L`) tracked on stage & broadcast to audience window + PureCloud SSE
 * - Blackout (`B`) & Whiteout (`W`)
 * - Quick Slide Jump Grid (`G`)
 * - Speaker Notes A− / A+ font-size controls
 * - Visual Pacing Bar comparing elapsed time % vs slide progress % against target minutes
 * - Optional PureCloud live broadcast toggle calling `setPresenterState`
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { styled } from 'styled-components'
import { SlideFrame } from './SlideFrame'
import type { DeckGeometry } from '../types'
import type { Slide } from '../lib/slides'
import { inlineAssetUrls, picturesOnly, type PreviewAssetMap } from '../lib/packageAssets'
import { sanitizeForSameOriginMeasure } from '../lib/sanitizeDeck'
import { BUILD_CSS, SEEK_CORE_FN } from '../lib/slideSeek'
import { setPresenterState } from '../lib/pureCloudDeckClient'
import {
  createRehearsal,
  formatDuration,
  rehearsalReducer,
  rehearsalReport,
} from '../lib/rehearsal'

const AUDIENCE_CHANNEL = 'pureslides-audience-sync'

interface AudienceSyncPayload {
  type: 'pureslides:audience-sync'
  slide: number
  step: number
  blacked: boolean
  whited: boolean
  laser: { x: number; y: number } | null
}

function buildAudienceStageHtml(
  html: string,
  geometry: DeckGeometry,
  previews: PreviewAssetMap | undefined,
  initial: AudienceSyncPayload,
): string {
  const safeHtml = sanitizeForSameOriginMeasure(html)
  const inlined = previews ? inlineAssetUrls(safeHtml, picturesOnly(previews)) : safeHtml
  let headStyles = ''
  let deckMarkup = ''
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(inlined, 'text/html')
    headStyles = [...doc.querySelectorAll('head style')].map(s => s.outerHTML).join('\n')
    const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
    deckMarkup = root ? root.outerHTML : doc.body.innerHTML
  } else {
    deckMarkup = inlined
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>PureSlides — Audience Stage</title>
${headStyles}
  <style>
    ${BUILD_CSS}
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
    #stage { position: fixed; inset: 0; display: grid; place-items: center; }
    #vp { position: relative; width: ${geometry.width}px; height: ${geometry.height}px; transform-origin: center center; background: #fff; }
    #laser { position: absolute; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: radial-gradient(circle, #ff3b30 0%, rgba(255,59,48,0.85) 45%, rgba(255,59,48,0) 75%); box-shadow: 0 0 18px 6px rgba(255,59,48,0.7); pointer-events: none; display: none; z-index: 99; }
    #veil { position: fixed; inset: 0; z-index: 100; display: none; }
  </style>
</head>
<body>
  <div id="stage">
    <div id="vp">
      ${deckMarkup}
      <div id="laser"></div>
    </div>
  </div>
  <div id="veil"></div>
  <script>
  (function () {
    ${SEEK_CORE_FN}
    var W = ${geometry.width};
    var H = ${geometry.height};
    var vp = document.getElementById('vp');
    var root = document.querySelector('[data-deck-id]') || document.getElementById('deck');
    var laser = document.getElementById('laser');
    var veil = document.getElementById('veil');
    stashAuthorStylesIn(root);
    document.documentElement.setAttribute('data-live', 'true');

    function fit() {
      var scale = Math.min(window.innerWidth / W, window.innerHeight / H);
      vp.style.transform = 'scale(' + scale + ')';
    }
    function applySync(msg) {
      if (!msg || msg.type !== 'pureslides:audience-sync') return;
      renderSlideIn(root, msg.slide || 0, msg.step || 0);
      if (msg.blacked) {
        veil.style.display = 'block';
        veil.style.background = '#000000';
      } else if (msg.whited) {
        veil.style.display = 'block';
        veil.style.background = '#ffffff';
      } else {
        veil.style.display = 'none';
      }
      if (msg.laser && typeof msg.laser.x === 'number' && typeof msg.laser.y === 'number') {
        laser.style.display = 'block';
        laser.style.left = (msg.laser.x * 100) + '%';
        laser.style.top = (msg.laser.y * 100) + '%';
      } else {
        laser.style.display = 'none';
      }
    }
    window.addEventListener('resize', fit);
    window.addEventListener('message', function (e) { applySync(e.data); });
    if (typeof BroadcastChannel !== 'undefined') {
      var ch = new BroadcastChannel('${AUDIENCE_CHANNEL}');
      ch.onmessage = function (e) { applySync(e.data); };
    }
    fit();
    applySync(${JSON.stringify(initial)});
  })();
  </script>
</body>
</html>`
}

export interface PresentWindowProps {
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
  /** Apply recorded per-slide rehearsal seconds back to the deck's data-seconds. */
  onApplyTimings?: (secondsBySlide: number[]) => void
  /** Active PureCloud published deck id, when live web broadcast is available. */
  publishedDeckId?: string | null
  /** Initial / controlled live broadcast toggle. */
  broadcastLive?: boolean
  onBroadcastLiveChange?: (enabled: boolean) => void
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
  onApplyTimings,
  publishedDeckId = null,
  broadcastLive = false,
  onBroadcastLiveChange,
}: PresentWindowProps): React.ReactElement | null {
  const [at, setAt] = useState({ slide: from, step: 0 })
  const [presenter, setPresenter] = useState(false)
  const [arrows, setArrows] = useState(false)
  const [blacked, setBlacked] = useState(false)
  const [whited, setWhited] = useState(false)
  const [laserOn, setLaserOn] = useState(false)
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null)
  const [gridOpen, setGridOpen] = useState(false)
  const [notesFontSize, setNotesFontSize] = useState(19)
  const [localBroadcast, setLocalBroadcast] = useState(broadcastLive)
  const [audienceOpen, setAudienceOpen] = useState(false)
  const [idle, setIdle] = useState(false)
  const [now, setNow] = useState(0)
  const [targetInput, setTargetInput] = useState('')
  const [jumpDisplay, setJumpDisplay] = useState('')
  const [timingsApplied, setTimingsApplied] = useState(false)
  const [rehearsal, dispatchRehearsal] = useReducer(
    rehearsalReducer,
    null,
    () => createRehearsal(slides.length, from, performance.now()),
  )
  const stageRef = useRef<HTMLDivElement>(null)
  const slideWrapRef = useRef<HTMLDivElement>(null)
  const audienceWinRef = useRef<Window | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const lastCloudLaserAtRef = useRef(0)
  const [scale, setScale] = useState(0.5)
  const jump = useRef('')
  const pendingRehearsalStart = useRef<number | null>(null)
  const trackedSlide = useRef<number | null>(null)
  const enteredFullscreenRef = useRef(false)

  useEffect(() => {
    setLocalBroadcast(broadcastLive)
  }, [broadcastLive])

  const isBroadcasting = Boolean(publishedDeckId && localBroadcast)

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
        const previous = slides[position.slide - 1]
        return { slide: position.slide - 1, step: previous?.steps ?? 0 }
      })
    },
    [slides],
  )

  // BroadcastChannel lifecycle for dual-window audience stage
  useEffect(() => {
    if (!open) {
      if (audienceWinRef.current && !audienceWinRef.current.closed) {
        try {
          audienceWinRef.current.close()
        } catch {
          /* ignore */
        }
      }
      audienceWinRef.current = null
      setAudienceOpen(false)
      channelRef.current?.close()
      channelRef.current = null
      return
    }
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channelRef.current = new BroadcastChannel(AUDIENCE_CHANNEL)
      } catch {
        channelRef.current = null
      }
    }
    return () => {
      channelRef.current?.close()
      channelRef.current = null
    }
  }, [open])

  const syncPayload: AudienceSyncPayload = useMemo(
    () => ({
      type: 'pureslides:audience-sync',
      slide: at.slide,
      step: at.step,
      blacked,
      whited,
      laser: laserOn ? laserPos : null,
    }),
    [at.slide, at.step, blacked, whited, laserOn, laserPos],
  )

  // Push live state to Audience Window via BroadcastChannel + postMessage
  useEffect(() => {
    if (!open) return
    try {
      channelRef.current?.postMessage(syncPayload)
    } catch {
      /* ignore */
    }
    if (audienceWinRef.current && !audienceWinRef.current.closed) {
      try {
        audienceWinRef.current.postMessage(syncPayload, '*')
      } catch {
        /* ignore */
      }
    } else if (audienceOpen) {
      setAudienceOpen(false)
    }
  }, [open, syncPayload, audienceOpen])

  // Push live state to PureCloud SSE viewers when "Broadcast live" is enabled
  useEffect(() => {
    if (!open || !isBroadcasting || !publishedDeckId) return
    void setPresenterState({
      id: publishedDeckId,
      slideIndex: at.slide,
      step: at.step,
      blacked,
      whited,
      laser: laserOn ? laserPos : null,
      following: true,
    }).catch(() => {
      /* fail silently during live presentation */
    })
  }, [open, isBroadcasting, publishedDeckId, at.slide, at.step, blacked, whited, laserOn])

  // Throttled laser-only updates to PureCloud SSE
  useEffect(() => {
    if (!open || !isBroadcasting || !publishedDeckId || !laserOn) return
    const t = Date.now()
    if (t - lastCloudLaserAtRef.current < 80) return
    lastCloudLaserAtRef.current = t
    void setPresenterState({
      id: publishedDeckId,
      slideIndex: at.slide,
      step: at.step,
      blacked,
      whited,
      laser: laserPos,
      following: true,
    }).catch(() => {})
  }, [open, isBroadcasting, publishedDeckId, laserOn, laserPos, at.slide, at.step, blacked, whited])

  const openAudienceWindow = useCallback(() => {
    const popup = window.open('', 'pureslides-audience', 'width=1280,height=720')
    if (!popup) return
    audienceWinRef.current = popup
    setAudienceOpen(true)
    setPresenter(true)
    try {
      popup.document.open()
      popup.document.write(buildAudienceStageHtml(html, geometry, previews, syncPayload))
      popup.document.close()
    } catch {
      /* fallback when popup cannot be written */
    }
  }, [html, geometry, previews, syncPayload])

  // Opening starts the clock and the deck; closing hands the position back.
  useEffect(() => {
    if (!open) return
    const start = Number.isFinite(from)
      ? Math.max(0, Math.min(Math.floor(from), slides.length - 1))
      : 0
    setAt({ slide: start, step: 0 })
    jump.current = ''
    setJumpDisplay('')
    setBlacked(false)
    setWhited(false)
    setLaserOn(false)
    setLaserPos(null)
    setGridOpen(false)
    setTimingsApplied(false)
    const started = performance.now()
    pendingRehearsalStart.current = start
    trackedSlide.current = null
    dispatchRehearsal({ type: 'reset', slide: start, slideCount: slides.length, now: started })
    setTargetInput('')
    setNow(started)
  }, [open, from, slides.length])

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

  useEffect(() => {
    if (!open) return
    enteredFullscreenRef.current = false
    const target = document.documentElement
    const req = target.requestFullscreen?.({ navigationUI: 'hide' })
    void req?.then(
      () => {
        enteredFullscreenRef.current = true
      },
      () => {
        /* refused, or already fullscreen */
      },
    )
    return () => {
      enteredFullscreenRef.current = false
      if (document.fullscreenElement === target) {
        void document.exitFullscreen?.().catch(() => {})
      }
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onChange = (): void => {
      if (document.fullscreenElement === document.documentElement) {
        enteredFullscreenRef.current = true
        return
      }
      if (enteredFullscreenRef.current && !document.fullscreenElement) {
        enteredFullscreenRef.current = false
        onClose()
      }
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

  const handleKey = useCallback(
    (key: string): boolean => {
      if (!open) return false
      if (key === 'Escape') {
        if (gridOpen) {
          setGridOpen(false)
          return true
        }
        onClose()
        return true
      }
      if (/^[0-9]$/.test(key)) {
        jump.current += key
        setJumpDisplay(jump.current)
        return true
      }
      if (key === 'Enter' && jump.current) {
        const wanted = Number(jump.current) - 1
        jump.current = ''
        setJumpDisplay('')
        if (wanted >= 0 && wanted < slides.length)
          setAt({ slide: wanted, step: 0 })
        return true
      }
      if (jump.current) {
        jump.current = ''
        setJumpDisplay('')
      }
      const lower = key.length === 1 ? key.toLowerCase() : key
      if (lower === 'g') {
        setGridOpen(shown => !shown)
        return true
      }
      if (gridOpen) return false
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'n'].includes(lower)) go(1)
      else if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp', 'p'].includes(lower)) go(-1)
      else if (key === 'Home') setAt({ slide: 0, step: 0 })
      else if (key === 'End') {
        const last = Math.max(0, slides.length - 1)
        setAt({ slide: last, step: slides[last]?.steps ?? 0 })
      } else if (lower === 'b' || lower === '.') {
        setBlacked(black => {
          const next = !black
          if (next) setWhited(false)
          return next
        })
      } else if (lower === 'w') {
        setWhited(white => {
          const next = !white
          if (next) setBlacked(false)
          return next
        })
      } else if (lower === 'l') {
        setLaserOn(on => {
          const next = !on
          if (!next) setLaserPos(null)
          return next
        })
      } else if (lower === 's') setPresenter(view => !view)
      else if (lower === 'a') setArrows(shown => !shown)
      else if (lower === 'r') {
        const resetAt = performance.now()
        dispatchRehearsal({ type: 'reset', slide: at.slide, slideCount: slides.length, now: resetAt })
        setNow(resetAt)
        setTimingsApplied(false)
      } else return false
      return true
    },
    [open, gridOpen, go, slides, onClose, at.slide],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      const inField =
        event.target instanceof Element &&
        Boolean(event.target.closest('input, textarea, select, [contenteditable="true"]'))
      if (inField) {
        if (event.key === 'Escape' && event.target instanceof HTMLElement) {
          event.target.blur()
          event.preventDefault()
        }
        return
      }
      if (handleKey(event.key)) event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, handleKey])

  useEffect(() => {
    if (!open) return
    setAt(position => {
      const slide = Math.max(0, Math.min(position.slide, slides.length - 1))
      const step = Math.min(position.step, slides[slide]?.steps ?? 0)
      return slide === position.slide && step === position.step
        ? position
        : { slide, step }
    })
  }, [open, slides])

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

  const hasCurrent = Boolean(current)
  useEffect(() => {
    if (!open || !hasCurrent) return
    const measure = (): void => {
      const box = stageRef.current?.getBoundingClientRect()
      if (!box || !box.width || !box.height) return
      setScale(
        Math.min(box.width / geometry.width, box.height / geometry.height),
      )
    }
    measure()
    window.addEventListener('resize', measure)
    document.addEventListener('fullscreenchange', measure)
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && stageRef.current) {
      observer = new ResizeObserver(measure)
      observer.observe(stageRef.current)
    }
    return () => {
      window.removeEventListener('resize', measure)
      document.removeEventListener('fullscreenchange', measure)
      observer?.disconnect()
    }
  }, [open, hasCurrent, presenter, geometry.width, geometry.height])

  const report = useMemo(() => rehearsalReport(rehearsal, now), [rehearsal, now])
  const targetMilliseconds = useMemo(() => {
    const minutes = Number(targetInput)
    return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : null
  }, [targetInput])

  const handleLaserMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!laserOn) return
      const box = slideWrapRef.current?.getBoundingClientRect()
      if (!box || !box.width || !box.height) return
      const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width))
      const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))
      setLaserPos({ x, y })
    },
    [laserOn],
  )

  if (!open || !current) return null

  const progress = ((at.slide + 1) / slides.length) * 100
  const elapsedPct = targetMilliseconds
    ? Math.min(100, (report.totalMilliseconds / targetMilliseconds) * 100)
    : null
  const paceDelta = elapsedPct !== null ? progress - elapsedPct : 0
  const paceState: 'ahead' | 'on-pace' | 'behind' =
    paceDelta > 8 ? 'ahead' : paceDelta < -8 ? 'behind' : 'on-pace'

  const renderStageSlide = () => (
    <SlideWrap
      ref={slideWrapRef}
      $laser={laserOn}
      onMouseMove={handleLaserMove}
      onMouseLeave={() => {
        if (laserOn) setLaserPos(null)
      }}
    >
      <SlideFrame
        html={html}
        slide={at.slide}
        step={at.step}
        geometry={geometry}
        width={geometry.width * scale}
        previews={previews}
        live
        onKeyDown={handleKey}
      />
      {laserOn ? (
        <LaserCapture aria-label="Laser pointer surface" />
      ) : null}
      {laserOn && laserPos ? (
        <LaserDot
          data-laser-dot
          style={{
            left: `${laserPos.x * 100}%`,
            top: `${laserPos.y * 100}%`,
          }}
        />
      ) : null}
    </SlideWrap>
  )

  return (
    <Scrim $presenter={presenter} $whited={!presenter && whited}>
      {presenter ? (
        <Presenter>
          <PresenterMain>
            <PresenterBar>
              <Label>
                Now · slide {at.slide + 1} of {slides.length}
                {steps ? ` · step ${at.step} of ${steps}` : ''}
                {blacked ? ' · BLACKOUT (B)' : ''}
                {whited ? ' · WHITEOUT (W)' : ''}
                {laserOn ? ' · LASER ON (L)' : ''}
              </Label>
              <span style={{ flex: 1 }} />
              <RehearsalButton
                type="button"
                $active={audienceOpen}
                onClick={openAudienceWindow}
                title="Open a synchronized audience-only stage window for a second screen"
              >
                {audienceOpen ? 'Audience Window (Synced)' : 'Open Audience Window'}
              </RehearsalButton>
              <RehearsalButton
                type="button"
                $active={laserOn}
                onClick={() => setLaserOn(v => !v)}
                title="Toggle laser pointer (L)"
              >
                Laser (L)
              </RehearsalButton>
              <RehearsalButton
                type="button"
                $active={blacked}
                onClick={() => {
                  setBlacked(b => {
                    if (!b) setWhited(false)
                    return !b
                  })
                }}
              >
                Black (B)
              </RehearsalButton>
              <RehearsalButton
                type="button"
                $active={whited}
                onClick={() => {
                  setWhited(w => {
                    if (!w) setBlacked(false)
                    return !w
                  })
                }}
              >
                White (W)
              </RehearsalButton>
              <RehearsalButton
                type="button"
                $active={gridOpen}
                onClick={() => setGridOpen(g => !g)}
              >
                Grid (G)
              </RehearsalButton>
              {publishedDeckId ? (
                <RehearsalButton
                  type="button"
                  $active={localBroadcast}
                  onClick={() => {
                    const next = !localBroadcast
                    setLocalBroadcast(next)
                    onBroadcastLiveChange?.(next)
                  }}
                  title="Broadcast slide, step, blackout, whiteout & laser live to PureCloud viewers"
                >
                  {localBroadcast ? '● Broadcasting live' : 'Broadcast live to link'}
                </RehearsalButton>
              ) : null}
            </PresenterBar>
            <PresenterStage ref={stageRef}>
              {blacked ? (
                <EndNote>Audience screen is blacked out. Press B to resume.</EndNote>
              ) : whited ? (
                <WhiteoutNote>Audience screen is whited out. Press W to resume.</WhiteoutNote>
              ) : (
                renderStageSlide()
              )}
            </PresenterStage>
            <Bars>
              {slides.map((slide, index) => (
                <Bar key={slide.index} $on={index <= at.slide} />
              ))}
            </Bars>
          </PresenterMain>
          <PresenterSide>
            <div>
              <Label>
                {at.step < steps
                  ? `Next · build step ${at.step + 1} of ${steps}`
                  : 'Next'}
              </Label>
              <NextBox>
                {at.step < steps ? (
                  <SlideFrame
                    html={html}
                    slide={at.slide}
                    step={at.step + 1}
                    geometry={geometry}
                    width={260}
                    previews={previews}
                  />
                ) : slides[at.slide + 1] ? (
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
              <NotesHead>
                <Label>Notes</Label>
                <NotesControls>
                  <RehearsalButton
                    type="button"
                    aria-label="Decrease notes font size"
                    onClick={() => setNotesFontSize(sz => Math.max(13, sz - 2))}
                  >
                    A−
                  </RehearsalButton>
                  <RehearsalButton
                    type="button"
                    aria-label="Increase notes font size"
                    onClick={() => setNotesFontSize(sz => Math.min(32, sz + 2))}
                  >
                    A+
                  </RehearsalButton>
                </NotesControls>
              </NotesHead>
              <Notes $size={notesFontSize}>
                {current.notes || 'No notes for this slide.'}
              </Notes>
            </NotesBlock>
            <Clock>
              <Elapsed>{formatDuration(report.totalMilliseconds)}</Elapsed>
              <Label>{rehearsal.paused ? 'paused' : 'rehearsal total'}</Label>
              <span style={{ flex: 1 }} />
              {steps ? (
                <Label>
                  step {at.step} of {steps}
                </Label>
              ) : null}
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
                  {onApplyTimings && report.totalMilliseconds >= 1000 ? (
                    <RehearsalButton
                      type="button"
                      onClick={() => {
                        const seconds = slides.map((slide, index) => {
                          const ms = report.slides[index]?.milliseconds ?? 0
                          return ms >= 500 ? Math.max(1, Math.round(ms / 1000)) : slide.seconds
                        })
                        onApplyTimings(seconds)
                        setTimingsApplied(true)
                      }}
                    >
                      {timingsApplied ? 'Timings applied' : 'Apply timings'}
                    </RehearsalButton>
                  ) : null}
                  <RehearsalButton
                    type="button"
                    onClick={() => {
                      const resetAt = performance.now()
                      dispatchRehearsal({ type: 'reset', slide: at.slide, slideCount: slides.length, now: resetAt })
                      setNow(resetAt)
                      setTimingsApplied(false)
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
              {elapsedPct !== null ? (
                <PacingCard aria-label="Pacing bar">
                  <PacingHead>
                    <Label>Pacing</Label>
                    <PaceBadge $state={paceState}>
                      {paceState === 'ahead'
                        ? 'Ahead of pace'
                        : paceState === 'behind'
                          ? 'Behind pace'
                          : 'On pace'}
                    </PaceBadge>
                  </PacingHead>
                  <PaceRow>
                    <span>Slides {Math.round(progress)}%</span>
                    <PaceTrack>
                      <PaceBar $kind="slide" style={{ width: `${progress}%` }} />
                    </PaceTrack>
                  </PaceRow>
                  <PaceRow>
                    <span>Time {Math.round(elapsedPct)}%</span>
                    <PaceTrack>
                      <PaceBar $kind="time" $state={paceState} style={{ width: `${elapsedPct}%` }} />
                    </PaceTrack>
                  </PaceRow>
                </PacingCard>
              ) : null}
              <ReportTable aria-label="Rehearsal timing report">
                <ReportHead>
                  <span>Slide</span>
                  <span>Time</span>
                  <span>Visits</span>
                </ReportHead>
                {slides.map((slide, index) => (
                  <ReportRow
                    key={slide.index}
                    role="button"
                    tabIndex={0}
                    aria-current={index === at.slide ? 'true' : undefined}
                    onClick={() => setAt({ slide: index, step: 0 })}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        setAt({ slide: index, step: 0 })
                      }
                    }}
                  >
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
          {blacked || whited ? null : renderStageSlide()}
        </Stage>
      )}

      {gridOpen ? (
        <JumpGridOverlay role="dialog" aria-label="Quick slide jump grid" onClick={() => setGridOpen(false)}>
          <JumpGridPanel onClick={e => e.stopPropagation()}>
            <JumpGridHead>
              <Label>Jump to slide ({slides.length})</Label>
              <RehearsalButton type="button" onClick={() => setGridOpen(false)}>
                Close (Esc)
              </RehearsalButton>
            </JumpGridHead>
            <JumpGridCards>
              {slides.map((s, idx) => (
                <JumpCard
                  key={s.index}
                  type="button"
                  $active={idx === at.slide}
                  onClick={() => {
                    setAt({ slide: idx, step: 0 })
                    setGridOpen(false)
                  }}
                >
                  <SlideFrame
                    html={html}
                    slide={idx}
                    step={s.steps}
                    geometry={geometry}
                    width={200}
                    previews={previews}
                  />
                  <JumpCardMeta>
                    <span>{String(idx + 1).padStart(2, '0')}</span>
                    <strong>{s.headline || `Slide ${idx + 1}`}</strong>
                  </JumpCardMeta>
                </JumpCard>
              ))}
            </JumpGridCards>
          </JumpGridPanel>
        </JumpGridOverlay>
      ) : null}

      <Rail style={{ opacity: idle ? 0 : 1 }}>
        <Progress style={{ width: `${progress}%` }} />
      </Rail>
      <Counter style={{ opacity: idle && !jumpDisplay ? 0 : 1 }}>
        {jumpDisplay ? <span>Go to slide {jumpDisplay}⏎</span> : null}
        {laserOn ? <LivePill>LASER</LivePill> : null}
        {isBroadcasting ? <LivePill>LIVE</LivePill> : null}
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
        ← → step · B black · W white · L laser · G grid · S presenter · A arrows · R reset · Esc end
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

const Scrim = styled.div<{ $presenter: boolean; $whited?: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 60;
  background: ${props =>
    props.$presenter ? '#0e0e11' : props.$whited ? '#ffffff' : '#000000'};
`

const Stage = styled.div`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
`

const SlideWrap = styled.div<{ $laser: boolean }>`
  position: relative;
  display: inline-block;
  cursor: ${props => (props.$laser ? 'none' : 'default')};
`

const LaserCapture = styled.div`
  position: absolute;
  inset: 0;
  z-index: 5;
  cursor: none;
`

const LaserDot = styled.div`
  position: absolute;
  z-index: 6;
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
  border-radius: 50%;
  background: radial-gradient(circle, #ff3b30 0%, rgba(255, 59, 48, 0.85) 45%, rgba(255, 59, 48, 0) 75%);
  box-shadow: 0 0 16px 5px rgba(255, 59, 48, 0.65);
  pointer-events: none;
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

const PresenterBar = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
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
  gap: 16px;
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

const WhiteoutNote = styled.div`
  padding: 26px 32px;
  border-radius: 3px;
  background: #ffffff;
  color: #14171a;
  font-size: 14px;
  font-weight: 600;
`

const NotesBlock = styled.div`
  flex: 1;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const NotesHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const NotesControls = styled.div`
  display: flex;
  gap: 4px;
`

const Notes = styled.div<{ $size: number }>`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid #26262c;
  border-radius: var(--pure-chrome-radius, 3px);
  background: #15151a;
  padding: 16px 18px;
  font-size: ${props => props.$size}px;
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

const RehearsalButton = styled.button<{ $active?: boolean }>`
  border: 1px solid ${props => (props.$active ? '#c79a1e' : '#34343d')};
  border-radius: var(--pure-chrome-radius, 3px);
  background: ${props => (props.$active ? '#33290e' : '#1b1b21')};
  color: ${props => (props.$active ? '#ffd666' : '#e8e8ec')};
  padding: 5px 9px;
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: ${props => (props.$active ? '#423512' : '#282831')};
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
  border-radius: var(--pure-chrome-radius, 3px);
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

const PacingCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #26262c;
  border-radius: 3px;
  background: #15151a;
`

const PacingHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const PaceBadge = styled.span<{ $state: 'ahead' | 'on-pace' | 'behind' }>`
  padding: 2px 6px;
  border-radius: 2px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  background: ${props =>
    props.$state === 'behind'
      ? '#4a1b1b'
      : props.$state === 'ahead'
        ? '#1b3d28'
        : '#2b2b33'};
  color: ${props =>
    props.$state === 'behind'
      ? '#ff9b9b'
      : props.$state === 'ahead'
        ? '#9be6b2'
        : '#d5d5db'};
`

const PaceRow = styled.div`
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 10.5px;
  color: #a6a7b0;
`

const PaceTrack = styled.div`
  height: 6px;
  border-radius: 2px;
  background: #25252d;
  overflow: hidden;
`

const PaceBar = styled.div<{ $kind: 'slide' | 'time'; $state?: 'ahead' | 'on-pace' | 'behind' }>`
  height: 100%;
  background: ${props =>
    props.$kind === 'slide'
      ? '#c79a1e'
      : props.$state === 'behind'
        ? '#ef5350'
        : '#66bb6a'};
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
  border-radius: var(--pure-chrome-radius, 3px);
  color: #bfc0c7;
  text-align: right;
  cursor: pointer;

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

const JumpGridOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgb(10 10 14 / 0.88);
  display: grid;
  place-items: center;
  padding: 28px;
`

const JumpGridPanel = styled.div`
  width: min(1040px, 100%);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border: 1px solid #2e2e36;
  border-radius: 3px;
  background: #141418;
  color: #e8e8ec;
  overflow-y: auto;
`

const JumpGridHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const JumpGridCards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(216px, 1fr));
  gap: 14px;
`

const JumpCard = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid ${props => (props.$active ? '#c79a1e' : '#2e2e36')};
  border-radius: 3px;
  background: #1c1c22;
  color: #e8e8ec;
  text-align: left;
  cursor: pointer;
  &:hover {
    border-color: #c79a1e;
  }
`

const JumpCardMeta = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  span {
    font-family: var(--platform-typography-font-family-mono, monospace);
    color: #c79a1e;
    font-size: 11px;
  }
  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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

const LivePill = styled.span`
  padding: 2px 6px;
  border-radius: 2px;
  background: #c62828;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
`

const Dots = styled.div`
  display: flex;
  gap: 4px;
`

const Dot = styled.span<{ $on: boolean }>`
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: ${props =>
    props.$on ? 'rgb(255 255 255 / 0.7)' : 'transparent'};
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
