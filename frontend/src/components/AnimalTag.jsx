// frontend/src/components/AnimalTag.jsx
// Shows the animal emoji, its name, and the fun IQ.

import { animalEmoji } from "../theme"

export default function AnimalTag({ animal, iq }) {
  if (!animal) {
    return <span className="text-slate-500">-</span>
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span aria-hidden="true" className="text-2xl leading-none">
        {animalEmoji(animal)}
      </span>
      <span>{animal}</span>
      {iq !== null && iq !== undefined ? (
        <span className="text-slate-400">· IQ {iq}</span>
      ) : null}
    </span>
  )
}
