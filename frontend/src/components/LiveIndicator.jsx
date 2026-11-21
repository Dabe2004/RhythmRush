// frontend/src/components/LiveIndicator.jsx
// "LIVE" in the header and "A game is in progress" on the leaderboard, both
// only while a game runs on the device. A pulsing marquee bulb PLUS the text,
// so the state never depends on colour or motion alone.

import { Link } from "react-router-dom"

import { visitorText } from "../content/visitorText"
import { isGameActive } from "../live/liveReducer"

const V = visitorText.live
import { useLiveClock } from "../live/usePanel"
import useLiveGame from "../live/useLiveGame"

// Re-checked every 5 s while a game runs, so 90 s of device silence hides it.
function useGameActive() {
  const { state } = useLiveGame()
  const [now] = useLiveClock(state, state.phase === "idle" ? null : 5000)
  return isGameActive(state, now)
}

export function LiveIndicatorView({ active }) {
  // Hidden but still taking its space (not a link, not focusable).
  if (!active) {
    return (
      <span className="live-indicator sign invisible px-3 py-2 text-sm sm:text-base" aria-hidden="true">
        <span className="inline-block h-[14px] w-[14px]" />
        {V.indicator}
      </span>
    )
  }
  return (
    <Link to="/live" className="live-indicator sign -rotate-1 bg-midnight px-3 py-2 text-sm text-cream sm:text-base">
      <span className="live-bulb" aria-hidden="true" />
      {V.indicator}
      <span className="sr-only">{V.indicatorHint}</span>
    </Link>
  )
}

export function LiveBannerView({ active }) {
  if (!active) return null
  return (
    <Link
      to="/live"
      className="mx-auto mb-4 flex w-full max-w-[1200px] items-center gap-3 border-[3px] border-ink bg-midnight px-4 py-2 font-extrabold text-cream shadow-hard transition-transform hover:-translate-y-0.5"
    >
      <span className="live-bulb" aria-hidden="true" />
      {visitorText.leaderboard.banner} <span className="underline">{visitorText.leaderboard.bannerLink}</span>
    </Link>
  )
}

export function LiveIndicator() {
  return <LiveIndicatorView active={useGameActive()} />
}

export function LiveBanner() {
  return <LiveBannerView active={useGameActive()} />
}
