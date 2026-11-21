// frontend/src/components/RankBadge.jsx
// Rank 1-3: a flat painted prize ribbon (gold, silver, bronze) with the number.
// Every other rank: a small numbered ticket stub. The number is always there,
// so the colour is never the only signal. Equal scores share a rank.

import { ribbonColor, ribbonName } from "../theme"

// Twelve round petals around the centre of the rosette.
const PETALS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2
  return { cx: 32 + Math.cos(angle) * 17, cy: 26 + Math.sin(angle) * 17 }
})

export default function RankBadge({ rank, size = 56 }) {
  const color = ribbonColor(rank)

  if (!color) {
    return (
      <span
        aria-label={`Rank ${rank}`}
        className="inline-flex min-w-[3.25rem] flex-col items-center rounded-[4px] border-2 border-ink bg-cream px-2 py-1 leading-none shadow-hard-sm"
      >
        <span aria-hidden="true" className="text-[0.65rem] font-extrabold uppercase tracking-wider text-muted">
          No.
        </span>
        <span aria-hidden="true" className="font-sign text-xl">
          {rank}
        </span>
      </span>
    )
  }

  return (
    <svg
      viewBox="0 0 64 72"
      width={size}
      height={(size * 72) / 64}
      role="img"
      aria-label={`Rank ${rank}, ${ribbonName(rank)} ribbon`}
    >
      <g stroke="#1d1a2f" strokeWidth="3" strokeLinejoin="round">
        <path d="M20 38L12 68l10-6 6 9 8-31z" fill={color} />
        <path d="M44 38l8 30-10-6-6 9-8-31z" fill={color} />
        {PETALS.map((petal, index) => (
          <circle key={index} cx={petal.cx} cy={petal.cy} r="7" fill={color} />
        ))}
        <circle cx="32" cy="26" r="16" fill={color} />
        <circle cx="32" cy="26" r="11.5" fill="#fffaee" strokeWidth="2.5" />
      </g>
      <text
        x="32"
        y="32.5"
        textAnchor="middle"
        fontFamily="Bungee, sans-serif"
        fontSize="17"
        fill="#1d1a2f"
      >
        {rank}
      </text>
    </svg>
  )
}
