// frontend/src/live/liveReducer.js
// The live mirror in the browser, all pure (tested in liveReducer.test.js):
//   liveReducer(state, action, now)  device events / server snapshots -> state
//   panelView(state, now, options)    what the panel shows at time `now`
//   screenMode(...)                   mirror or the kiosk result reveal
//   nextConnection(...)               stream / polling connection status
// The UI never computes score, lives or deadlines: it shows what the device
// sent. Times are browser ms (performance or Date clock, injected).

import { visitorText } from "../content/visitorText"
import { countdownTimeline, nextBoundary, sequenceTimeline, stepAt } from "./timeline"

export const SILENCE_MS = 90000 // no events for this long = abandoned
export const HANDOVER_MS = 15000 // after game_finished, wait this long for the upload
export const RESTART_MS = 500 // "RESTARTING..." after RESET
export const GO_MS = 600
const ATTRACT_STEP_MS = 300
const ATTRACT_CYCLE_MS = 3000 // 6 x 300 chase, 300 all-six flash, 900 pause
const FLASH_STEP_MS = 60 // RESET: buttons 6..1 flash in reverse
const PRESS_MS = 400
const OLD_GAMES_KEPT = 20

export const INITIAL_LIVE = Object.freeze({
  phase: "idle", // idle | countdown | watch | input | result | finished
  device_id: null,
  game_id: null,
  oldGames: [],
  level: null,
  attempt: null,
  lives: null,
  score: null,
  countdown: null, // { seconds, step_ms, at }
  playback: null, // { key, sequence, cue_ms, gap_ms, at, late }
  input: null, // { expected_length, deadline_ms, done, at, fuseAt }
  lastPress: null, // { index, button, ok, at }
  lastResult: null, // { result, points_awarded, speed_bonus, at }
  final: null, // { outcome, final_score, session_id, at }
  control: null, // { control, at }
  reset: null, // { at, playAgain }
  idleSince: 0,
  lastEventAt: null,
  updatedAt: 0, // browser time of the last change (the view never runs behind it)
})

const GAME_FIELDS = {
  level: null,
  attempt: null,
  lives: null,
  score: null,
  countdown: null,
  playback: null,
  input: null,
  lastPress: null,
  lastResult: null,
  final: null,
}

function playbackKey(gameId, level, attempt) {
  return `${gameId}|${level}|${attempt}`
}

function applyEvent(state, event, at) {
  // A new game_id switches games; an older one is stale and ignored.
  if (event.game_id && event.game_id !== state.game_id) {
    if (state.oldGames.includes(event.game_id)) return state
    const oldGames = state.game_id ? [...state.oldGames, state.game_id].slice(-OLD_GAMES_KEPT) : state.oldGames
    state = { ...state, ...GAME_FIELDS, phase: "idle", game_id: event.game_id, oldGames, idleSince: at }
  }
  const s = { ...state, device_id: event.device_id ?? state.device_id, lastEventAt: at }
  const inGame = ["watch", "input", "result"].includes(state.phase)

  switch (event.type) {
    case "control_pressed":
      return { ...s, control: { control: event.control, at } }
    case "countdown_started":
      return {
        ...s,
        ...GAME_FIELDS,
        phase: "countdown",
        countdown: { seconds: event.seconds, step_ms: event.step_ms, at },
      }
    case "game_started":
      if (state.phase !== "countdown" && state.phase !== "idle") return state
      return { ...s, phase: "watch", lives: event.lives, level: event.level, score: 0 }
    case "playback_started": {
      if (state.phase === "finished") return state
      const key = playbackKey(s.game_id, event.level, event.attempt)
      if (state.playback?.key === key) return state // a duplicate never replays twice
      const { duration } = sequenceTimeline(event.sequence, event.cue_ms, event.gap_ms)
      return {
        ...s,
        phase: "watch",
        level: event.level,
        attempt: event.attempt,
        countdown: null,
        input: null,
        lastPress: null,
        lastResult: null,
        playback: { key, sequence: event.sequence, cue_ms: event.cue_ms, gap_ms: event.gap_ms, at, late: event.late === true || event.age >= duration },
      }
    }
    case "input_started":
      if (state.phase !== "watch" && state.phase !== "input") return state
      return {
        ...s,
        phase: "input",
        input: { expected_length: event.expected_length, deadline_ms: event.deadline_ms, done: 0, at, fuseAt: at },
      }
    case "press": {
      if (state.phase !== "input" || !state.input) return state // e.g. during the countdown
      const done = event.ok ? Math.max(state.input.done, event.index + 1) : state.input.done
      return {
        ...s,
        input: { ...state.input, done, fuseAt: event.ok ? at : state.input.fuseAt },
        lastPress: { index: event.index, button: event.button, ok: event.ok, at },
      }
    }
    case "attempt_result":
      if (!inGame) return state
      return {
        ...s,
        phase: "result",
        lives: event.lives,
        score: event.score,
        input: null,
        lastResult: { result: event.result, points_awarded: event.points_awarded, speed_bonus: event.speed_bonus, at },
      }
    case "game_finished":
      if (!inGame) return state
      return {
        ...s,
        phase: "finished",
        score: event.final_score,
        input: null,
        final: { outcome: event.outcome, final_score: event.final_score, session_id: event.session_id, at },
      }
    case "game_reset":
      return {
        ...s,
        ...GAME_FIELDS,
        phase: "idle",
        idleSince: at + RESTART_MS,
        reset: { at, playAgain: state.phase === "finished" },
      }
    case "abandoned":
      return { ...s, ...GAME_FIELDS, phase: "idle", idleSince: at }
    default:
      return state
  }
}

// A server snapshot (first connect, reconnect, polling). Ages instead of
// clock values, so the browser and server clocks never need to agree.
function fromSnapshot(state, snapshot, now) {
  if (!snapshot?.active || !snapshot.state) {
    return state.phase === "idle" ? state : { ...state, ...GAME_FIELDS, phase: "idle", idleSince: now }
  }
  const server = snapshot.state
  const at = (serverTime) => (serverTime == null ? null : now - Math.max(0, snapshot.now - serverTime))
  const phase = { countdown: "countdown", input: "input", result_pending: "finished", idle: "idle" }[server.phase]
    ?? (server.lastResult ? "result" : "watch")
  const seq = server.sequence
  const key = seq ? playbackKey(server.game_id, seq.level, seq.attempt) : null

  return {
    ...state,
    ...GAME_FIELDS,
    phase,
    device_id: server.device_id,
    game_id: server.game_id,
    level: server.level,
    attempt: server.attempt,
    lives: server.lives,
    score: server.score,
    countdown: server.countdown ? { seconds: server.countdown.seconds, step_ms: server.countdown.step_ms, at: at(server.countdown.startedAt) } : null,
    // A late joiner never sees a partial replay: the same key keeps its
    // original timing, anything else is marked late (WATCH only).
    playback: seq
      ? state.playback?.key === key
        ? state.playback
        : { key, sequence: seq.sequence, cue_ms: seq.cue_ms, gap_ms: seq.gap_ms, at: at(seq.startedAt), late: true }
      : null,
    input: server.input
      ? {
          expected_length: server.input.expected_length,
          deadline_ms: server.input.deadline_ms,
          done: server.input.done,
          at: at(server.input.startedAt),
          fuseAt: at(server.lastPress?.ok ? server.lastPress.at : server.input.startedAt),
        }
      : null,
    lastPress: server.lastPress ? { ...server.lastPress, at: at(server.lastPress.at) } : null,
    lastResult: server.lastResult ? { ...server.lastResult, at: at(server.lastResult.at) } : null,
    final: server.final ? { ...server.final, at: at(server.final.at) } : null,
    control: server.lastControl ? { control: server.lastControl.control, at: at(server.lastControl.at) } : state.control,
    lastEventAt: at(server.lastEventAt),
  }
}

/**
 * @param action {type:"event", event, age?} | {type:"snapshot", snapshot}
 *   age = ms the event already spent before reaching the browser (replays).
 */
export function liveReducer(state, action, now) {
  let next = state
  if (action.type === "snapshot") next = fromSnapshot(state, action.snapshot, now)
  if (action.type === "event") {
    const age = Math.max(0, action.age ?? 0)
    next = applyEvent(state, { ...action.event, age }, now - age)
  }
  return next === state ? state : { ...next, updatedAt: now }
}

// ---------------------------------------------------------------------------
// What the panel shows at `now`
// ---------------------------------------------------------------------------
const LCD_WIDTH = 20

export function centre(text) {
  const t = String(text).slice(0, LCD_WIDTH)
  const left = Math.floor((LCD_WIDTH - t.length) / 2)
  return " ".repeat(left) + t.padEnd(LCD_WIDTH - left)
}

// Unknown (e.g. joined after a server restart): dashes, never a made-up 0.
const pad2 = (n) => (n == null ? "--" : String(n).padStart(2, "0"))
const pad4 = (n) => (n == null ? "----" : String(n).padStart(4, "0"))

function statusLines(state) {
  return [centre(`LEVEL ${pad2(state.level)} SCORE ${pad4(state.score)}`), centre(`LIVES ${state.lives ?? "-"}`)]
}

function base(state, mode, lcd) {
  return {
    mode,
    lcd: lcd.map(centre),
    lit: [],
    litKind: null,
    overlay: null,
    dim: false,
    press: null,
    control: null,
    lives: state.lives,
    fuse: null,
    progress: null,
    announce: null,
    nextAt: Infinity,
  }
}

function idleView(state, now, reducedMotion) {
  const view = base(state, "idle", ["", centre("PRESS START"), centre("TO PLAY"), ""].map(centre))
  view.lives = null
  const startPressed = state.control?.control === "start" && now - state.control.at < 5000
  if (reducedMotion || startPressed) return view
  const since = Math.max(0, now - state.idleSince)
  const t = since % ATTRACT_CYCLE_MS
  const cycleStart = now - t
  if (t < 6 * ATTRACT_STEP_MS) {
    view.lit = [Math.floor(t / ATTRACT_STEP_MS) + 1]
    view.nextAt = cycleStart + (Math.floor(t / ATTRACT_STEP_MS) + 1) * ATTRACT_STEP_MS
  } else if (t < 7 * ATTRACT_STEP_MS) {
    view.lit = [1, 2, 3, 4, 5, 6]
    view.nextAt = cycleStart + 7 * ATTRACT_STEP_MS
  } else {
    view.nextAt = cycleStart + ATTRACT_CYCLE_MS
  }
  view.litKind = "attract"
  return view
}

function withControl(view, state, now) {
  if (state.control && now - state.control.at < PRESS_MS) {
    view.control = { control: state.control.control, key: state.control.at }
    view.nextAt = Math.min(view.nextAt, state.control.at + PRESS_MS)
  }
  return view
}

/**
 * @param {object} state  liveReducer state
 * @param {number} now    browser ms
 * @param {{reducedMotion?: boolean}} [options]
 */
export function panelView(state, now, { reducedMotion = false } = {}) {
  return withControl(viewFor(state, now, reducedMotion), state, now)
}

function viewFor(state, now, reducedMotion) {
  // 90 s of silence: the game was abandoned.
  if (state.phase !== "idle" && state.lastEventAt !== null && now - state.lastEventAt > SILENCE_MS) {
    return idleView({ ...state, idleSince: state.lastEventAt + SILENCE_MS }, now, reducedMotion)
  }

  // RESET: reverse flash 6..1, LCD wiped, then RESTARTING... / PLAY AGAIN!
  const resetAt = state.reset?.at
  const countdownAfterReset = state.countdown && state.countdown.at >= resetAt
  if (resetAt != null && now - resetAt < RESTART_MS && !countdownAfterReset) {
    const t = now - resetAt
    const view = base(state, "reset", ["", "", t < 120 ? "" : state.reset.playAgain ? "PLAY AGAIN!" : "RESTARTING...", ""].map(centre))
    view.lives = null
    if (!reducedMotion && t < 6 * FLASH_STEP_MS) {
      view.lit = [6 - Math.floor(t / FLASH_STEP_MS)]
      view.litKind = "flash"
      view.nextAt = resetAt + (Math.floor(t / FLASH_STEP_MS) + 1) * FLASH_STEP_MS
    } else {
      view.nextAt = resetAt + (t < 120 ? 120 : RESTART_MS)
    }
    return view
  }

  switch (state.phase) {
    case "countdown": {
      const { steps, duration } = countdownTimeline(state.countdown.seconds, state.countdown.step_ms, GO_MS)
      const t = now - state.countdown.at
      const step = stepAt(steps, t) ?? (t >= duration ? steps[steps.length - 1] : steps[0])
      const go = step.label === "GO!"
      const view = base(state, "countdown", [centre("GET READY!"), "", centre(step.label), ""].map(centre))
      view.overlay = t < duration ? step.label : null
      view.overlayKey = `${state.countdown.at}|${step.label}`
      view.dim = !go
      view.lives = null
      view.announce = go ? "Go" : "Get ready"
      view.nextAt = state.countdown.at + nextBoundary(steps, t)
      return view
    }
    case "watch": {
      const view = base(state, "watch", [...statusLines(state), centre("WATCH SEQUENCE"), ""])
      view.announce = "Watch"
      const playback = state.playback
      if (!playback) {
        view.lcd[2] = centre("GO!")
        return view
      }
      const { steps, duration } = sequenceTimeline(playback.sequence, playback.cue_ms, playback.gap_ms)
      const t = now - playback.at
      if (!playback.late && t < duration) {
        const step = stepAt(steps, t)
        view.lit = step ? [step.button] : []
        view.litKind = "cue"
        view.nextAt = playback.at + nextBoundary(steps, t)
      }
      return view
    }
    case "input": {
      const { input } = state
      const view = base(state, "input", [...statusLines(state), centre(`YOUR TURN ${input.done}/${input.expected_length}`), ""])
      view.announce = "Your turn"
      view.fuse = { key: input.fuseAt, ms: input.deadline_ms }
      view.progress = { done: input.done, total: input.expected_length }
      const press = state.lastPress
      if (press && now - press.at < PRESS_MS) {
        view.press = { button: press.button, ok: press.ok, key: press.at }
        view.nextAt = press.at + PRESS_MS
        if (press.ok) {
          view.lit = [press.button]
          view.litKind = "press"
        }
      }
      if (press && !press.ok) view.lcd[2] = centre("OOPS!")
      return view
    }
    case "result": {
      const r = state.lastResult
      const lines =
        r.result === "pass"
          ? [centre(`NICE! +${r.points_awarded}`), centre(`SPEED BONUS +${r.speed_bonus}`)]
          : [centre(r.result === "timeout" ? "TIME'S UP!" : "OOPS!"), centre("SAME SEQUENCE AGAIN")]
      const view = base(state, "result", [...statusLines(state), ...lines])
      const press = state.lastPress
      if (press && !press.ok && now - press.at < PRESS_MS) {
        view.press = { button: press.button, ok: false, key: press.at }
        view.nextAt = press.at + PRESS_MS
      }
      return view
    }
    case "finished": {
      const { final } = state
      if (now - final.at > HANDOVER_MS) return idleView({ ...state, idleSince: final.at + HANDOVER_MS }, now, reducedMotion)
      const view = base(state, "finished", [
        centre(final.outcome === "win" ? "YOU WIN!" : "GAME OVER"),
        centre(`FINAL SCORE ${pad4(final.final_score)}`),
        centre("PRESS RESET TO"),
        centre("PLAY AGAIN"),
      ])
      view.announce = final.outcome === "win" ? "You win" : "Game over"
      view.nextAt = final.at + HANDOVER_MS + 1
      return view
    }
    default:
      return idleView(state, now, reducedMotion)
  }
}

// ---------------------------------------------------------------------------
// /live screen: the mirror has priority while a game runs; after game_finished
// the kiosk result reveal takes over as soon as the upload shows up.
// ---------------------------------------------------------------------------
export function isGameActive(state, now) {
  if (state.lastEventAt !== null && now - state.lastEventAt > SILENCE_MS) return false
  return ["countdown", "watch", "input", "result"].includes(state.phase) || (state.reset !== null && now - state.reset.at < RESTART_MS)
}

export function screenMode(state, kioskActiveId, now) {
  const waitingForUpload =
    state.phase === "finished" && now - state.final.at <= HANDOVER_MS && kioskActiveId !== state.final.session_id
  if (isGameActive(state, now) || waitingForUpload) return "mirror"
  return kioskActiveId !== null ? "result" : "mirror"
}

// ---------------------------------------------------------------------------
// Connection status: stream first, polling as the fallback
// ---------------------------------------------------------------------------
export const INITIAL_CONNECTION = Object.freeze({ status: "reconnecting", mode: "stream", failures: 0 })
const FAILURES_BEFORE_POLLING = 3

// signal: "open" | "error" | "poll_ok" | "poll_error" | "retry_stream"
export function nextConnection(conn, signal) {
  switch (signal) {
    case "open":
      return { status: "live", mode: "stream", failures: 0 }
    case "error": {
      const failures = conn.failures + 1
      return failures >= FAILURES_BEFORE_POLLING
        ? { status: conn.status === "offline" ? "offline" : "reconnecting", mode: "poll", failures }
        : { status: "reconnecting", mode: "stream", failures }
    }
    case "poll_ok":
      return { ...conn, status: "live" }
    case "poll_error":
      return { ...conn, status: "offline" }
    case "retry_stream":
      return { ...conn, mode: "stream", failures: 0 }
    default:
      return conn
  }
}

// The words live in content/visitorText.js (visitor text rules).
export function connectionLabel(conn) {
  return visitorText.live.chip[conn.status]
}
