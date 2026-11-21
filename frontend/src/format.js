// frontend/src/format.js
// Small display helpers shared by the pages. Pure functions, unit tested in
// format.test.js.

import { visitorText } from "./content/visitorText"

// 12442 -> "12,442". Anything that is not a number -> "-".
export function formatScore(score) {
  return typeof score === "number" && Number.isFinite(score)
    ? score.toLocaleString("en-US")
    : "-"
}

// Big headline on the result screen.
export function outcomeTitle(outcome) {
  return outcome === "win" ? visitorText.outcome.win : visitorText.outcome.over
}

// The level the player got to, i.e. the level of the LAST attempt.
// Sequence length = level + 2 (AGENTS.md game rules), so level = length - 2.
// A player who cleared level 1 and died on level 2 "reached level 2".
export function levelReached(session) {
  if (!session) return null

  const length = session.final_sequence_length
  if (Number.isInteger(length) && length >= 3) return length - 2

  const completed = session.highest_level_completed
  if (Number.isInteger(completed)) return Math.max(1, completed)

  return null
}

// Rank of one game inside a leaderboard response, or null if it is not there.
export function findRank(entries, sessionId) {
  if (!Array.isArray(entries)) return null

  const entry = entries.find((item) => item.session_id === sessionId)
  return entry ? entry.rank : null
}

// "an Elephant", "a Pig".
export function animalArticle(animal) {
  return /^[aeiou]/i.test(animal || "") ? "an" : "a"
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
}

// 0.1645 -> "16.5%". The API sends ratios in 0..1 (null with no games).
export function formatPercent(ratio) {
  if (!isNumber(ratio)) return "-"
  return `${Math.round(ratio * 1000) / 10}%`
}

// 4100 ms -> "4.10 s".
export function formatSeconds(ms) {
  if (!isNumber(ms)) return "-"
  return `${(ms / 1000).toFixed(2)} s`
}

// 90 -> "1 minute 30 seconds" (visitors read whole words, never "min" or "s").
const unit = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
export function formatDuration(seconds) {
  if (!isNumber(seconds)) return "-"
  if (seconds < 60) return unit(Math.round(seconds), "second")

  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  return rest === 0 ? unit(minutes, "minute") : `${unit(minutes, "minute")} ${unit(rest, "second")}`
}

// The booth is in the Philippines: Manila time, 12-hour clock ("8:27:05 PM").
const MANILA = { timeZone: "Asia/Manila", hour12: true }
export function formatClock(date) {
  return date.toLocaleTimeString("en-PH", { ...MANILA, hour: "numeric", minute: "2-digit", second: "2-digit" })
}

// SQLite CURRENT_TIMESTAMP text ("2026-11-21 09:30:45") is UTC without a
// time zone marker. Adding "T" and "Z" makes every browser read it as UTC.
export function parseServerTime(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return null
  }
  const date = new Date(`${text.replace(" ", "T")}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

// Date and Manila time for the game page, e.g. "Nov 21, 2026, 8:27:05 PM".
export function formatDateTime(text) {
  const date = parseServerTime(text)
  if (!date) return "-"
  return date.toLocaleString("en-PH", {
    ...MANILA,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}
