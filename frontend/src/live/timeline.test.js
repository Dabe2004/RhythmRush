// frontend/src/live/timeline.test.js

import { describe, expect, it } from "vitest"

import { countdownTimeline, nextBoundary, sequenceTimeline, stepAt } from "./timeline"

describe("sequenceTimeline", () => {
  it("lights cue i at i * (cue + gap) for cue ms", () => {
    const { steps, duration } = sequenceTimeline([1, 4, 2], 500, 200)
    expect(steps).toEqual([
      { index: 0, button: 1, on: 0, off: 500 },
      { index: 1, button: 4, on: 700, off: 1200 },
      { index: 2, button: 2, on: 1400, off: 1900 },
    ])
    expect(duration).toBe(2100)
    expect(stepAt(steps, 0).button).toBe(1)
    expect(stepAt(steps, 600)).toBeNull() // the gap
    expect(stepAt(steps, 1450).button).toBe(2)
    expect(stepAt(steps, 2000)).toBeNull()
    expect(nextBoundary(steps, 600)).toBe(700)
    expect(nextBoundary(steps, 1900)).toBe(Infinity)
  })

  it("handles the longest sequence (17 cues, level 15)", () => {
    const sequence = Array.from({ length: 17 }, (_, i) => (i % 6) + 1)
    const { steps, duration } = sequenceTimeline(sequence, 500, 200)
    expect(steps).toHaveLength(17)
    expect(steps[16]).toEqual({ index: 16, button: 5, on: 11200, off: 11700 })
    expect(duration).toBe(11900)
  })
})

describe("countdownTimeline", () => {
  it("counts up 1, 2, 3 one step each, then GO!", () => {
    const { steps, duration } = countdownTimeline(3, 1000, 600)
    expect(steps.map((s) => [s.label, s.at, s.until])).toEqual([
      ["1", 0, 1000],
      ["2", 1000, 2000],
      ["3", 2000, 3000],
      ["GO!", 3000, 3600],
    ])
    expect(duration).toBe(3600)
    expect(stepAt(steps, 2999).label).toBe("3")
    expect(stepAt(steps, 3000).label).toBe("GO!")
  })

  it("follows the event's seconds and step, and ends with BEGIN! before a turn", () => {
    const { steps } = countdownTimeline(5, 500, 600, "BEGIN!")
    expect(steps.map((s) => s.label)).toEqual(["1", "2", "3", "4", "5", "BEGIN!"])
    expect(steps[4].at).toBe(2000)
  })
})
