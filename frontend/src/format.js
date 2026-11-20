// frontend/src/format.js
// Small display helpers shared by the pages. Pure functions, unit tested in
// format.test.js.

// 12442 -> "12,442". Anything that is not a number -> "-".
export function formatScore(score) {
  return typeof score === "number" && Number.isFinite(score)
    ? score.toLocaleString("en-US")
    : "-"
}

// Big headline on the result screen.
export function outcomeTitle(outcome) {
  return outcome === "win" ? "You Win!" : "Game Over"
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

// 90 -> "1 min 30 s".
export function formatDuration(seconds) {
  if (!isNumber(seconds)) return "-"
  if (seconds < 60) return `${Math.round(seconds)} s`

  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
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

// Local date and time for tables, e.g. "21 Nov 2026, 17:30:45".
export function formatDateTime(text) {
  const date = parseServerTime(text)
  if (!date) return "-"
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

// "5 min ago". `now` is a parameter so tests do not depend on the clock.
export function formatRelative(text, now = new Date()) {
  const date = parseServerTime(text)
  if (!date) return "never"

  const seconds = Math.max(0, (now.getTime() - date.getTime()) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`

  const days = Math.floor(seconds / 86400)
  return days === 1 ? "1 day ago" : `${days} days ago`
}

// 339504 -> "331.5 KB".
export function formatBytes(bytes) {
  if (!isNumber(bytes)) return "-"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
