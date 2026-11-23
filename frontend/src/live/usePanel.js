// frontend/src/live/usePanel.js
// React glue for the live panel: a clock that only ticks at timeline
// boundaries (no per-frame renders), reduced motion and the debug timing.
// The drawing itself is components/LivePanel.jsx. The web page makes no
// sound: the box's buzzer is the only sound.

import { useEffect, useRef, useState } from "react"

import { panelView } from "./liveReducer"

const REDUCED = "(prefers-reduced-motion: reduce)"

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(REDUCED).matches))
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED)
    if (!query) return undefined
    const onChange = () => setReduced(query.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
  return reduced
}

// Browser time for rendering: advanced by timers, never behind the newest
// state change (state.updatedAt), so render stays pure.
export function useLiveClock(state, everyMs = null) {
  const [clock, setClock] = useState(() => performance.now())
  useEffect(() => {
    if (!everyMs) return undefined
    const timer = setInterval(() => setClock(performance.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return [Math.max(clock, state.updatedAt ?? 0), setClock]
}

// The panel view, re-rendered only at its next boundary. A hidden tab does
// not run the decorative attract loop.
export function usePanelView(state) {
  const reducedMotion = usePrefersReducedMotion()
  const [now, setClock] = useLiveClock(state)
  const view = panelView(state, now, { reducedMotion })
  const { nextAt, litKind } = view

  useEffect(() => {
    if (!Number.isFinite(nextAt)) return undefined
    if (document.hidden && litKind === "attract") return undefined
    const timer = setTimeout(() => setClock(performance.now()), Math.max(0, nextAt - performance.now()) + 5)
    return () => clearTimeout(timer)
  }, [nextAt, litKind, setClock])

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) setClock(performance.now())
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [setClock])

  return view
}

// Debug (?debug=1): ms from the playback event's arrival to the first lit cue.
export function useFirstCueDelay(state, view) {
  const [delay, setDelay] = useState(null)
  const measured = useRef(null)
  const key = state.playback?.key ?? null
  const firstCue = view.litKind === "cue" && view.lit.length > 0
  const arrivedAt = state.playback?.at
  useEffect(() => {
    if (!key || !firstCue || measured.current === key) return
    measured.current = key
    setDelay(Math.round(performance.now() - arrivedAt))
  }, [key, firstCue, arrivedAt])
  return delay
}
