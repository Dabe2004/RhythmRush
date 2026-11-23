// frontend/src/live/liveReducer.test.js
// Client reducer, panel view (what is lit / on the LCD at time t), the
// /live screen mode and the connection status.

import { describe, expect, it } from "vitest"

import {
  HANDOVER_MS,
  INITIAL_CONNECTION,
  INITIAL_LIVE,
  SILENCE_MS,
  connectionLabel,
  isGameActive,
  liveReducer,
  nextConnection,
  panelView,
  screenMode,
} from "./liveReducer"

const e = {
  start: (g = "G1") => ({ type: "control_pressed", control: "start", game_id: g }),
  reset: (g = "G1") => ({ type: "control_pressed", control: "reset", game_id: g }),
  gameReset: (g = "G1") => ({ type: "game_reset", game_id: g }),
  countdown: (g = "G1", then = "watch", level = 1) => ({ type: "countdown_started", seconds: 3, step_ms: 1000, then, level, game_id: g }),
  game: (g = "G1") => ({ type: "game_started", lives: 3, level: 1, game_id: g }),
  playback: (level = 1, attempt = 1, sequence = [1, 4, 2], g = "G1") => ({
    type: "playback_started", level, attempt, sequence, cue_ms: 500, gap_ms: 200, game_id: g,
  }),
  input: (length = 3, g = "G1") => ({ type: "input_started", level: 1, deadline_ms: 3000, expected_length: length, game_id: g }),
  press: (index, button, ok = true, g = "G1") => ({ type: "press", index, button, expected: button, ok, game_id: g }),
  result: (result = "pass", lives = 3, score = 140, points = 140, bonus = 40) => ({
    type: "attempt_result", level: 1, result, lives, score, points_awarded: points, speed_bonus: bonus, game_id: "G1",
  }),
  finished: (outcome = "game_over") => ({
    type: "game_finished", outcome, final_score: 350, highest_level_completed: 2, session_id: "S-1", game_id: "G1",
  }),
}

// steps: [browser time, event, age?]
function play(steps, state = INITIAL_LIVE) {
  for (const [t, event, age] of steps) state = liveReducer(state, { type: "event", event, age }, t)
  return state
}

// The LCD rows without their right padding (left spaces are part of the
// firmware's text, e.g. "    Rhythm Rush").
const rows = (view) => view.lcd.map((line) => line.trimEnd())
const ALL = [1, 2, 3, 4, 5, 6]

// A game that reached the input phase of level 1 at t = 5700:
// START, game_started, 1 2 3 GO!, the sequence, 1 2 3 BEGIN!, the turn.
const inGame = () =>
  play([[0, e.start()], [5, e.game()], [10, e.countdown()], [3610, e.playback()], [5650, e.countdown("G1", "input")], [5700, e.input()]])

describe("liveReducer", () => {
  it("follows a game and keeps the numbers the device sent", () => {
    let s = inGame()
    expect(s).toMatchObject({ phase: "input", lives: 3, level: 1, score: 0 })
    s = play([[6000, e.press(0, 1)], [6500, e.press(1, 4)], [7000, e.press(2, 2)], [7100, e.result()]], s)
    expect(s).toMatchObject({ phase: "result", score: 140, lives: 3 })
    expect(rows(panelView(s, 7200))).toEqual(["      Correct!", "Points gained: +140", "Score: 140", "Next: Level 2"])
    s = play([[9000, e.playback(2, 1, [1, 2, 3, 4])], [11800, e.input(4)], [12000, e.press(0, 6, false)], [12100, e.result("wrong", 2, 140, 0, 0)]], s)
    expect(rows(panelView(s, 12200))).toEqual(["  Wrong sequence!", "Lives remaining: 2", "New pattern, same Lv", "Retrying Level 2"])
    s = play([[14000, e.playback(2, 2, [6, 5, 4, 3])], [16800, e.input(4)], [19800, e.result("timeout", 1, 140, 0, 0)]], s)
    expect(rows(panelView(s, 19900))[0]).toBe("    Time is up!")
    s = play([[20000, e.finished()]], s)
    expect(s.phase).toBe("finished")
    expect(rows(panelView(s, 20100))).toEqual(["    Rhythm Rush", "     GAME OVER!", "Points: 350", "Press START to play"])
  })

  it("ignores game-button presses during the countdown", () => {
    const s = play([[0, e.countdown()]])
    expect(play([[500, e.press(0, 3)]], s)).toBe(s)
    expect(panelView(s, 500).press).toBeNull()
  })

  it("ignores a stale event from the game before a RESET", () => {
    let s = play([[0, e.reset()], [5, e.gameReset()], [505, e.countdown("G2")]], inGame())
    expect(s.game_id).toBe("G2")
    s = play([[600, e.press(0, 1, true, "G1")], [610, e.result()]], s)
    expect(s).toMatchObject({ game_id: "G2", phase: "countdown" })
  })

  it("late join mid-input from a snapshot: right step, no partial replay", () => {
    const snapshot = {
      active: true,
      now: 50000,
      state: {
        device_id: "RR01", game_id: "G9", phase: "input", level: 3, attempt: 1, lives: 2, score: 420,
        sequence: { sequence: [5, 1, 6, 3, 4], level: 3, attempt: 1, cue_ms: 500, gap_ms: 200, startedAt: 40000 },
        input: { expected_length: 5, deadline_ms: 2600, done: 2, startedAt: 45000 },
        lastPress: { index: 1, button: 1, expected: 1, ok: true, at: 49000 },
        countdown: null, lastControl: null, lastResult: null, final: null, lastEventAt: 49000,
      },
    }
    const s = liveReducer(INITIAL_LIVE, { type: "snapshot", snapshot }, 1000)
    expect(s).toMatchObject({ phase: "input", level: 3, lives: 2, score: 420 })
    expect(s.input).toMatchObject({ done: 2, at: -4000, fuseAt: 0 }) // ages kept, clocks never compared
    expect(s.playback.late).toBe(true)
    const view = panelView(s, 1000)
    expect(rows(view)).toEqual(["Lv 3/7  Lives:2", "Score: 420", "Repeat: 3/5", "Next press: 1.6s"])
    expect(view.fuse).toEqual({ key: 0, ms: 2600 })
    expect(view.progress).toEqual({ done: 2, total: 5 })
  })

  it("reconnect: a snapshot of the same playback does not replay it twice", () => {
    const s = play([[0, e.countdown()], [3000, e.game()], [3600, e.playback()]])
    const snapshot = {
      active: true,
      now: 9000,
      state: { ...s, phase: "watch", game_id: "G1", lastResult: null, sequence: { sequence: [1, 4, 2], level: 1, attempt: 1, cue_ms: 500, gap_ms: 200, startedAt: 8500 }, lastEventAt: 8500 },
    }
    const after = liveReducer(s, { type: "snapshot", snapshot }, 4000)
    expect(after.playback).toBe(s.playback)
  })

  it("unknown numbers show dashes, not a made-up 0", () => {
    const s = play([[0, e.playback(3, 1, [1, 2, 3, 4, 5])]])
    expect(rows(panelView(s, 10))).toEqual(["    Rhythm Rush", "Level 3/7  Lives:-", "Watch the sequence", "Cue 1/5 Score:-"])
  })

  it("an inactive snapshot (server says no game) returns to idle", () => {
    const s = liveReducer(inGame(), { type: "snapshot", snapshot: { active: false, now: 1 } }, 9000)
    expect(s.phase).toBe("idle")
  })
})

describe("panelView: idle", () => {
  it("LEDs stay dark like the box; the LCD shows the box's idle screen", () => {
    const idle = { ...INITIAL_LIVE, idleSince: 0 }
    for (const t of [0, 310, 1850, 3000]) expect(panelView(idle, t).lit).toEqual([])
    expect(panelView(idle, 0).nextAt).toBe(Infinity) // nothing to animate
    expect(rows(panelView(idle, 0))).toEqual(["    Rhythm Rush", "7 Levels / 3 Lives", "Press START to play", "START again = reset"])

    const started = play([[5000, e.start()]], idle)
    expect(panelView(started, 5001).control).toEqual({ control: "start", key: 5000 })
  })

  it("every LCD line is exactly 20 characters", () => {
    const over = play([[6010, e.result("wrong", 0, 0, 0, 0)]], inGame())
    for (const state of [INITIAL_LIVE, inGame(), play([[0, e.countdown()]]), over]) {
      for (const line of panelView(state, 6100).lcd) expect(line).toHaveLength(20)
    }
  })
})

describe("panelView: countdown", () => {
  it("counts 1, 2, 3, GO! on the browser clock, buttons dimmed", () => {
    const s = play([[0, e.start()], [100, e.countdown()]])
    const at = (t) => panelView(s, t)
    expect([at(100).overlay, at(1100).overlay, at(2100).overlay, at(3100).overlay]).toEqual(["1", "2", "3", "GO!"])
    expect(at(100).dim).toBe(true)
    expect(at(3100).dim).toBe(false)
    expect(rows(at(100))).toEqual(["    Rhythm Rush", "Level 1/7  Lives:-", "Watch after Go!", "         1"])
    expect(rows(at(3100))[3]).toBe("        Go!")
    expect(at(100).announce).toBe("Get ready")
    expect(at(3100).announce).toBe("Go")
    expect(at(500).nextAt).toBe(1100) // (before 400 ms the START press animation ends first)
    expect(at(3800).overlay).toBeNull()
  })

  it("before the turn: 1, 2, 3, BEGIN! with level, score and lives on the LCD", () => {
    const s = play([[0, e.start()], [5, e.game()], [10, e.countdown()], [3610, e.playback()], [5710, e.countdown("G1", "input")]])
    const at = (t) => panelView(s, t)
    expect(rows(at(5710))).toEqual(["    Rhythm Rush", "Level 1/7  Lives:3", "Repeat after Begin!", "         1"])
    expect(rows(at(8710))[3]).toBe("       Begin!") // the box shows a word for 500 ms
    expect(at(5710).lives).toBe(3) // hearts stay during a mid-game countdown
    expect(at(8710).overlay).toBe("BEGIN!")
    expect(at(8710).announce).toBe("Begin")
    expect(play([[6000, e.press(0, 1)]], s)).toBe(s) // presses are ignored until BEGIN! is over
  })

  it("every attempt counts down twice; the next level's countdown shows the new level", () => {
    let s = play([[6000, e.press(0, 1)], [6500, e.press(1, 4)], [7000, e.press(2, 2)], [7100, e.result()]], inGame())
    s = play([[8100, e.countdown("G1", "watch", 2)]], s)
    expect(s).toMatchObject({ phase: "countdown", level: 2, score: 140, lives: 3 })
    expect(rows(panelView(s, 8100))).toEqual(["    Rhythm Rush", "Level 2/7  Lives:3", "Watch after Go!", "         1"])
    const modes = []
    for (const [t, event] of [[11700, e.playback(2, 1, [3, 3, 5, 6])], [14500, e.countdown("G1", "input", 2)], [18100, e.input(4)]]) {
      s = play([[t, event]], s)
      modes.push(panelView(s, t + 1).mode)
    }
    expect(modes).toEqual(["watch", "countdown", "input"])
  })
})

describe("panelView: sequence playback and latency", () => {
  it("on time: replays the sequence on the browser clock", () => {
    const s = play([[0, e.countdown()], [3000, e.game()], [3600, e.playback()]])
    expect(panelView(s, 3600).lit).toEqual([1])
    expect(panelView(s, 4150).lit).toEqual([]) // gap
    expect(panelView(s, 4300).lit).toEqual([4])
    expect(panelView(s, 5000).lit).toEqual([2])
    expect(rows(panelView(s, 3600))).toEqual(["    Rhythm Rush", "Level 1/7  Lives:3", "Watch the sequence", "Cue 1/3 Score:0"])
    expect(rows(panelView(s, 4150))[3]).toBe("Cue 1/3 Score:0") // the gap still counts the cue just shown
    expect(rows(panelView(s, 4300))[3]).toBe("Cue 2/3 Score:0")
  })

  it("late: arrived after the whole playback would be over -> WATCH only, never sped up", () => {
    const s = play([[0, e.countdown()], [3000, e.game()], [9000, e.playback(), 2500]])
    expect(s.playback.late).toBe(true)
    for (const t of [9000, 9100, 9700, 10500]) expect(panelView(s, t).lit).toEqual([])
    expect(rows(panelView(s, 9000)).slice(2)).toEqual(["Watch the sequence", "Cue 3/3 Score:0"])
  })

  it("a duplicate playback event never replays twice", () => {
    const first = play([[0, e.countdown()], [3000, e.game()], [3600, e.playback()]])
    const again = play([[4500, e.playback()]], first)
    expect(again).toBe(first)
  })

  it("the longest sequence (15: level 7 with +2 steps every level) lights every cue in order", () => {
    const sequence = Array.from({ length: 15 }, (_, i) => (i % 6) + 1)
    const s = play([[0, e.countdown()], [3000, e.game()], [10000, e.playback(7, 1, sequence)]])
    const lit = sequence.map((_, i) => panelView(s, 10000 + i * 700 + 10).lit[0])
    expect(lit).toEqual(sequence)
    expect(panelView(s, 10000 + 15 * 700).lit).toEqual([])
  })
})

describe("panelView: presses", () => {
  it("a correct press lights its LED and restarts the time; a wrong one shakes", () => {
    let s = play([[6000, e.press(0, 1)]], inGame())
    let view = panelView(s, 6050)
    expect(view.press).toEqual({ button: 1, ok: true, key: 6000 })
    expect(view.lit).toEqual([1])
    expect(view.fuse).toEqual({ key: 6000, ms: 3000 })
    expect(rows(view).slice(2)).toEqual(["Repeat: 2/3", "Next press: 3.0s"])
    expect(view.nextAt).toBe(6100) // the "Next press" tenths change every 100 ms
    expect(rows(panelView(s, 7451))[3]).toBe("Next press: 1.6s") // rounded up, like the box
    expect(panelView(s, 6500).press).toBeNull()

    s = play([[6800, e.press(1, 3, false)]], s)
    view = panelView(s, 6850)
    expect(view.press).toEqual({ button: 3, ok: false, key: 6800 })
    expect(view.fuse.key).toBe(6000) // a wrong press does not refill the time
  })
})

describe("panelView: RESET (START pressed during a game)", () => {
  it("goes straight back to the idle screen, like the box", () => {
    const s = play([[7000, e.reset()], [7001, e.gameReset()]], inGame())
    const view = panelView(s, 7010)
    expect(view.mode).toBe("idle")
    expect(view.lit).toEqual([])
    expect(view.control).toEqual({ control: "reset", key: 7000 })
    expect(isGameActive(s, 7010)).toBe(false)
    const next = play([[9000, e.game("G2")], [9005, e.countdown("G2")]], s)
    expect(panelView(next, 9010).overlay).toBe("1")
    expect(next.game_id).toBe("G2")
  })
})

describe("panelView: LEDs after a result, like the box", () => {
  it("a fail blinks all six LEDs every 120 ms for 2 s; reduced motion keeps them dark", () => {
    const s = play([[6000, e.press(0, 6, false)], [6010, e.result("wrong", 2, 0, 0, 0)]], inGame())
    expect([6010, 6130, 6250].map((t) => panelView(s, t).lit)).toEqual([ALL, [], ALL])
    expect(panelView(s, 8010).lit).toEqual([])
    expect(panelView(s, 6010, { reducedMotion: true }).lit).toEqual([])
  })

  it("the last life shows GAME OVER at once; a win chases the LEDs 1..6 for 2.4 s", () => {
    const over = play([[6010, e.result("wrong", 0, 0, 0, 0)]], inGame())
    expect(rows(panelView(over, 6020))).toEqual(["    Rhythm Rush", "     GAME OVER!", "Points: 0", "Press START to play"])
    expect(panelView(over, 6020).lit).toEqual(ALL)
    expect(panelView(over, 7300).lit).toEqual([]) // the box blinks only 1.2 s

    const win = play([[7000, { ...e.finished("win"), final_score: 3078 }]], inGame())
    expect(rows(panelView(win, 7000))).toEqual(["      YOU WIN!", "7 levels completed", "Points: 3078", "Press START to play"])
    expect([7000, 7130, 7610, 7730].map((t) => panelView(win, t).lit[0])).toEqual([1, 2, 6, 1])
    expect(panelView(win, 9400).lit).toEqual([])
  })

  it("passing level 7 says All 7 levels clear!", () => {
    const s = play([[0, e.game()], [10, e.playback(7, 1, [1, 2, 3, 4, 5, 6, 1, 2, 3])], [9000, e.input(9)], [9100, e.result("pass", 3, 3078, 737, 37)]])
    expect(rows(panelView(s, 9200))[3]).toBe("All 7 levels clear!")
  })
})

describe("abandoned and finished timeouts", () => {
  it("90 s of silence returns to idle; a finished game falls back to idle after 15 s", () => {
    const s = inGame()
    expect(panelView(s, 5700 + SILENCE_MS - 1).mode).toBe("input")
    expect(panelView(s, 5700 + SILENCE_MS + 1).mode).toBe("idle")
    expect(isGameActive(s, 5700 + SILENCE_MS + 1)).toBe(false)

    const over = play([[7000, e.finished()]], s)
    expect(panelView(over, 7000 + HANDOVER_MS - 1).mode).toBe("finished")
    expect(panelView(over, 7000 + HANDOVER_MS + 1).mode).toBe("idle")
  })
})

describe("screenMode (handover to the result reveal)", () => {
  it("the mirror has priority while a game runs, even over an old result", () => {
    expect(screenMode(inGame(), "OLD-GAME", 6000)).toBe("mirror")
  })

  it("after game_finished: mirror (saving...) until the upload shows up, then the result", () => {
    const over = play([[7000, e.finished()]], inGame())
    expect(screenMode(over, null, 7100)).toBe("mirror")
    expect(screenMode(over, "OLD-GAME", 7100)).toBe("mirror")
    expect(screenMode(over, "S-1", 7100)).toBe("result")
  })

  it("no upload within 15 s: back to idle (or whatever result the kiosk has)", () => {
    const over = play([[7000, e.finished()]], inGame())
    expect(screenMode(over, null, 7000 + HANDOVER_MS + 1)).toBe("mirror")
    expect(panelView(over, 7000 + HANDOVER_MS + 1).mode).toBe("idle")
    expect(screenMode(INITIAL_LIVE, "S-7", 0)).toBe("result")
    expect(screenMode(INITIAL_LIVE, null, 0)).toBe("mirror")
  })
})

describe("connection status", () => {
  it("live on open, reconnecting on errors, polling after 3, offline when polling fails", () => {
    let c = nextConnection(INITIAL_CONNECTION, "open")
    expect(connectionLabel(c)).toBe("Live")
    c = nextConnection(c, "error")
    expect(c).toMatchObject({ status: "reconnecting", mode: "stream" })
    expect(connectionLabel(c)).toBe("Connecting...")
    c = nextConnection(nextConnection(c, "error"), "error")
    expect(c.mode).toBe("poll")
    expect(connectionLabel(nextConnection(c, "poll_ok"))).toBe("Live")
    c = nextConnection(c, "poll_error")
    expect(connectionLabel(c)).toBe("Game console not connected")
    expect(nextConnection(c, "retry_stream")).toMatchObject({ mode: "stream", failures: 0 })
  })
})
