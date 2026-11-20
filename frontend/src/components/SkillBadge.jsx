// frontend/src/components/SkillBadge.jsx
// Coloured pill for the ML skill label. Unknown or missing labels are safe.

import { skillStyle } from "../theme"

// size="lg" is the big version for the result screen.
export default function SkillBadge({ value, size = "sm" }) {
  if (!value) {
    return <span className="text-slate-500">-</span>
  }

  const sizeClasses =
    size === "lg" ? "px-5 py-2 text-2xl ring-2" : "px-3 py-1 text-sm ring-1"

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ring-inset ${sizeClasses} ${skillStyle(
        value,
      )}`}
    >
      {value}
    </span>
  )
}
