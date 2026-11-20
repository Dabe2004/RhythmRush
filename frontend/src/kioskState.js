// frontend/src/kioskState.js
// Pure state machine for the kiosk result screen ("/result").
//
// No React and no timers live here, so every rule can be unit tested
// (see kioskState.test.js). The page sends events, this function returns the
// next state, and the page draws whatever the state says.
//
// State:
//   hasBaseline - false until the first "latest" answer arrives
//   baselineId  - newest game the kiosk already knows about (null = empty DB)
//   baselineAt  - received_at of that game ("YYYY-MM-DD HH:MM:SS", UTC)
//   activeId    - game currently on screen, or null for the idle screen
//   secondsLeft - countdown for the game on screen
//   paused      - true while the player is typing a nickname
//
// Events:
//   { type: "latest", id, receivedAt } - answer of GET /api/game-sessions/latest
//   { type: "tick" }                   - one second passed
//   { type: "pause" } / { type: "resume" }
//   { type: "dismiss" }                - Close / Skip / countdown finished

export const RESULT_SECONDS = 30
export const POLL_MS = 2000

export const INITIAL_KIOSK_STATE = Object.freeze({
  hasBaseline: false,
  baselineId: null,
  baselineAt: null,
  activeId: null,
  secondsLeft: 0,
  paused: false,
})

// The idle screen: nothing on screen, no countdown, no pause.
function toIdle(state) {
  return { ...state, activeId: null, secondsLeft: 0, paused: false }
}

function onLatest(state, id, receivedAt) {
  const time = receivedAt ?? null

  // 1. The FIRST answer only remembers what already exists, so a game that
  //    was in the database before the page opened is never shown. An empty
  //    database (id null) is a valid baseline too: otherwise the first game
  //    of the day would be swallowed.
  if (!state.hasBaseline) {
    return { ...state, hasBaseline: true, baselineId: id ?? null, baselineAt: time }
  }

  // 2. After that, a missing id (empty database) changes nothing.
  if (id === null || id === undefined) return state

  // 3. The game we already know: nothing new.
  if (id === state.baselineId || id === state.activeId) return state

  // 4. An OLDER game than the baseline means the newest game was deleted
  //    (admin page). It is not a new result: remember it quietly.
  //    The SQLite timestamps compare correctly as plain strings.
  if (time !== null && state.baselineAt !== null && time < state.baselineAt) {
    return { ...state, baselineId: id, baselineAt: time }
  }

  // 5. A new game: show it for RESULT_SECONDS. It replaces any game on
  //    screen and clears the previous player's pause.
  return {
    ...state,
    baselineId: id,
    baselineAt: time,
    activeId: id,
    secondsLeft: RESULT_SECONDS,
    paused: false,
  }
}

export function nextKioskState(state, event) {
  switch (event?.type) {
    case "latest":
      return onLatest(state, event.id, event.receivedAt)

    case "tick":
      // Nothing to count down, or the player is typing a nickname.
      if (state.activeId === null || state.paused) return state

      // Last second: back to the idle screen. The game stays the baseline,
      // so it is never shown again.
      if (state.secondsLeft <= 1) return toIdle(state)

      return { ...state, secondsLeft: state.secondsLeft - 1 }

    case "pause":
      // Only a result on screen can be paused.
      if (state.activeId === null || state.paused) return state
      return { ...state, paused: true }

    case "resume":
      // Continues from the current secondsLeft; it never resets the timer.
      return state.paused ? { ...state, paused: false } : state

    case "dismiss":
      if (state.activeId === null && !state.paused && state.secondsLeft === 0) {
        return state
      }
      return toIdle(state)

    default:
      return state
  }
}
