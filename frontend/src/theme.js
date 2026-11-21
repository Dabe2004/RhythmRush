// frontend/src/theme.js
// Colours and labels shared by the components (see docs/DESIGN.md).

// The six game buttons, in button order, with the note each one plays.
// Flat paint colours; text is never placed on the red or blue paint.
export const ARCADE_COLORS = [
  { name: "Red", hex: "#e2412f", note: "C4" },
  { name: "Orange", hex: "#f0892b", note: "D4" },
  { name: "Yellow", hex: "#f6c522", note: "E4" },
  { name: "Green", hex: "#2f9e57", note: "F4" },
  { name: "Blue", hex: "#2f6fde", note: "G4" },
  { name: "Purple", hex: "#7c4dcc", note: "A4" },
]

// Skill stamp ink colours (all >= 5.5:1 on cream and ticket paper).
const STAMP_COLORS = {
  Beginner: "#1e6b3c",
  Intermediate: "#1f4f9e",
  Pro: "#5a2c9c",
}

export function stampColor(value) {
  return STAMP_COLORS[value] || "#1d1a2f"
}

// Prize ribbon colours for rank 1-3 (ink text on each is >= 5:1).
const RIBBON_COLORS = { 1: "#f2b630", 2: "#c9ccd4", 3: "#c77c3c" }
const RIBBON_NAMES = { 1: "gold", 2: "silver", 3: "bronze" }

export function ribbonColor(rank) {
  return RIBBON_COLORS[rank] || null
}

export function ribbonName(rank) {
  return RIBBON_NAMES[rank] || null
}
