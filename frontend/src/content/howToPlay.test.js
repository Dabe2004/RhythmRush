// frontend/src/content/howToPlay.test.js
// 1. The brochure's numbers match the real rule and model files.
// 2. Wording rules for the brochure (English and Filipino) and visitorText.js.
// 3. The QR address rule and the encoded address.

import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { qrAddress, qrPath, qrTarget } from "../printQr"
import { BROCHURE_TEXT, brochure } from "./howToPlay"
import { visitorText } from "./visitorText"
import { allStrings, bannedIn, hasAbbreviation, readingEase, sentences, words } from "./wordingRules"

const ROOT = path.resolve(process.cwd(), "..")
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(ROOT, ...parts), "utf8"))
const rules = read("docs", "game_rules.json")
const animal = read("backend", "artifacts", "animal.json")

const en = brochure("en")
const text = (panelId, b = en) => allStrings(b.panels.find((p) => p.id === panelId)).join(" ")

// Prose of a panel (the animal table is data: names and number ranges).
function prose(panel) {
  return [panel.title, ...(panel.paragraphs ?? []), ...(panel.steps ?? []), ...(panel.bullets ?? []), ...(panel.notes ?? []), ...(panel.stamps ?? []).map((s) => s.text)]
}

describe("brochure numbers come from the files", () => {
  it("lives, levels, points, bonus and time limits", () => {
    const levels = rules.levels
    const shortest = Math.min(...levels.map((l) => l.deadline_ms))
    expect(text("lives")).toContain(`You have ${rules.start_lives} lives.`)
    expect(text("lives")).toContain(`There are ${rules.max_level} levels.`)
    expect(text("lives")).toContain(`At level 1 you get ${levels[0].deadline_ms / 1000} seconds`)
    expect(text("lives")).toContain(`From level ${levels.find((l) => l.deadline_ms === shortest).level} you get ${shortest / 1000} seconds.`)
    expect(text("score")).toContain(`gives ${levels[0].base_points} points times the level number`)
    const bonusMax = Math.max(...levels.flatMap((l) => l.speed_bonus_steps.map(([, b]) => b)))
    expect(text("score")).toContain(`up to ${bonusMax} bonus points`)
  })

  it("the worked example uses the real bonus table", () => {
    const first = rules.levels[0]
    const ms = (first.sequence_length * first.deadline_ms) / 2
    const bonus = first.speed_bonus_steps.filter(([from]) => from <= ms).pop()[1]
    expect(text("score")).toContain(`in ${ms / 1000} seconds`)
    expect(text("score")).toContain(`${first.base_points} points plus ${bonus} bonus points. That is ${first.base_points + bonus} points!`)
  })

  it("animal groups and fun IQ ranges match animal.json, top group first", () => {
    const tiers = [...animal.tiers].sort((a, b) => b.percentile_min - a.percentile_min)
    const table = en.panels.find((p) => p.id === "animal").table
    expect(table.map((row) => row.animal)).toEqual(tiers.map((t) => t.animal))
    expect(table.map((row) => row.iq)).toEqual(tiers.map((t) => t.iq_range.replace("-", " to ")))
    const shares = tiers.map((t, i) => Math.round(((i === 0 ? 1 : tiers[i - 1].percentile_min) - t.percentile_min) * 100))
    table.forEach((row, i) => expect(row.group).toContain(`${shares[i]}%`))
  })
})

describe("visitor wording rules", () => {
  const sets = {
    "brochure (English)": allStrings(BROCHURE_TEXT.en),
    "brochure (Filipino)": allStrings(BROCHURE_TEXT.fil),
    "visitorText.js": allStrings(visitorText),
  }

  for (const [name, strings] of Object.entries(sets)) {
    it(`${name}: no banned word, no abbreviation, sentences of 20 words or fewer`, () => {
      for (const s of strings) {
        expect(bannedIn(s), s).toEqual([])
        expect(hasAbbreviation(s), s).toBe(false)
        for (const sentence of sentences(s)) expect(words(sentence).length, sentence).toBeLessThanOrEqual(20)
      }
    })
  }

  it("every brochure panel has 70 words or fewer and reads easily (English)", () => {
    for (const lang of ["en", "fil"]) {
      for (const panel of brochure(lang).panels) {
        expect(words(prose(panel).join(" ")).length, `${lang} ${panel.id}`).toBeLessThanOrEqual(70)
      }
    }
    const scores = en.panels.map((panel) => [panel.id, Math.round(readingEase(prose(panel)))])
    console.log("Flesch reading ease per panel:", scores.map(([id, s]) => `${id} ${s}`).join(", "))
    for (const [id, score] of scores) expect(score, id).toBeGreaterThanOrEqual(70)
  })

  it("falls back to English for a missing language or key", () => {
    expect(brochure("xx").ui.title).toBe("How to play")
    expect(brochure("fil").ui.title).toBe("Paano maglaro")
    expect(brochure("fil").panels.map((p) => p.id)).toEqual(en.panels.map((p) => p.id))
  })
})

describe("QR on the printed brochure", () => {
  it("uses VITE_PUBLIC_URL first, then a LAN origin, never localhost", () => {
    expect(qrAddress({ publicUrl: "http://192.168.1.5:3000/", origin: "http://localhost:5173", hostname: "localhost" })).toBe("http://192.168.1.5:3000")
    expect(qrAddress({ origin: "http://192.168.1.5:3000", hostname: "192.168.1.5" })).toBe("http://192.168.1.5:3000")
    for (const hostname of ["localhost", "127.0.0.1", "::1"]) {
      expect(qrAddress({ origin: `http://${hostname}:3000`, hostname })).toBeNull()
    }
    expect(qrAddress({ publicUrl: "  ", origin: "http://127.0.0.1:3000", hostname: "127.0.0.1" })).toBeNull()
  })

  it("encodes <address>/how-to-play as a square code", () => {
    expect(qrTarget("http://192.168.1.5:3000")).toBe("http://192.168.1.5:3000/how-to-play")
    const { size, path: d } = qrPath(qrTarget("http://192.168.1.5:3000"))
    expect(size).toBeGreaterThanOrEqual(21)
    expect(d).toMatch(/^M\d+ \d+h1v1h-1z/)
  })
})
