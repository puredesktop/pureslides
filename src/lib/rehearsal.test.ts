import { describe, expect, it } from 'vitest'
import {
  createRehearsal,
  formatDuration,
  rehearsalReducer,
  rehearsalReport,
} from './rehearsal'

describe('rehearsal timing', () => {
  it('records slide visits and splits time between slides', () => {
    let state = createRehearsal(3, 0, 1000)
    state = rehearsalReducer(state, { type: 'slide', slide: 1, now: 4500 })
    state = rehearsalReducer(state, { type: 'slide', slide: 0, now: 7000 })

    const report = rehearsalReport(state, 9000)
    expect(report.totalMilliseconds).toBe(8000)
    expect(report.slides).toEqual([
      { milliseconds: 5500, visits: 2 },
      { milliseconds: 2500, visits: 1 },
      { milliseconds: 0, visits: 0 },
    ])
  })

  it('does not count paused time and can reset the current rehearsal', () => {
    let state = createRehearsal(2, 0, 0)
    state = rehearsalReducer(state, { type: 'pause', now: 5000 })
    state = rehearsalReducer(state, { type: 'resume', now: 12000 })
    state = rehearsalReducer(state, { type: 'slide', slide: 1, now: 15000 })

    expect(rehearsalReport(state, 18000).totalMilliseconds).toBe(11000)
    expect(rehearsalReport(state, 18000).slides[0]).toEqual({
      milliseconds: 8000,
      visits: 1,
    })
    expect(rehearsalReport(state, 18000).slides[1]).toEqual({
      milliseconds: 3000,
      visits: 1,
    })

    const reset = rehearsalReducer(state, { type: 'reset', slide: 1, slideCount: 2, now: 20000 })
    expect(reset.totalMilliseconds).toBe(0)
    expect(reset.activeSlide).toBe(1)
    expect(reset.slides).toEqual([
      { milliseconds: 0, visits: 0 },
      { milliseconds: 0, visits: 1 },
    ])
  })

  it('formats long and short durations', () => {
    expect(formatDuration(65_000)).toBe('01:05')
    expect(formatDuration(3_725_000)).toBe('1:02:05')
  })
})
