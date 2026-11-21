// frontend/src/content/wordingRules.js
// The visitor wording rules as code, used by the tests (not by the app).
// See docs/FRONTEND.md "Visitor text".

// Whole words or phrases, case-insensitive. Code and docs may use them; text
// a visitor reads may not.
export const BANNED_WORDS = [
  "sequence", "playback", "input", "phase", "reaction time", "response time", "deadline", "timeout",
  "accuracy", "success rate", "percentile", "tier", "nearest neighbor", "similarity", "matcher",
  "decision tree", "classifier", "model", "algorithm", "AI", "machine learning", "synthetic", "trained",
  "latency", "reconnecting", "offline", "mirror", "kiosk", "session", "prediction", "threshold",
  "feature", "data", "API", "backend", "prize", "ML", "UI", "LCD",
]

// "sec", "secs", "min", "mins", "hr" or a number glued to "s" ("3s").
const ABBREVIATION = /\b(secs?|mins?|hrs?)\b|\b\d+(\.\d+)?s\b/i

export function bannedIn(text) {
  return BANNED_WORDS.filter((word) => new RegExp(`(^|[^A-Za-z])${word}($|[^A-Za-z])`, "i").test(text))
}

export function hasAbbreviation(text) {
  return ABBREVIATION.test(text)
}

export function words(text) {
  return text.split(/\s+/).filter((token) => /[A-Za-z0-9]/.test(token))
}

// Sentences end at . ! or ? followed by a space or the end ("4.5" stays whole).
export function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => words(s).length > 0)
}

function syllables(word) {
  if (/\d/.test(word)) return 2 // numbers are read as about two syllables
  const w = word.toLowerCase().replace(/[^a-z]/g, "")
  if (w.length <= 3) return 1
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

// Flesch reading ease (English): higher is easier; 70+ is "fairly easy".
export function readingEase(texts) {
  const all = texts.join(" ")
  const w = words(all)
  const s = texts.flatMap(sentences).length
  const syl = w.reduce((sum, word) => sum + syllables(word), 0)
  return 206.835 - 1.015 * (w.length / s) - 84.6 * (syl / w.length)
}

// Every string inside an object (functions are called with sample values).
export function allStrings(value) {
  if (typeof value === "string") return [value]
  if (typeof value === "function") return allStrings(value(7, 8, 9, 10))
  if (Array.isArray(value)) return value.flatMap(allStrings)
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings)
  return []
}
