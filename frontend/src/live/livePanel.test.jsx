// frontend/src/live/livePanel.test.jsx
// Static rendering checks (react-dom/server, no browser needed): the panel is
// display-only in live mode and has real START/RESET buttons in demo mode;
// the header LIVE indicator and the connection chip; the demo script.

import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import LivePanel, { ConnectionChip } from "../components/LivePanel"
import { LiveBannerView, LiveIndicatorView } from "../components/LiveIndicator"
import { demoScript } from "./demoGame"
import { INITIAL_LIVE, liveReducer, panelView } from "./liveReducer"

const idleView = panelView({ ...INITIAL_LIVE }, 0)

describe("LivePanel", () => {
  it("mirror mode is display-only: no buttons, controls hidden from assistive tech", () => {
    const html = renderToStaticMarkup(<LivePanel view={idleView} />)
    expect(html).not.toContain("<button")
    expect(html).toContain('class="rr-pill rr-pill-reset ')
    expect(html).toMatch(/<span[^>]*rr-pill-start[^>]*aria-hidden="true"/)
    expect(html).toContain("PRESS START")
    expect(html).toContain(">Red<") // colour names only, no notes
    expect(html.indexOf("rr-pill-start")).toBeLessThan(html.indexOf("rr-pill-reset")) // START left, RESET right
    expect(html).toContain(">Purple<")
    expect(html).not.toMatch(/\b[A-G]4\b/)
  })

  it("demo mode has real, focusable START and RESET buttons", () => {
    const html = renderToStaticMarkup(<LivePanel view={idleView} interactive onStart={() => {}} onReset={() => {}} />)
    expect(html.match(/<button type="button"/g)).toHaveLength(2)
    expect(html).toMatch(/<button[^>]*rr-pill-reset[^>]*>Reset<\/button>/)
    expect(html).toMatch(/<button[^>]*rr-pill-start[^>]*>Start<\/button>/)
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
  it("is a whole game the reducer accepts: countdown first, game over at the end", () => {
    const script = demoScript("DEMO-1")
    expect(script[0].event.type).toBe("countdown_started")
    let state = INITIAL_LIVE
    const phases = []
    for (const { at, event } of script) {
      state = liveReducer(state, { type: "event", event }, at)
      phases.push(state.phase)
    }
    expect(state.phase).toBe("finished")
    expect(phases.filter((p) => p === "countdown")).toHaveLength(1) // retries never count down
    expect(script.map((s) => s.at)).toEqual([...script.map((s) => s.at)].sort((a, b) => a - b))
  })
})
