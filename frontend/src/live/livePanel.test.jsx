// frontend/src/live/livePanel.test.jsx
// Static rendering checks (react-dom/server, no browser needed): the panel is
// display-only in live mode and has a real START button in demo mode;
// the header LIVE indicator and the connection chip; the demo script.

import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import LivePanel, { ConnectionChip } from "../components/LivePanel"
import PlayerName from "../components/PlayerName"
import { LiveBannerView, LiveIndicatorView } from "../components/LiveIndicator"
import { demoScript } from "./demoGame"
import { INITIAL_LIVE, liveReducer, panelView } from "./liveReducer"

const idleView = panelView({ ...INITIAL_LIVE }, 0)

describe("LivePanel", () => {
  it("mirror mode copies the box: START left, LCD, buzzer right, an LED over each button, no RESET", () => {
    const html = renderToStaticMarkup(<LivePanel view={idleView} />)
    expect(html).not.toContain("<button")
    expect(html).toMatch(/<span[^>]*rr-start[^>]*aria-hidden="true"/)
    expect(html).toContain("Press START to play")
    expect(html).not.toMatch(/class="[^"]*reset/) // no RESET control (the LCD may say "reset")
    expect(html.indexOf("rr-start")).toBeLessThan(html.indexOf("rr-lcd"))
    expect(html.indexOf("rr-lcd")).toBeLessThan(html.indexOf("rr-buzzer"))
    expect(html.match(/class="rr-led/g)).toHaveLength(6)
    expect(html).toContain("--c:#e2412f") // button 1 is red, as on the box
    expect(html).not.toMatch(/\b[A-G]4\b/) // no note names
  })

  it("a lit button lights the LED above it, not the button", () => {
    const html = renderToStaticMarkup(<LivePanel view={{ ...idleView, lit: [3] }} />)
    expect(html.match(/rr-led is-lit/g)).toHaveLength(1)
    expect(html).not.toContain("rr-btn is-lit")
  })

  it("a RESET from the device (START held) animates START", () => {
    const html = renderToStaticMarkup(<LivePanel view={{ ...idleView, control: { control: "reset", key: 1 } }} />)
    expect(html).toContain("rr-start is-down")
  })

  it("draws a result message with its tone class", () => {
    const html = renderToStaticMarkup(<LivePanel view={{ ...idleView, overlay: "Wrong sequence!", overlayKey: "m", overlayTone: "bad" }} />)
    expect(html).toContain('<span class="is-message is-bad">Wrong sequence!</span>')
  })

  it("demo mode has one real, focusable START button with a name", () => {
    const html = renderToStaticMarkup(<LivePanel view={idleView} interactive onStart={() => {}} />)
    expect(html.match(/<button type="button"/g)).toHaveLength(1)
    expect(html).toMatch(/<button[^>]*rr-start[^>]*aria-label="Start"/)
  })

  it("draws the countdown numeral, dimmed buttons and spent lives", () => {
    const view = { ...idleView, overlay: "3", overlayKey: "a", dim: true, lives: 1, lit: [] }
    const html = renderToStaticMarkup(<LivePanel view={view} />)
    expect(html).toContain("rr-panel rr-dim")
    expect(html).toContain('<div class="rr-overlay" aria-hidden="true"><span>3</span></div>')
    expect(html.match(/rr-life is-spent/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Lives: 1 of 3"')
  })
})

describe("LIVE indicator and banner", () => {
  const render = (node) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

  it("shows LIVE (bulb + text) linking to /live only while a game runs", () => {
    const html = render(<LiveIndicatorView active />)
    expect(html).toContain('href="/live"')
    expect(html).toContain("live-bulb")
    expect(html).toContain("Live")
    const hidden = render(<LiveIndicatorView active={false} />)
    expect(hidden).not.toContain("href") // keeps its space, but is no link
    expect(hidden).toContain('aria-hidden="true"')
    expect(hidden).toContain("invisible")
  })

  it("the leaderboard banner says a game is in progress", () => {
    expect(render(<LiveBannerView active />)).toContain("A game is in progress.")
    expect(render(<LiveBannerView active={false} />)).toBe("")
  })
})

describe("ConnectionChip", () => {
  it("states the connection as text, not colour alone", () => {
    for (const [connection, label] of [["live", "Live"], ["reconnecting", "Connecting..."], ["offline", "Game console not connected"]]) {
      const html = renderToStaticMarkup(<ConnectionChip connection={connection} label={label} />)
      expect(html).toContain(`live-chip-${connection}`)
      expect(html).toContain(label)
      expect(html).toContain('role="status"')
    }
  })
})

describe("demoScript", () => {
  it("is a whole game the reducer accepts: game first, GO and BEGIN countdowns, game over at the end", () => {
    const script = demoScript("DEMO-1")
    expect(script[0].event.type).toBe("game_started")
    let state = INITIAL_LIVE
    const phases = []
    for (const { at, event } of script) {
      state = liveReducer(state, { type: "event", event }, at)
      phases.push(state.phase)
    }
    expect(state.phase).toBe("finished")
    const counts = script.filter((s) => s.event.type === "countdown_started").map((s) => s.event.then)
    const playbacks = script.filter((s) => s.event.type === "playback_started")
    expect(counts).toEqual(playbacks.flatMap(() => ["watch", "input"])) // two per attempt, retries too
    expect(playbacks[1].event.sequence).not.toEqual(playbacks[2].event.sequence) // a fail brings a new pattern
    expect(script.map((s) => s.at)).toEqual([...script.map((s) => s.at)].sort((a, b) => a - b))
  })
})

describe("PlayerName", () => {
  it("shows the nickname, or Player #N (the game's number) when there is none", () => {
    expect(renderToStaticMarkup(<PlayerName nickname="Ana" number={3} />)).toBe("Ana")
    expect(renderToStaticMarkup(<PlayerName nickname={null} number={3} />)).toBe('<span class="player-number">Player #3</span>')
    expect(renderToStaticMarkup(<PlayerName nickname={null} number={null} />)).toContain(">Player<")
  })
})
