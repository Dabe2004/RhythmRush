// frontend/src/live/timeline.js
// Pure timing of what the panel shows, relative to the moment an event
// arrived (docs/LIVE_PROTOCOL.md). Unit tested in timeline.test.js.

// Cue i lights at i * (cue + gap) for cue ms. One playback event, replayed on
// the browser's own clock.
export function sequenceTimeline(sequence, cueMs, gapMs) {
  const period = cueMs + gapMs
  const steps = sequence.map((button, index) => ({
    index,
    button,
    on: index * period,
    off: index * period + cueMs,
  }))
  return { steps, duration: sequence.length * period }
}

// 3, 2, 1 (one step each), then "GO!".
export function countdownTimeline(seconds, stepMs, goMs = 600) {
  const steps = Array.from({ length: seconds }, (_, i) => ({
    label: String(seconds - i),
    at: i * stepMs,
    until: (i + 1) * stepMs,
  }))
  steps.push({ label: "GO!", at: seconds * stepMs, until: seconds * stepMs + goMs })
  return { steps, duration: seconds * stepMs + goMs }
}

// The step showing at time t (ms), or null. Works for both timelines.
export function stepAt(steps, t) {
  return steps.find((step) => t >= (step.on ?? step.at) && t < (step.off ?? step.until)) ?? null
}

// The next on/off boundary after t, or Infinity: when the view must change.
export function nextBoundary(steps, t) {
  let next = Infinity
  for (const step of steps) {
    for (const edge of [step.on ?? step.at, step.off ?? step.until]) {
      if (edge > t && edge < next) next = edge
    }
  }
  return next
}
