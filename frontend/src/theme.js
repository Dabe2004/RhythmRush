// frontend/src/theme.js
// Colours and small style helpers shared by the pages.

// The six arcade buttons, in button order.
export const ARCADE_COLORS = [
  { name: "Red", hex: "#ef4444" },
  { name: "Orange", hex: "#f97316" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Green", hex: "#22c55e" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Purple", hex: "#a855f7" },
]

// Tailwind classes for the skill badges.
const SKILL_STYLES = {
  Beginner: "bg-green-500/15 text-green-300 ring-green-400/40",
  Intermediate: "bg-blue-500/15 text-blue-300 ring-blue-400/40",
  Pro: "bg-purple-500/15 text-purple-300 ring-purple-400/40",
}

const DEFAULT_SKILL_STYLE = "bg-slate-500/15 text-slate-300 ring-slate-400/40"

export function skillStyle(value) {
  return SKILL_STYLES[value] || DEFAULT_SKILL_STYLE
}

// Animal -> emoji. The default covers nulls and future model labels.
const ANIMAL_EMOJI = {
  Chimpanzee: "🐵",
  "Bottlenose Dolphin": "🐬",
  Elephant: "🐘",
  Orangutan: "🦧",
  Pig: "🐷",
}

export function animalEmoji(value) {
  return ANIMAL_EMOJI[value] || "🎮"
}
