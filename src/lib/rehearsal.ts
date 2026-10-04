export interface RehearsalSlide {
  milliseconds: number
  visits: number
}

export interface RehearsalState {
  activeSlide: number
  paused: boolean
  totalMilliseconds: number
  activeSince: number | null
  slides: RehearsalSlide[]
}

export type RehearsalAction =
  | { type: 'reset'; slide: number; slideCount: number; now: number }
  | { type: 'slide'; slide: number; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }

function clampSlide(slide: number, slideCount: number): number {
  return Number.isFinite(slide) ? Math.max(0, Math.min(slideCount - 1, Math.floor(slide))) : 0
}

export function createRehearsal(
  slideCount: number,
  slide: number,
  now: number,
): RehearsalState {
  const count = Math.max(0, Math.floor(slideCount))
  const activeSlide = count ? clampSlide(slide, count) : 0
  return {
    activeSlide,
    paused: false,
    totalMilliseconds: 0,
    activeSince: count ? now : null,
    slides: Array.from({ length: count }, (_unused, index) => ({
      milliseconds: 0,
      visits: index === activeSlide ? 1 : 0,
    })),
  }
}

function commitActive(state: RehearsalState, now: number): RehearsalState {
  if (state.paused || state.activeSince === null || !state.slides.length) {
    return state
  }
  const milliseconds = Math.max(0, now - state.activeSince)
  if (!milliseconds) return { ...state, activeSince: now }
  const slides = state.slides.map((slide, index) =>
    index === state.activeSlide
      ? { ...slide, milliseconds: slide.milliseconds + milliseconds }
      : slide,
  )
  return {
    ...state,
    totalMilliseconds: state.totalMilliseconds + milliseconds,
    activeSince: now,
    slides,
  }
}

export function rehearsalReducer(
  state: RehearsalState,
  action: RehearsalAction,
): RehearsalState {
  switch (action.type) {
    case 'reset':
      return createRehearsal(action.slideCount, action.slide, action.now)
    case 'slide': {
      if (!state.slides.length) return state
      const slide = clampSlide(action.slide, state.slides.length)
      const committed = commitActive(state, action.now)
      if (slide === state.activeSlide) return committed
      return {
        ...committed,
        activeSlide: slide,
        activeSince: committed.paused ? null : action.now,
        slides: committed.slides.map((item, index) =>
          index === slide ? { ...item, visits: item.visits + 1 } : item,
        ),
      }
    }
    case 'pause': {
      if (state.paused) return state
      const committed = commitActive(state, action.now)
      return { ...committed, paused: true, activeSince: null }
    }
    case 'resume':
      return state.paused
        ? { ...state, paused: false, activeSince: action.now }
        : state
  }
}

export function rehearsalReport(
  state: RehearsalState,
  now: number,
): RehearsalState {
  return commitActive(state, now)
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (minutes < 60) {
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
  }
  const hours = Math.floor(minutes / 60)
  return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}
