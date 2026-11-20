// frontend/src/kioskState.test.js
// Unit tests for the pure kiosk state machine (written before the code).
//
// Every rule of the kiosk screen is checked here, so the React page only has
// to send events and draw the state.

import { describe, expect, it } from "vitest"

import {
  INITIAL_KIOSK_STATE,
  POLL_MS,
  RESULT_SECONDS,
  nextKioskState,
} from "./kioskState"

// Small helpers so each test reads like a story.
function latest(id, receivedAt) {
  return { type: "latest", id, receivedAt }
}

function run(state, events) {
  return events.reduce((current, event) => nextKioskState(current, event), state)
}

// A kiosk that opened while GAME-1 already existed, then saw GAME-2 arrive.
function activeState() {
  return run(INITIAL_KIOSK_STATE, [
    latest("GAME-1", "2026-11-21 10:00:00"),
    latest("GAME-2", "2026-11-21 10:05:00"),
  ])
}

describe("constants", () => {
  it("shows a result for 30 seconds and polls every 2 seconds", () => {
    expect(RESULT_SECONDS).toBe(30)
    expect(POLL_MS).toBe(2000)
  })

  it("starts idle, unpaused, with no baseline", () => {
    expect(INITIAL_KIOSK_STATE).toEqual({
      hasBaseline: false,
      baselineId: null,
      baselineAt: null,
      activeId: null,
      secondsLeft: 0,
      paused: false,
    })
  })

  it("the initial state cannot be changed by accident", () => {
    expect(Object.isFrozen(INITIAL_KIOSK_STATE)).toBe(true)
  })
})

describe("latest: the baseline", () => {
  it("the first latest only sets the baseline, so an old game is never shown", () => {
    const state = nextKioskState(
      INITIAL_KIOSK_STATE,
      latest("GAME-1", "2026-11-21 10:00:00"),
    )

    expect(state).toEqual({
      hasBaseline: true,
      baselineId: "GAME-1",
      baselineAt: "2026-11-21 10:00:00",
      activeId: null,
      secondsLeft: 0,
      paused: false,
    })
  })

  it("an empty database at page open still counts as the baseline", () => {
    // The page opened before anybody played: latest is null.
    let state = nextKioskState(INITIAL_KIOSK_STATE, latest(null, null))

    expect(state.hasBaseline).toBe(true)
    expect(state.baselineId).toBeNull()
    expect(state.activeId).toBeNull()

    // So the very first game of the day IS shown (demo-day case).
    state = nextKioskState(state, latest("GAME-1", "2026-11-21 10:00:00"))

    expect(state.activeId).toBe("GAME-1")
    expect(state.secondsLeft).toBe(RESULT_SECONDS)
  })

  it("the same id again does nothing", () => {
    const first = nextKioskState(INITIAL_KIOSK_STATE, latest("GAME-1"))

    expect(nextKioskState(first, latest("GAME-1"))).toBe(first)
  })
})

describe("latest: showing new games", () => {
  it("a different id becomes active with 30 seconds", () => {
    const state = activeState()

    expect(state.baselineId).toBe("GAME-2")
    expect(state.activeId).toBe("GAME-2")
    expect(state.secondsLeft).toBe(RESULT_SECONDS)
    expect(state.paused).toBe(false)
  })

  it("the active id seen again does nothing", () => {
    const state = activeState()

    expect(nextKioskState(state, latest("GAME-2", "2026-11-21 10:05:00"))).toBe(state)
  })

  it("a newer game replaces the active one and restarts the timer", () => {
    let state = run(activeState(), [{ type: "tick" }, { type: "tick" }])
    expect(state.secondsLeft).toBe(RESULT_SECONDS - 2)

    state = nextKioskState(state, latest("GAME-3", "2026-11-21 10:06:00"))

    expect(state.activeId).toBe("GAME-3")
    expect(state.baselineId).toBe("GAME-3")
    expect(state.secondsLeft).toBe(RESULT_SECONDS)
  })

  it("a newer game also clears a pause left by the previous player", () => {
    let state = nextKioskState(activeState(), { type: "pause" })
    expect(state.paused).toBe(true)

    state = nextKioskState(state, latest("GAME-3", "2026-11-21 10:06:00"))

    expect(state.activeId).toBe("GAME-3")
    expect(state.paused).toBe(false)
  })

  it("works without receivedAt (older API or test data)", () => {
    const state = run(INITIAL_KIOSK_STATE, [latest("A"), latest("B")])

    expect(state.activeId).toBe("B")
  })

  it("a game OLDER than the baseline is not shown (newest game was deleted)", () => {
    // GAME-2 is on screen; an admin deletes it, so latest falls back to GAME-1.
    const state = nextKioskState(activeState(), latest("GAME-1", "2026-11-21 10:00:00"))

    // GAME-1 is not a new result. It becomes the new baseline quietly and
    // whatever is on screen stays.
    expect(state.activeId).toBe("GAME-2")
    expect(state.baselineId).toBe("GAME-1")
    expect(state.baselineAt).toBe("2026-11-21 10:00:00")
  })
})

describe("latest: null ids", () => {
  it("a null id after the baseline is ignored on the idle screen", () => {
    const idle = nextKioskState(INITIAL_KIOSK_STATE, latest("GAME-1"))

    expect(nextKioskState(idle, latest(null))).toBe(idle)
    expect(nextKioskState(idle, latest(undefined))).toBe(idle)
  })

  it("a null id is ignored while a result is on screen", () => {
    const state = nextKioskState(activeState(), { type: "tick" })

    expect(nextKioskState(state, latest(null))).toBe(state)
  })
})

describe("tick", () => {
  it("counts down by one second", () => {
    const state = nextKioskState(activeState(), { type: "tick" })

    expect(state.secondsLeft).toBe(RESULT_SECONDS - 1)
    expect(state.activeId).toBe("GAME-2")
  })

  it("clears the result when it reaches 0", () => {
    const ticks = Array.from({ length: RESULT_SECONDS }, () => ({ type: "tick" }))
    const state = run(activeState(), ticks)

    expect(state.activeId).toBeNull()
    expect(state.secondsLeft).toBe(0)
    expect(state.paused).toBe(false)
    // The finished game stays the baseline, so it never comes back.
    expect(state.baselineId).toBe("GAME-2")
  })

  it("one tick before the end still shows the result", () => {
    const ticks = Array.from({ length: RESULT_SECONDS - 1 }, () => ({ type: "tick" }))
    const state = run(activeState(), ticks)

    expect(state.activeId).toBe("GAME-2")
    expect(state.secondsLeft).toBe(1)
  })

  it("does nothing on the idle screen", () => {
    const idle = nextKioskState(INITIAL_KIOSK_STATE, latest("GAME-1"))

    expect(nextKioskState(idle, { type: "tick" })).toBe(idle)
  })

  it("does nothing while paused", () => {
    const paused = nextKioskState(activeState(), { type: "pause" })

    expect(nextKioskState(paused, { type: "tick" })).toBe(paused)
  })
})

describe("pause and resume", () => {
  it("pause stops the countdown and resume continues from the same value", () => {
    let state = run(activeState(), [{ type: "tick" }, { type: "tick" }])
    expect(state.secondsLeft).toBe(28)

    state = nextKioskState(state, { type: "pause" })
    state = run(state, [{ type: "tick" }, { type: "tick" }, { type: "tick" }])
    expect(state.paused).toBe(true)
    expect(state.secondsLeft).toBe(28)

    state = nextKioskState(state, { type: "resume" })
    expect(state.paused).toBe(false)
    // Resume never resets the timer.
    expect(state.secondsLeft).toBe(28)

    state = nextKioskState(state, { type: "tick" })
    expect(state.secondsLeft).toBe(27)
  })

  it("pause twice is the same as pause once", () => {
    const once = nextKioskState(activeState(), { type: "pause" })

    expect(nextKioskState(once, { type: "pause" })).toBe(once)
  })

  it("resume without a pause does nothing", () => {
    const state = activeState()

    expect(nextKioskState(state, { type: "resume" })).toBe(state)
  })

  it("pause on the idle screen does nothing", () => {
    const idle = nextKioskState(INITIAL_KIOSK_STATE, latest("GAME-1"))

    expect(nextKioskState(idle, { type: "pause" })).toBe(idle)
  })
})

describe("dismiss", () => {
  it("clears the result, the timer and the pause", () => {
    const paused = nextKioskState(activeState(), { type: "pause" })
    const state = nextKioskState(paused, { type: "dismiss" })

    expect(state.activeId).toBeNull()
    expect(state.secondsLeft).toBe(0)
    expect(state.paused).toBe(false)
  })

  it("a dismissed game does not come back on the next poll", () => {
    let state = nextKioskState(activeState(), { type: "dismiss" })
    state = nextKioskState(state, latest("GAME-2", "2026-11-21 10:05:00"))

    expect(state.activeId).toBeNull()
  })

  it("is a no-op on the idle screen", () => {
    const idle = nextKioskState(INITIAL_KIOSK_STATE, latest("GAME-1"))

    expect(nextKioskState(idle, { type: "dismiss" })).toBe(idle)
  })
})

describe("safety", () => {
  it("unknown or missing events return the same state", () => {
    const state = activeState()

    expect(nextKioskState(state, { type: "explode" })).toBe(state)
    expect(nextKioskState(state, undefined)).toBe(state)
  })

  it("never mutates the state it receives", () => {
    const frozen = Object.freeze({ ...activeState() })

    // Would throw in strict mode (ES modules) if the reducer wrote to it.
    expect(() =>
      run(frozen, [
        { type: "tick" },
        { type: "pause" },
        { type: "resume" },
        latest("GAME-9", "2026-11-21 11:00:00"),
        { type: "dismiss" },
      ]),
    ).not.toThrow()
    expect(frozen.activeId).toBe("GAME-2")
  })
})
