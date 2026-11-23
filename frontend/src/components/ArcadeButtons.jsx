// frontend/src/components/ArcadeButtons.jsx
// The six coloured game buttons, the brand motif: shown still, or lighting
// up one after another like the game does (sequence), which is also used as
// the loading animation. Colours only, no note names.

import { visitorText } from "../content/visitorText"
import { ARCADE_COLORS } from "../theme"

/**
 * @param {object} props
 * @param {boolean} [props.sequence]  light up one after another (CSS only)
 * @param {string}  [props.size]      button diameter (CSS length)
 * @param {string}  [props.className]
 */
export default function ArcadeButtons({ sequence = false, size = "3rem", className = "" }) {
  return (
    <div
      role="img"
      aria-label={visitorText.common.sixButtons}
      className={`flex items-start gap-3 sm:gap-5 ${sequence ? "arcade-sequence" : ""} ${className}`}
      style={{ "--btn-size": size }}
    >
      {ARCADE_COLORS.map((color, index) => (
        <span key={index} className="arcade-btn" style={{ "--paint": color.hex, "--i": index }}>
          <span className="arcade-btn-lit" />
        </span>
      ))}
    </div>
  )
}
