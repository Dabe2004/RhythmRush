// frontend/src/content/howToPlayPage.test.jsx
// Static rendering checks (react-dom/server): the nav, the brochure anchors,
// the "?" links, no help links on the TV screen, the one print button, the
// A4 print rules and the print-only QR box with its Wi-Fi lines.

import fs from "node:fs"

import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"

import { Shell } from "../App"
import HelpLink from "../components/HelpLink"
import PrintQr from "../components/PrintQr"
import ResultCard from "../components/ResultCard"
import HowToPlay from "../pages/HowToPlay"
import Result from "../pages/Result"
import { brochure } from "./howToPlay"

const at = (url, node) => renderToStaticMarkup(<MemoryRouter initialEntries={[url]}>{node}</MemoryRouter>)

describe("navigation", () => {
  it("shows three booth signs: Live game, Leaderboard, How to play", () => {
    const html = at("/nowhere", <Shell />)
    const nav = html.match(/<nav aria-label="Main"[^]*?<\/nav>/)[0]
    expect([...nav.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)/g)].map((m) => [m[1], m[2]])).toEqual([
      ["/live", "Live game"],
      ["/leaderboard", "Leaderboard"],
      ["/how-to-play", "How to play"],
    ])
    expect(html).toContain('href="#main"') // skip link
    expect(html).toMatch(/<footer[^>]*>[^]*href="\/how-to-play"/) // "?" in the footer
  })
})

describe("brochure page", () => {
  const html = at("/how-to-play", <HowToPlay />)

  it("has every panel anchor and the four jump links", () => {
    for (const id of ["play", "how", "lives", "score", "rank", "animal", "good"]) {
      expect(html).toContain(`id="${id}" tabindex="-1"`)
    }
    for (const id of ["play", "score", "rank", "animal"]) expect(html).toContain(`href="#${id}"`)
    expect(html).toContain("<table")
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("<h2"))
  })

  it("has no popup or dialog, and no QR on screen", () => {
    expect(html).not.toMatch(/role="dialog"|<dialog/)
    expect(html).not.toContain("<svg viewBox=\"-4")
  })

  it("has one print button and no paper choice", () => {
    expect(html.match(/<button[^>]*>[^<]*<\/button>/g).filter((b) => /print/i.test(b))).toEqual([
      expect.stringContaining(">Print this page</button>"),
    ])
    expect(html).not.toContain("A5")
  })
})

describe("brochure page in Filipino", () => {
  // The page reads the chosen language from localStorage.
  globalThis.localStorage = { getItem: () => "fil", setItem: () => {} }
  const html = at("/how-to-play", <HowToPlay />)
  delete globalThis.localStorage

  it("has the same one print button, in Filipino, and no review note", () => {
    expect(html).toContain('lang="fil"')
    expect(html.match(/<button[^>]*>[^<]*<\/button>/g).filter((b) => /print/i.test(b))).toEqual([
      expect.stringContaining(">I-print ang pahinang ito</button>"),
    ])
    expect(html).not.toMatch(/Paalala|katutubong/)
  })

  it("prints the Wi-Fi and QR lines in Filipino", () => {
    const qr = renderToStaticMarkup(<PrintQr ui={brochure("fil").ui} location={{ origin: "http://192.168.1.5:3000", hostname: "192.168.1.5" }} env={{}} />)
    const text = qr.replace(/<[^>]+>/g, "")
    expect(text).toContain("Kumonekta muna sa Wi-Fi ng booth")
    expect(text).toContain("Wi-Fi: ____________")
    expect(text).toContain("I-scan para buksan sa phone mo")
    expect(text).not.toContain("Password")
  })
})

describe("print CSS: one portrait A4 page", () => {
  const css = fs.readFileSync("src/index.css", "utf8")

  it("sets the page size and margin, with no other paper rules", () => {
    expect(css).toMatch(/@page \{\s*size: A4 portrait;\s*margin: 12mm;\s*\}/)
    expect(css).not.toMatch(/A5|data-paper/)
  })

  it("fits Filipino with spacing only: no smaller text", () => {
    const rules = [...css.matchAll(/\.brochure\[lang="fil"\] ([^{]+)\{([^}]*)\}/g)]
    expect(rules.length).toBeGreaterThan(0)
    for (const [, selector, body] of rules) {
      if (body.includes("font-size")) expect(selector.trim()).toBe(".brochure-num")
    }
  })

  it("prints the Good to know bullets as solid black dots", () => {
    // A border prints even with "Background graphics" off.
    expect(css).toMatch(/@media print \{[^]*\.brochure-bullets li::before \{[^}]*border: [\d.]+mm solid #000 !important;/)
  })
})

describe('"?" help links', () => {
  it("point to the rank and animal panels with a clear name", () => {
    const rank = at("/", <HelpLink topic="rank" />)
    expect(rank).toContain('href="/how-to-play#rank"')
    expect(rank).toContain('aria-label="How is the rank decided?"')
    expect(at("/", <HelpLink topic="animal" />)).toContain('href="/how-to-play#animal"')
  })

  it("sit next to the rank stamp and the animal on the result", () => {
    const detail = {
      session: { session_id: "S-1", outcome: "game_over", final_score: 350, final_sequence_length: 5, highest_level_completed: 2, nickname: null },
      prediction: { skill_rank: "Pro", animal: "Pig", animal_iq: 55 },
    }
    const html = at("/result/S-1", <ResultCard detail={detail} nickname={null} />)
    expect(html).toContain('href="/how-to-play#rank"')
    expect(html).toContain('href="/how-to-play#animal"')
  })

  it("are not on the TV screen while it waits or shows a game", () => {
    expect(at("/live", <Result />)).not.toContain("/how-to-play#")
  })
})

describe("QR code: print only", () => {
  const ui = brochure("en").ui
  const lan = { origin: "http://192.168.1.5:3000", hostname: "192.168.1.5" }
  const text = (html) => html.replace(/<[^>]+>/g, "")

  it("is in the page for a LAN address, hidden by CSS outside print", () => {
    const html = renderToStaticMarkup(<PrintQr ui={ui} location={lan} env={{}} />)
    expect(html).toContain('class="print-only print-qr"')
    expect(html).toContain('data-url="http://192.168.1.5:3000/how-to-play"')
    expect(html).toContain("Scan to open on your phone")
    const css = fs.readFileSync("src/index.css", "utf8")
    expect(css).toMatch(/\.print-only \{\s*display: none;/)
    expect(css).toMatch(/@media print \{[^]*\.print-only \{\s*display: block !important;/)
  })

  it("prints the staff line instead of a QR on localhost", () => {
    const html = renderToStaticMarkup(<PrintQr ui={ui} location={{ origin: "http://localhost:3000", hostname: "localhost" }} env={{}} />)
    expect(html).not.toContain("<svg")
    expect(html).toContain("Ask the staff for the game address")
  })

  it("asks for the booth Wi-Fi first, with a write-in line when no name is set", () => {
    const html = text(renderToStaticMarkup(<PrintQr ui={ui} location={lan} env={{}} />))
    expect(html).toContain("Join the booth Wi-Fi first")
    expect(html).toContain("Wi-Fi: ____________")
    expect(html.indexOf("Wi-Fi first")).toBeLessThan(html.indexOf("Scan to open"))
    expect(html).not.toContain("Password")
  })

  it("prints the Wi-Fi name, and a password only when one is set", () => {
    const named = text(renderToStaticMarkup(<PrintQr ui={ui} location={lan} env={{ VITE_WIFI_NAME: "RhythmBooth" }} />))
    expect(named).toContain("Wi-Fi: RhythmBooth")
    expect(named).not.toContain("____")
    expect(named).not.toContain("Password")
    const both = text(renderToStaticMarkup(<PrintQr ui={ui} location={lan} env={{ VITE_WIFI_NAME: "RhythmBooth", VITE_WIFI_PASSWORD: "letmein42" }} />))
    expect(both).toContain("Password: letmein42")
  })
})
