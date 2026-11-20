// frontend/src/chartData.js
// Pure helpers that turn API data into chart rows (tested in
// chartData.test.js). No React and no Recharts here.

// ---------------------------------------------------------------------------
// Game rules mirror
// ---------------------------------------------------------------------------
// The source of truth is ml/game_rules.py (sequence_length, deadline_seconds).
// The browser cannot import Python, so these two one-liners are mirrored here
// and the unit test compares them with values printed by game_rules.py.
const BASE_DEADLINE_SEC = 3.0
const DEADLINE_REDUCTION_PER_LEVEL = 0.2
const MIN_DEADLINE_SEC = 1.5

export function sequenceLength(level) {
  return level + 2
}

// Seconds allowed for ONE press at this level.
export function deadlineSeconds(level) {
  return Math.max(MIN_DEADLINE_SEC, BASE_DEADLINE_SEC - DEADLINE_REDUCTION_PER_LEVEL * (level - 1))
}

// ---------------------------------------------------------------------------
// Attempt results
// ---------------------------------------------------------------------------
// Colours checked with the dataviz palette validator on the app's dark
// surfaces (#0f172a and #070a16): colour-blind separation, normal-vision
// separation and >= 3:1 contrast all pass. Classic green/red was rejected
// because it fails for red-green colour blindness. The colour is never the
// only signal: every result also has its text label (legend, tooltip, table),
// and timeouts are drawn hollow with a "Timeout" label.
export const RESULT_STYLES = {
  pass: { label: "Pass", color: "#199e70" },
  wrong: { label: "Wrong", color: "#d95926" },
  timeout: { label: "Timeout", color: "#3987e5" },
}

// One chart/table row per attempt.
//   chartValue: response time in seconds, or for a timeout the FULL deadline
//   of the sequence (presses x seconds per press), so a timeout is a full bar
//   and never a zero-height bar.
export function toAttemptRows(attempts) {
  if (!Array.isArray(attempts)) return []

  return attempts
    .map((attempt, index) => {
      const level = Number(attempt.level)
      const presses = sequenceLength(level)
      const deadlineSec = presses * deadlineSeconds(level)
      const isTimeout = attempt.result === "timeout"
      const responseSec = isTimeout ? null : Number(attempt.response_ms) / 1000

      return {
        attemptNo: Number.isInteger(attempt.attempt_no) ? attempt.attempt_no : index + 1,
        level,
        sequenceLength: presses,
        result: attempt.result,
        responseMs: isTimeout ? null : attempt.response_ms,
        responseSec,
        deadlineSec,
        chartValue: isTimeout ? deadlineSec : responseSec,
        isTimeout,
      }
    })
    .sort((a, b) => a.attemptNo - b.attemptNo)
}

// ---------------------------------------------------------------------------
// Admin charts
// ---------------------------------------------------------------------------
function compact(points) {
  return points === 0 ? "0" : `${points / 1000}K`
}

// /api/stats/summary score_histogram -> [{label:"1K", range:"1,000-1,999", count}]
export function histogramRows(bins) {
  if (!Array.isArray(bins)) return []

  return bins.map((bin) => ({
    label: compact(bin.min),
    range: `${bin.min.toLocaleString("en-US")}-${bin.max.toLocaleString("en-US")}`,
    count: bin.count,
  }))
}

// {"Pro":4} + ["Beginner","Intermediate","Pro"] -> rows in that fixed order.
export function countsToRows(counts, order) {
  return order.map((name) => ({ name, count: Number(counts?.[name]) || 0 }))
}
