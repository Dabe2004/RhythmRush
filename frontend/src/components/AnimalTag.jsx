// frontend/src/components/AnimalTag.jsx
// The animal result as a small hanging animal tag: illustration, name, fun IQ number.

import AnimalIcon from "./animals/AnimalIcon"
import { visitorText } from "../content/visitorText"

// size: the drawing, never below 44 px on a ticket.
// className: e.g. a fixed width so tags line up in a list.
export default function AnimalTag({ animal, iq, size = 44, className = "" }) {
  if (!animal) {
    return <span className={`text-sm font-extrabold text-muted ${className}`}>{visitorText.leaderboard.noAnimal}</span>
  }

  return (
    <span className={`animal-tag ${className}`}>
      <AnimalIcon animal={animal} size={Math.max(44, size)} className="shrink-0" />
      <span className="min-w-0 leading-tight">
        {/* Two compact lines at most, so "Bottlenose Dolphin" is never cut. */}
        <span className="line-clamp-2 text-[0.8rem] font-extrabold leading-[1.15]">{animal}</span>
        {iq !== null && iq !== undefined ? (
          <span className="block font-sign text-xs">{visitorText.result.iq(iq)}</span>
        ) : null}
      </span>
    </span>
  )
}
