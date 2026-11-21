// frontend/src/leaderboard.test.js
// Unit tests for the Top 10 page helpers (subtitle text, podium split).

import { describe, expect, it } from "vitest"

import { LEADERBOARD_LIMIT, leaderboardSubtitle, splitPodium } from "./leaderboard"

describe("LEADERBOARD_LIMIT", () => {
  it("shows the top 10", () => {
    expect(LEADERBOARD_LIMIT).toBe(10)
  })
})

describe("leaderboardSubtitle", () => {
  it("says 'The 10 best scores' when the board is full", () => {
    expect(leaderboardSubtitle(10)).toBe(
      "The 10 best scores so far. Tap a ticket to see how the game went.",
    )
  })

  it("counts the scores when there are fewer than 10", () => {
    expect(leaderboardSubtitle(7)).toBe(
      "All 7 scores so far. Tap a ticket to see how the game went.",
    )
    expect(leaderboardSubtitle(2)).toBe(
      "All 2 scores so far. Tap a ticket to see how the game went.",
    )
  })

  it("uses the singular for one score", () => {
    expect(leaderboardSubtitle(1)).toBe(
      "All 1 score so far. Tap a ticket to see how the game went.",
    )
  })

  it("is empty when there are no scores (the empty state speaks)", () => {
    expect(leaderboardSubtitle(0)).toBe("")
  })
})

// Entries as the API sends them: RANK() order, ties share a number.
function entry(rank, id) {
  return { rank, session_id: id }
}

describe("splitPodium", () => {
  it("puts ranks 1-3 on the podium and 4+ in the list, in API order", () => {
    const entries = [1, 2, 3, 4, 5].map((rank) => entry(rank, `S${rank}`))
    const { champions, runnersUp, rest } = splitPodium(entries)

    expect(champions.map((e) => e.session_id)).toEqual(["S1"])
    expect(runnersUp.map((e) => e.session_id)).toEqual(["S2", "S3"])
    expect(rest.map((e) => e.session_id)).toEqual(["S4", "S5"])
  })

  it("keeps a tie at ranks 2-3: both entries stay rank 2, in API order", () => {
    const entries = [entry(1, "A"), entry(2, "B"), entry(2, "C"), entry(4, "D")]
    const { champions, runnersUp, rest } = splitPodium(entries)

    expect(champions.map((e) => e.session_id)).toEqual(["A"])
    expect(runnersUp.map((e) => [e.session_id, e.rank])).toEqual([
      ["B", 2],
      ["C", 2],
    ])
    expect(rest.map((e) => [e.session_id, e.rank])).toEqual([["D", 4]])
  })

  it("never hides tied entries: a tie at rank 3 keeps both on the podium", () => {
    const entries = [entry(1, "A"), entry(2, "B"), entry(3, "C"), entry(3, "D"), entry(5, "E")]
    const { champions, runnersUp, rest } = splitPodium(entries)

    expect(champions).toHaveLength(1)
    expect(runnersUp.map((e) => e.session_id)).toEqual(["B", "C", "D"])
    expect(rest.map((e) => e.session_id)).toEqual(["E"])
  })

  it("a tie for first gives two champions", () => {
    const { champions, runnersUp } = splitPodium([entry(1, "A"), entry(1, "B"), entry(3, "C")])

    expect(champions.map((e) => e.session_id)).toEqual(["A", "B"])
    expect(runnersUp.map((e) => e.session_id)).toEqual(["C"])
  })

  it("handles fewer than 3 entries, and no entries", () => {
    expect(splitPodium([entry(1, "A")])).toEqual({
      champions: [entry(1, "A")],
      runnersUp: [],
      rest: [],
    })
    expect(splitPodium([])).toEqual({ champions: [], runnersUp: [], rest: [] })
    expect(splitPodium(null)).toEqual({ champions: [], runnersUp: [], rest: [] })
  })
})
