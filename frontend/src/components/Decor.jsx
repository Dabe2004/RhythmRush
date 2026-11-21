// frontend/src/components/Decor.jsx
// Purely decorative carnival pieces (hidden from screen readers):
// marquee bulb rail, scalloped awning edge, bunting flags, CSS confetti.

import { useId } from "react"

import { ARCADE_COLORS } from "../theme"

// Enough bulbs for a 2560 px wide screen; the rail hides the rest.
const BULBS = Array.from({ length: 96 }, (_, index) => index)

export function MarqueeBulbs({ className = "" }) {
  return (
    <div className={`bulb-rail ${className}`} aria-hidden="true">
      {BULBS.map((index) => (
        <span key={index} className="bulb" />
      ))}
    </div>
  )
}

// Half-circle flaps under the striped awning, red and cream in turn, lined up
// with the 56 px stripes.
export function Scallops({ className = "" }) {
  const id = useId()
  return (
    <svg className={`block h-[22px] w-full ${className}`} aria-hidden="true">
      <defs>
        <pattern id={id} width="112" height="22" patternUnits="userSpaceOnUse">
          <path d="M1.5 0H54.5A26.5 19 0 0 1 1.5 0Z" fill="#b3261e" stroke="#1d1a2f" strokeWidth="3" />
          <path d="M57.5 0H110.5A26.5 19 0 0 1 57.5 0Z" fill="#fffaee" stroke="#1d1a2f" strokeWidth="3" />
        </pattern>
      </defs>
      <rect width="100%" height="22" fill={`url(#${id})`} />
    </svg>
  )
}

// A string of triangular flags in the six button colours.
export function Bunting({ className = "" }) {
  const id = useId()
  return (
    <svg className={`block h-[44px] w-full ${className}`} aria-hidden="true">
      <defs>
        <pattern id={id} width="288" height="44" patternUnits="userSpaceOnUse">
          {ARCADE_COLORS.map((color, index) => {
            const x = index * 48
            const y = 4 + (index % 3) * 1.5
            return (
              <path
                key={color.name}
                d={`M${x + 4} ${y}H${x + 44}L${x + 24} ${y + 34}Z`}
                fill={color.hex}
                stroke="#1d1a2f"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            )
          })}
          <path d="M0 4Q144 10 288 4" fill="none" stroke="#1d1a2f" strokeWidth="3" />
        </pattern>
      </defs>
      <rect width="100%" height="44" fill={`url(#${id})`} />
    </svg>
  )
}

// Confetti for a win: 36 paper bits fall once and are gone within 4 s
// (longest piece: 0.96 s delay + 2.88 s fall = 3.84 s). Positions are fixed
// numbers, not random, so every win looks the same. It is drawn as a
// backdrop behind the result (see .confetti in index.css).
const PIECES = Array.from({ length: 36 }, (_, index) => ({
  "--x": `${(index * 37 + 3) % 100}%`,
  "--delay": `${(index % 9) * 0.12}s`,
  "--d": `${2.4 + (index % 5) * 0.12}s`,
  "--drift": `${((index * 53) % 140) - 70}px`,
  "--spin": `${((index * 97) % 720) - 360}deg`,
  "--c": ARCADE_COLORS[index % ARCADE_COLORS.length].hex,
}))

export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {PIECES.map((style, index) => (
        <span key={index} className="confetti-piece" style={style} />
      ))}
    </div>
  )
}
