// frontend/src/components/ScoreCounter.jsx
// A score shown like a mechanical counter: one box per digit.
// Screen readers get the plain number ("12,508"); the boxes are hidden from
// them.

import { formatScore } from "../format"

/**
 * @param {object} props
 * @param {number} props.value
 * @param {"dark"|"light"} [props.tone]
 * @param {string} [props.className]  font size etc.
 */
export default function ScoreCounter({ value, tone = "light", className = "" }) {
  const text = formatScore(value)

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className={`counter counter-${tone}`}>
        {[...text].map((char, index) =>
          /\d/.test(char) ? (
            <span key={index} className="counter-digit">
              {char}
            </span>
          ) : (
            <span key={index} className="counter-sep">
              {char}
            </span>
          ),
        )}
      </span>
    </span>
  )
}
