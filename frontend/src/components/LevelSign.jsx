// frontend/src/components/LevelSign.jsx
// "Level 9" on a small nailed-up sign.

// small: a narrower sign for tight podium cards.
export default function LevelSign({ level, suffix = "", small = false, className = "" }) {
  if (typeof level !== "number") return <span className="text-muted">-</span>

  return (
    <span
      className={`sign -rotate-1 bg-cream shadow-hard-sm ${
        small ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      } ${className}`}
    >
      Level {level}
      {suffix}
    </span>
  )
}
