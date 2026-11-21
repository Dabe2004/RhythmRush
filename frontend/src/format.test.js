// frontend/src/format.test.js
// Unit tests for the small display helpers.

import { describe, expect, it } from "vitest"

import {
  animalArticle,
  findRank,
  formatClock,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatSeconds,
  formatScore,
  levelReached,
  outcomeTitle,
  parseServerTime,
} from "./format"

describe("formatPercent", () => {
  it("shows a 0-1 ratio as a percentage with at most one decimal", () => {
    expect(formatPercent(0.5)).toBe("50%")
    expect(formatPercent(0.1645)).toBe("16.5%")
    expect(formatPercent(0)).toBe("0%")
    expect(formatPercent(1)).toBe("100%")
  })

  it("shows a dash when there is no value (empty database)", () => {
    expect(formatPercent(null)).toBe("-")
  })
})

describe("formatSeconds", () => {
  it("turns milliseconds into seconds with two decimals", () => {
    expect(formatSeconds(4100)).toBe("4.10 s")
    expect(formatSeconds(0)).toBe("0.00 s")
  })

  it("shows a dash for missing values", () => {
    expect(formatSeconds(null)).toBe("-")
  })
})

describe("formatDuration", () => {
  it("uses seconds below a minute and minutes above", () => {
    expect(formatDuration(42)).toBe("42 seconds")
    expect(formatDuration(90)).toBe("1 minute 30 seconds")
    expect(formatDuration(120)).toBe("2 minutes")
    expect(formatDuration(61)).toBe("1 minute 1 second")
  })

  it("shows a dash for missing values", () => {
    expect(formatDuration(undefined)).toBe("-")
  })
})

describe("parseServerTime", () => {
  it("reads SQLite CURRENT_TIMESTAMP text as UTC", () => {
    const date = parseServerTime("2026-11-21 09:30:45")

    expect(date.toISOString()).toBe("2026-11-21T09:30:45.000Z")
  })

  it("returns null for missing or broken text", () => {
    expect(parseServerTime(null)).toBeNull()
    expect(parseServerTime("yesterday")).toBeNull()
  })
})

describe("formatScore", () => {
  it("adds thousands separators", () => {
    expect(formatScore(12442)).toBe("12,442")
    expect(formatScore(1000)).toBe("1,000")
    expect(formatScore(127)).toBe("127")
    expect(formatScore(0)).toBe("0")
  })

  it("shows a dash for missing values", () => {
    expect(formatScore(null)).toBe("-")
    expect(formatScore(undefined)).toBe("-")
    expect(formatScore("12")).toBe("-")
  })
})

describe("outcomeTitle", () => {
  it("names the two outcomes", () => {
    expect(outcomeTitle("win")).toBe("You Win!")
    expect(outcomeTitle("game_over")).toBe("Game Over")
  })

  it("falls back to Game Over for anything unexpected", () => {
    expect(outcomeTitle(null)).toBe("Game Over")
  })
})

describe("levelReached", () => {
  it("is the level of the last attempt (sequence length - 2)", () => {
    // Died on level 2 after clearing level 1.
    expect(
      levelReached({ final_sequence_length: 4, highest_level_completed: 1 }),
    ).toBe(2)
    // Cleared all 15 levels.
    expect(
      levelReached({ final_sequence_length: 17, highest_level_completed: 15 }),
    ).toBe(15)
  })

  it("is level 1 for a game that failed level 1 three times", () => {
    expect(
      levelReached({ final_sequence_length: 3, highest_level_completed: 0 }),
    ).toBe(1)
  })

  it("falls back to highest_level_completed when the length is missing", () => {
    expect(levelReached({ highest_level_completed: 7 })).toBe(7)
    expect(levelReached({ highest_level_completed: 0 })).toBe(1)
  })

  it("is null when nothing is known", () => {
    expect(levelReached(null)).toBeNull()
    expect(levelReached({})).toBeNull()
  })
})

describe("findRank", () => {
  const entries = [
    { rank: 1, session_id: "A" },
    { rank: 2, session_id: "B" },
    { rank: 2, session_id: "C" },
  ]

  it("returns the rank of the game", () => {
    expect(findRank(entries, "A")).toBe(1)
    expect(findRank(entries, "C")).toBe(2)
  })

  it("returns null when the game is not in the list", () => {
    expect(findRank(entries, "Z")).toBeNull()
    expect(findRank([], "A")).toBeNull()
    expect(findRank(null, "A")).toBeNull()
  })
})

describe("animalArticle", () => {
  it("uses 'an' before a vowel sound", () => {
    expect(animalArticle("Elephant")).toBe("an")
    expect(animalArticle("Orangutan")).toBe("an")
  })

  it("uses 'a' otherwise", () => {
    expect(animalArticle("Chimpanzee")).toBe("a")
    expect(animalArticle("Bottlenose Dolphin")).toBe("a")
    expect(animalArticle("Pig")).toBe("a")
    expect(animalArticle("")).toBe("a")
  })
})

describe("Philippine time, 12-hour clock", () => {
  it("shows Manila time with AM/PM, never a 24-hour clock", () => {
    expect(formatClock(new Date("2026-11-21T12:27:05Z"))).toBe("8:27:05 PM")
    expect(formatClock(new Date("2026-11-21T00:05:00Z"))).toBe("8:05:00 AM")
    expect(formatDateTime("2026-11-21 12:27:05")).toBe("Nov 21, 2026, 8:27:05 PM")
    expect(formatDateTime("not a time")).toBe("-")
  })
})
