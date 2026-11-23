// frontend/src/chartData.test.js
// Unit tests for the game-rule mirror and the chart-data mapping.

import { describe, expect, it } from "vitest"

import {
  RESULT_STYLES,
  deadlineSeconds,
  sequenceLength,
  toAttemptRows,
} from "./chartData"

// Copied from the output of ml/game_rules.py (the source of truth):
//   python -c "from game_rules import deadline_seconds, sequence_length; ..."
// If game_rules.py changes, regenerate this table and the test will tell you
// whether chartData.js still matches.
const PYTHON_RULES = {
  1: [3, 3.0], 2: [4, 2.8], 3: [5, 2.6], 4: [6, 2.4], 5: [7, 2.2],
  6: [8, 2.0], 7: [9, 1.8],
}

describe("game rules mirror", () => {
  it("matches ml/game_rules.py for every level", () => {
    for (const [level, [length, deadline]] of Object.entries(PYTHON_RULES)) {
      expect(sequenceLength(Number(level))).toBe(length)
      expect(deadlineSeconds(Number(level))).toBeCloseTo(deadline, 10)
    }
  })
})

describe("RESULT_STYLES", () => {
  it("has a label and colour for every attempt result", () => {
    for (const result of ["pass", "wrong", "timeout"]) {
      expect(RESULT_STYLES[result].label).toBeTruthy()
      expect(RESULT_STYLES[result].color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it("uses three different colours", () => {
    const colors = new Set(Object.values(RESULT_STYLES).map((style) => style.color))
    expect(colors.size).toBe(3)
  })
})

describe("toAttemptRows", () => {
  const attempts = [
    { attempt_no: 1, level: 1, result: "pass", response_ms: 4100 },
    { attempt_no: 2, level: 2, result: "wrong", response_ms: 2100 },
    { attempt_no: 3, level: 2, result: "timeout", response_ms: 0 },
  ]

  it("adds sequence length, seconds and the sequence deadline", () => {
    const [pass, wrong] = toAttemptRows(attempts)

    expect(pass).toMatchObject({
      attemptNo: 1,
      level: 1,
      sequenceLength: 3,
      result: "pass",
      responseSec: 4.1,
      deadlineSec: 9, // 3 presses x 3.0 s
      chartValue: 4.1,
      isTimeout: false,
    })
    expect(wrong).toMatchObject({ sequenceLength: 4, responseSec: 2.1, chartValue: 2.1 })
    expect(wrong.deadlineSec).toBeCloseTo(11.2, 10) // 4 x 2.8 s
  })

  it("draws a timeout at the full deadline, never as a zero-height bar", () => {
    const timeout = toAttemptRows(attempts)[2]

    expect(timeout.isTimeout).toBe(true)
    expect(timeout.responseSec).toBeNull()
    expect(timeout.chartValue).toBeCloseTo(11.2, 10)
    expect(timeout.chartValue).toBeGreaterThan(0)
  })

  it("orders by attempt number and falls back to the array position", () => {
    const rows = toAttemptRows([
      { attempt_no: 2, level: 1, result: "pass", response_ms: 1000 },
      { attempt_no: 1, level: 1, result: "wrong", response_ms: 500 },
      { level: 2, result: "pass", response_ms: 3000 },
    ])

    expect(rows.map((row) => row.attemptNo)).toEqual([1, 2, 3])
  })

  it("returns an empty list for missing input", () => {
    expect(toAttemptRows(null)).toEqual([])
    expect(toAttemptRows(undefined)).toEqual([])
  })
})
