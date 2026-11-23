// frontend/src/live/demoGame.js
// /live?demo=1: a scripted game played in the browser, no server and no
// device. It produces the same events as the ESP32 (docs/LIVE_PROTOCOL.md)
// and feeds them to the same liveReducer. The numbers below are a SCRIPT
// (what a device would have sent), not game rules computed by the UI.

import { useCallback, useEffect, useReducer, useRef } from "react"

import { INITIAL_LIVE, liveReducer } from "./liveReducer"

const CUE = 500
const GAP = 200
const STEP = 1000
const GO = 600
const COUNT = 3 * STEP + GO // 1 2 3 GO! (or BEGIN!)
const PAUSE = 1000

// level, attempt, sequence, presses [delay ms, button, ok], then the result
// the "device" reports. The last press of a timeout attempt is the wait.
// After a fail the same level comes back with a NEW pattern.
const PLAN = [
  { level: 1, attempt: 1, deadline: 3000, sequence: [1, 4, 2], presses: [[650, 1], [560, 4], [520, 2]], result: ["pass", 3, 139, 139, 39] },
  { level: 2, attempt: 1, deadline: 2800, sequence: [3, 6, 2, 5], presses: [[700, 3], [640, 6], [600, 4, false]], result: ["wrong", 2, 139, 0, 0] },
  { level: 2, attempt: 2, deadline: 2800, sequence: [5, 1, 4, 6], presses: [[620, 5], [600, 1], [580, 4], [540, 6]], result: ["pass", 2, 372, 233, 33] },
  { level: 3, attempt: 1, deadline: 2600, sequence: [5, 1, 6, 3, 4], presses: [[700, 5], [660, 1], [2600, null]], result: ["timeout", 1, 372, 0, 0] },
  { level: 3, attempt: 2, deadline: 2600, sequence: [2, 6, 1, 5, 3], presses: [[640, 2], [610, 4, false]], result: ["wrong", 0, 372, 0, 0] },
]

// [{ at: ms after start, event }]: game -> per attempt (GO countdown,
// sequence, BEGIN countdown, turn, result) -> game_finished.
export function demoScript(gameId) {
  const out = []
  let t = 0
  const add = (delay, event) => {
    t += delay
    out.push({ at: t, event: { ...event, game_id: gameId, device_id: "DEMO", t_ms: t } })
  }

  add(0, { type: "game_started", lives: 3, level: 1 })
  let pause = 0
  for (const step of PLAN) {
    add(pause, { type: "countdown_started", seconds: 3, step_ms: STEP, then: "watch", level: step.level })
    add(COUNT, { type: "playback_started", level: step.level, attempt: step.attempt, sequence: step.sequence, cue_ms: CUE, gap_ms: GAP })
    add(step.sequence.length * (CUE + GAP), { type: "countdown_started", seconds: 3, step_ms: STEP, then: "input", level: step.level })
    add(COUNT, { type: "input_started", level: step.level, deadline_ms: step.deadline, expected_length: step.sequence.length })
    step.presses.forEach(([delay, button, ok = true], index) => {
      if (button === null) {
        t += delay
        return
      }
      add(delay, { type: "press", index, button, expected: step.sequence[index], ok })
    })
    const [result, lives, score, points, bonus] = step.result
    add(120, { type: "attempt_result", level: step.level, result, lives, score, points_awarded: points, speed_bonus: bonus })
    pause = PAUSE
  }
  add(400, { type: "game_finished", outcome: "game_over", final_score: 372, highest_level_completed: 2, session_id: `${gameId}-S` })
  return out
}

/**
 * The demo "device": START / RESET behave like the proposed firmware.
 * auto = true plays itself in a loop for an unattended screen.
 */
export function useDemoGame({ auto = false } = {}) {
  const [state, dispatch] = useReducer((s, a) => liveReducer(s, a, performance.now()), INITIAL_LIVE)
  const timers = useRef([])
  const counter = useRef(0)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const clear = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const send = (event) => dispatch({ type: "event", event: { device_id: "DEMO", t_ms: 0, ...event } })
  const runNewGame = () => {
    const gameId = `DEMO-${++counter.current}`
    for (const { at, event } of demoScript(gameId)) timers.current.push(setTimeout(() => send(event), at))
  }

  const start = useCallback(() => {
    // Like the device: START is ignored during a game or the countdown.
    if (!["idle", "finished"].includes(stateRef.current.phase)) return
    clear()
    send({ type: "control_pressed", control: "start", game_id: stateRef.current.game_id ?? undefined })
    runNewGame()
  }, [])

  // Unattended loop: START after 2 s idle, START again 4 s after game over.
  useEffect(() => {
    if (!auto || !["idle", "finished"].includes(state.phase)) return undefined
    const t = setTimeout(start, state.phase === "idle" ? 2000 : 4000)
    return () => clearTimeout(t)
  }, [auto, state.phase, start])

  useEffect(() => clear, [])

  return { state, start }
}
