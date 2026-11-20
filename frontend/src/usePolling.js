// frontend/src/usePolling.js
// Reusable polling hook.
//
// - loads once as soon as the component mounts
// - then refreshes every intervalMs
// - keeps the old data when a refresh fails (and exposes the error)
// - does nothing while the browser tab is hidden
// - never starts a second request while one is still running
// - clears its timer on unmount

import { useCallback, useEffect, useRef, useState } from "react"

export default function usePolling(fn, intervalMs) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  // The latest callback, without restarting the interval on every render.
  const fnRef = useRef(fn)
  const inFlight = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  const load = useCallback(async () => {
    if (inFlight.current) return

    inFlight.current = true

    try {
      const result = await fnRef.current()

      if (!mounted.current) return

      // Success replaces the data and clears any old error.
      setData(result)
      setError(null)
      setLastUpdated(new Date())
    } catch (err) {
      if (!mounted.current) return

      // Keep the old data visible; only surface the error.
      setError(err)
    } finally {
      inFlight.current = false
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true

    // The first load always runs, even if the tab is in the background.
    load()

    // Later refreshes pause while the tab is hidden.
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, intervalMs)

    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [load, intervalMs])

  return { data, error, loading, lastUpdated, retry: load }
}
