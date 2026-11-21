// frontend/src/components/AnimalTag.jsx
// The animal result as a small hanging prize tag: illustration, name, IQ.

import AnimalIcon from "./animals/AnimalIcon"

// size: the drawing, never below 44 px on a ticket.
// className: e.g. a fixed width so tags line up in a list.
export default function AnimalTag({ animal, iq, size = 44, className = "" }) {
  if (!animal) {
    return <span className={`text-sm font-extrabold text-muted ${className}`}>No prize</span>
  }

  return (
    <span className={`prize-tag ${className}`}>
      <AnimalIcon animal={animal} size={Math.max(44, size)} className="shrink-0" />
      <span className="min-w-0 leading-tight">
        {/* Two compact lines at most, so "Bottlenose Dolphin" is never cut. */}
        <span className="line-clamp-2 text-[0.8rem] font-extrabold leading-[1.15]">{animal}</span>
        {iq !== null && iq !== undefined ? (
          <span className="block font-sign text-xs">IQ {iq}</span>
        ) : null}
      </span>
    </span>
  )
}
