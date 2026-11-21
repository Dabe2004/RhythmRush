// frontend/src/components/ArcadeButtons.jsx
// The six game buttons with the note each one plays (C4 ... A4). The brand
// motif: shown still, or lighting up one after another like the game does
// (sequence), which is also used as the loading animation.

import { ARCADE_COLORS } from "../theme"

/**
 * @param {object} props
 * @param {boolean} [props.sequence]  light up one after another (CSS only)
 * @param {string}  [props.size]      button diameter (CSS length)
 * @param {"ink"|"cream"} [props.labelTone] colour of the note labels
 * @param {string}  [props.labelClassName] size of the note labels
 * @param {string}  [props.className]
 */
export default function ArcadeButtons({
  sequence = false,
  size = "3rem",
  labelTone = "ink",
  labelClassName = "text-xs sm:text-sm",
  className = "",
}) {
  const labelColor = labelTone === "cream" ? "text-cream" : "text-ink"

  return (
    <div
      role="img"
      aria-label="The six game buttons and their notes: red C4, orange D4, yellow E4, green F4, blue G4, purple A4"
      className={`flex items-start gap-3 sm:gap-5 ${sequence ? "arcade-sequence" : ""} ${className}`}
      style={{ "--btn-size": size }}
    >
      {ARCADE_COLORS.map((color, index) => (
        <div key={color.name} className="flex flex-col items-center gap-2">
          <span className="arcade-btn" style={{ "--paint": color.hex, "--i": index }}>
            <span className="arcade-btn-lit" />
          </span>
          <span className={`font-sign ${labelClassName} ${labelColor}`}>{color.note}</span>
        </div>
      ))}
    </div>
  )
}
