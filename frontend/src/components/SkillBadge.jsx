// frontend/src/components/SkillBadge.jsx
// The ML skill label as a rubber stamp: tilted, double ink border, the word
// itself in stamp ink. The word carries the meaning, not the colour.

import { stampColor } from "../theme"

// size: "lg" = the big stamp on the result screen, "xs" = slim list rows.
const SIZES = { lg: "text-2xl sm:text-4xl", sm: "text-base", xs: "text-xs" }

export default function SkillBadge({ value, size = "sm" }) {
  if (!value) {
    return <span className="text-muted">-</span>
  }

  const sizeClasses = SIZES[size] || SIZES.sm

  return (
    <span className={`stamp ${sizeClasses}`} style={{ color: stampColor(value) }}>
      {value}
    </span>
  )
}
