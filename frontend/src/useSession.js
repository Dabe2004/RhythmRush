// frontend/src/useSession.js
// Loads one game with GET /api/game-sessions/:id.
//
// - loads again whenever sessionId changes (old answers are ignored)
// - optional automatic retry (retryMs) for the kiosk, never for a 404
// - notFound is true for an unknown id, so pages can show a friendly message

import { useCallback, useEffect, useState } from "react"

import { getSession } from "./api"

export default function useSession(sessionId, { retryMs = 0 } = {}) {
  const [result, setResult] = useState({ id: null, data: null, error: null })
  // Changing this number starts a new request (manual or automatic retry).
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!sessionId) return undefined

    let cancelled = false
    let retryTimer = null

    getSession(sessionId).then(
      (data) => {
        if (!cancelled) setResult({ id: sessionId, data, error: null })
      },
      (error) => {
        if (cancelled) return
        setResult({ id: sessionId, data: null, error })

        // A missing game will not appear by retrying.
        if (retryMs > 0 && error.status !== 404) {
          retryTimer = setTimeout(() => setAttempt((n) => n + 1), retryMs)
        }
      },
    )

    return () => {
      cancelled = true
      clearTimeout(retryTimer)
    }
  }, [sessionId, retryMs, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // An answer for a different (older) id does not count.
  const current =
    result.id === sessionId ? result : { data: null, error: null }

  return {
    data: current.data,
    error: current.error,
    loading: !current.data && !current.error,
    notFound: current.error?.status === 404,
    retry,
  }
}
