// frontend/src/live/liveReducer.js
// The live mirror in the browser, all pure (tested in liveReducer.test.js):
//   liveReducer(state, action, now)  device events / server snapshots -> state
//   panelView(state, now, options)    what the panel shows at time `now`
//   screenMode(...)                   mirror or the kiosk result reveal
//   nextConnection(...)               stream / polling connection status
// The UI never computes score, lives or deadlines: it shows what the device
// sent. The LCD text and the LEDs copy the box's firmware (RhythmRushGame.h:
// rr_render and rr_leds). Times are browser ms (performance or Date clock,
// injected).

import { visitorText } from "../content/visitorText"
import { countdownTimeline, nextBoundary, sequenceTimeline, stepAt } from "./timeline"

export const SILENCE_MS = 90000 // no events for this long = abandoned
export const HANDOVER_MS = 15000 // after game_finished, wait this long for the upload
export const WORD_MS = 500 // the box's word_ms: "Go!" / "Begin!" after 1 2 3
const RESULT_MS = 2000 // the box's result_ms: a fail is shown this long
const BLINK_MS = 120 // rr_leds: blink and chase speed
const LEVELS = 7 // the box's LCD says "Level 3/7"
const ALL_LEDS = [1, 2, 3, 4, 5, 6]
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
  countdown: null, // { seconds, step_ms, then: "watch" | "input", at }
  playback: null, // { key, sequence, cue_ms, gap_ms, at, late }
  input: null, // { expected_length, deadline_ms, done, at, fuseAt }
  lastPress: null, // { index, button, ok, at }
  lastResult: null, // { result, points_awarded, speed_bonus, at }
  final: null, // { outcome, final_score, session_id, at }
  control: null, // { control, at }
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
    case "countdown_started": {
      // Before every sequence (then "watch": 1 2 3 GO!) and every turn (then
      // "input": 1 2 3 BEGIN!). Mid-game the lives, level and score stay.
      const base = state.phase === "idle" || state.phase === "finished" ? { ...s, ...GAME_FIELDS } : s
      return {
        ...base,
        phase: "countdown",
        level: event.level ?? base.level,
        countdown: { seconds: event.seconds, step_ms: event.step_ms, then: event.then ?? "watch", at },
        input: null,
        lastPress: null,
        lastResult: null,
      }
    }
    case "game_started":
      // Right after START, before the first countdown: a new game.
      return { ...s, ...GAME_FIELDS, phase: "watch", lives: event.lives, level: event.level, score: 0 }
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
      if (!["watch", "input", "countdown"].includes(state.phase)) return state
      return {
        ...s,
        phase: "input",
        countdown: null,
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
      // START pressed during a game: the box goes straight back to idle.
      return { ...s, ...GAME_FIELDS, phase: "idle", idleSince: at }
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
    countdown: server.countdown
      ? { seconds: server.countdown.seconds, step_ms: server.countdown.step_ms, then: server.countdown.then ?? "watch", at: at(server.countdown.startedAt) }
      : null,
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
// What the panel shows at `now`: the box's LCD rows and LEDs, phase by phase
// ---------------------------------------------------------------------------
const TITLE = "    Rhythm Rush"

// rr_line: left-aligned, cut or padded to the 20 x 4 display.
const row = (text) => String(text).slice(0, 20).padEnd(20)
// Unknown (e.g. joined after a server restart): a dash, never a made-up 0.
const n = (value) => (value == null ? "-" : value)
const levelLives = (state) => `Level ${n(state.level)}/${LEVELS}  Lives:${n(state.lives)}`
const gameOverRows = (score) => [TITLE, "     GAME OVER!", `Points: ${n(score)}`, "Press START to play"]

function base(state, mode, rows) {
  return {
    mode,
    lcd: rows.map(row),
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

// rr_leds: all six LEDs blink (120 ms on, 120 ms off) for `ms` after `from`.
function blink(view, from, now, ms, reducedMotion) {
  const t = now - from
  if (reducedMotion || t < 0 || t >= ms) return
  view.lit = Math.floor(t / BLINK_MS) % 2 === 0 ? ALL_LEDS : []
  view.litKind = "blink"
  view.nextAt = Math.min(view.nextAt, from + (Math.floor(t / BLINK_MS) + 1) * BLINK_MS)
}

// rr_leds on a win: one LED at a time, 1..6, every 120 ms for 2.4 s.
function chase(view, from, now, reducedMotion) {
  const t = now - from
  if (reducedMotion || t < 0 || t >= 20 * BLINK_MS) return
  view.lit = [(Math.floor(t / BLINK_MS) % 6) + 1]
  view.litKind = "chase"
  view.nextAt = Math.min(view.nextAt, from + (Math.floor(t / BLINK_MS) + 1) * BLINK_MS)
}

// The result in big letters over the panel (like the countdown numbers) for
// as long as the box shows it: "Correct!", "Wrong sequence!", "Game Over!"...
// tone "good" or "bad" only changes the colour; the words carry the meaning.
function message(view, text, tone, from, now) {
  if (now - from >= RESULT_MS) return
  view.overlay = text
  view.overlayKey = `msg|${from}|${text}`
  view.overlayTone = tone
  view.announce = text
  view.nextAt = Math.min(view.nextAt, from + RESULT_MS)
}

// Idle: the box's LEDs are dark; the LCD invites the next player.
function idleView(state) {
  const view = base(state, "idle", [TITLE, "7 Levels / 3 Lives", "Press START to play", "START again = reset"])
  view.lives = null
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
  if (state.phase !== "idle" && state.lastEventAt !== null && now - state.lastEventAt > SILENCE_MS) return idleView(state)

  switch (state.phase) {
    case "countdown": {
      const turn = state.countdown.then === "input"
      const { steps, duration } = countdownTimeline(state.countdown.seconds, state.countdown.step_ms, WORD_MS, turn ? "BEGIN!" : "GO!")
      const t = now - state.countdown.at
      const step = stepAt(steps, t) ?? (t >= duration ? steps[steps.length - 1] : steps[0])
      const last = step === steps[steps.length - 1]
      const word = turn ? "       Begin!" : "        Go!"
      const view = base(state, "countdown", [
        TITLE,
        levelLives(state),
        turn ? "Repeat after Begin!" : "Watch after Go!",
        last ? word : `         ${step.label}`,
      ])
      view.overlay = t < duration ? step.label : null
      view.overlayKey = `${state.countdown.at}|${step.label}`
      view.dim = !last
      if (state.lives == null) view.lives = null
      view.announce = last ? (turn ? "Begin" : "Go") : "Get ready"
      view.nextAt = state.countdown.at + nextBoundary(steps, t)
      return view
    }
    case "watch": {
      const playback = state.playback
      // Between START and the first countdown: the box's default rows.
      if (!playback) return base(state, "watch", [TITLE, levelLives(state), `Score: ${n(state.score)}`, ""])
      const { steps, duration } = sequenceTimeline(playback.sequence, playback.cue_ms, playback.gap_ms)
      const t = now - playback.at
      const playing = !playback.late && t < duration
      // "Cue 2/4": the cue lit now, or the one just shown (also in its gap).
      const shown = playing ? Math.max(1, steps.filter((s) => s.on <= t).length) : steps.length
      const view = base(state, "watch", [
        TITLE,
        levelLives(state),
        "Watch the sequence",
        `Cue ${shown}/${steps.length} Score:${n(state.score)}`,
      ])
      view.announce = "Watch"
      if (playing) {
        const step = stepAt(steps, t)
        view.lit = step ? [step.button] : []
        view.litKind = "cue"
        view.nextAt = playback.at + nextBoundary(steps, t)
      }
      return view
    }
    case "input": {
      const { input } = state
      // "Next press: 2.4s": time left for this press, in tenths, rounded up.
      const left = Math.max(0, input.deadline_ms - (now - input.fuseAt))
      const tenths = Math.ceil(left / 100)
      const view = base(state, "input", [
        `Lv ${n(state.level)}/${LEVELS}  Lives:${n(state.lives)}`,
        `Score: ${n(state.score)}`,
        `Repeat: ${Math.min(input.done + 1, input.expected_length)}/${input.expected_length}`,
        `Next press: ${Math.floor(tenths / 10)}.${tenths % 10}s`,
      ])
      view.announce = "Your turn"
      view.fuse = { key: input.fuseAt, ms: input.deadline_ms }
      view.progress = { done: input.done, total: input.expected_length }
      if (left > 0) view.nextAt = input.fuseAt + input.deadline_ms - (tenths - 1) * 100
      const press = state.lastPress
      if (press && now - press.at < PRESS_MS) {
        view.press = { button: press.button, ok: press.ok, key: press.at }
        view.nextAt = Math.min(view.nextAt, press.at + PRESS_MS)
        if (press.ok) {
          view.lit = [press.button]
          view.litKind = "press"
        }
      }
      return view
    }
    case "result": {
      const r = state.lastResult
      let view
      if (r.result === "pass") {
        view = base(state, "result", [
          "      Correct!",
          `Points gained: +${r.points_awarded}`,
          `Score: ${n(state.score)}`,
          state.level < LEVELS ? `Next: Level ${state.level + 1}` : `All ${LEVELS} levels clear!`,
        ])
        message(view, "Correct!", "good", r.at, now)
      } else if (state.lives === 0) {
        // The last life: the box goes straight to GAME OVER (LEDs blink 1.2 s).
        view = base(state, "result", gameOverRows(state.score))
        blink(view, r.at, now, 10 * BLINK_MS, reducedMotion)
        message(view, "Game Over!", "bad", r.at, now)
      } else {
        view = base(state, "result", [
          r.result === "timeout" ? "    Time is up!" : "  Wrong sequence!",
          `Lives remaining: ${n(state.lives)}`,
          "New pattern, same Lv",
          `Retrying Level ${n(state.level)}`,
        ])
        blink(view, r.at, now, RESULT_MS, reducedMotion)
        message(view, r.result === "timeout" ? "Time is up!" : "Wrong sequence!", "bad", r.at, now)
      }
      const press = state.lastPress
      if (press && !press.ok && now - press.at < PRESS_MS) {
        view.press = { button: press.button, ok: false, key: press.at }
        view.nextAt = Math.min(view.nextAt, press.at + PRESS_MS)
      }
      return view
    }
    case "finished": {
      const { final } = state
      if (now - final.at > HANDOVER_MS) return idleView(state)
      const win = final.outcome === "win"
      const view = win
        ? base(state, "finished", ["      YOU WIN!", `${LEVELS} levels completed`, `Points: ${final.final_score}`, "Press START to play"])
        : base(state, "finished", gameOverRows(final.final_score))
      view.announce = win ? "You win" : "Game over"
      if (win) {
        chase(view, final.at, now, reducedMotion)
        message(view, "You Win!", "good", final.at, now)
      } else {
        // Same key as in the result phase: the message does not pop twice.
        blink(view, state.lastResult?.at ?? final.at, now, 10 * BLINK_MS, reducedMotion)
        message(view, "Game Over!", "bad", state.lastResult?.at ?? final.at, now)
      }
      view.nextAt = Math.min(view.nextAt, final.at + HANDOVER_MS + 1)
      return view
    }
    default:
      return idleView(state)
  }
}

// ---------------------------------------------------------------------------
// /live screen: the mirror has priority while a game runs; after game_finished
// the kiosk result reveal takes over as soon as the upload shows up.
// ---------------------------------------------------------------------------
export function isGameActive(state, now) {
  if (state.lastEventAt !== null && now - state.lastEventAt > SILENCE_MS) return false
  return ["countdown", "watch", "input", "result"].includes(state.phase)
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
