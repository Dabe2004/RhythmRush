// frontend/src/components/StatusMessage.jsx
// One component for the three page states, drawn as booth signs:
//   loading - the six buttons light up in sequence
//   error   - an "Out of order" sign taped up (compact = taped over old data)
//   empty   - a closed booth: "Step right up! No games yet."

import ArcadeButtons from "./ArcadeButtons"

// Two strips of tape on the top corners of a sign.
function Tape() {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute -top-3 left-6 h-6 w-16 -rotate-6 border border-ink/30 bg-ticket/80"
      />
      <span
        aria-hidden="true"
        className="absolute -top-3 right-6 h-6 w-16 rotate-6 border border-ink/30 bg-ticket/80"
      />
    </>
  )
}

// A little booth with its shutter down and a CLOSED sign.
function ClosedBooth() {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" role="img" aria-label="A closed game booth">
      <g stroke="#1d1a2f" strokeWidth="3" strokeLinejoin="round">
        <rect x="20" y="44" width="120" height="70" fill="#fffaee" />
        <path d="M20 44h120" />
        <rect x="32" y="56" width="96" height="40" fill="#d8c9a6" />
        <path d="M32 66h96M32 76h96M32 86h96" strokeWidth="2" />
        <path d="M14 20h132l-6 24H20z" fill="#b3261e" />
        <path d="M36 20l-4 24M58 20l-2 24M80 20v24M102 20l2 24M124 20l4 24" strokeWidth="2.5" />
        <path d="M80 6v14" />
        <path d="M54 92l52-6 3 22-52 6z" fill="#f6c522" />
      </g>
      <text
        x="81"
        y="106"
        textAnchor="middle"
        fontFamily="Bungee, sans-serif"
        fontSize="13"
        fill="#1d1a2f"
        transform="rotate(-6 81 102)"
      >
        CLOSED
      </text>
    </svg>
  )
}

function RetryButton({ onRetry }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="sign min-h-[44px] bg-tent px-5 py-2 text-base text-cream transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
    >
      Retry
    </button>
  )
}

export default function StatusMessage({
  variant,
  error,
  onRetry,
  compact = false,
  title = "Could not load the leaderboard",
}) {
  if (variant === "loading") {
    return (
      <div role="status" className="flex flex-col items-start gap-5 py-10">
        <ArcadeButtons sequence size="2.5rem" />
        <p className="font-sign text-lg">Loading the scores...</p>
      </div>
    )
  }

  if (variant === "error") {
    return (
      <div
        role="alert"
        className={`relative inline-block max-w-xl -rotate-2 border-[3px] border-ink bg-paint-yellow shadow-hard-lg ${
          compact ? "px-5 pb-4 pt-5" : "px-7 pb-6 pt-7"
        }`}
      >
        <Tape />
        <p className={`font-sign ${compact ? "text-2xl" : "text-3xl sm:text-4xl"}`}>Out of order</p>
        <p className="mt-1 text-lg font-extrabold">{title}</p>
        <p className="text-base">{error?.message || "Unknown error"}</p>
        {onRetry ? (
          <div className="mt-4">
            <RetryButton onRetry={onRetry} />
          </div>
        ) : null}
      </div>
    )
  }

  if (variant === "empty") {
    return (
      <div className="ticket ticket-notched flex flex-col gap-6 px-8 py-10 sm:flex-row sm:items-center sm:px-12">
        <ClosedBooth />
        <div>
          <p className="font-sign text-3xl text-tent sm:text-4xl">Step right up!</p>
          <p className="mt-2 text-2xl font-extrabold">No games yet.</p>
          <p className="text-lg text-muted">Press Start on the device!</p>
        </div>
      </div>
    )
  }

  return null
}
