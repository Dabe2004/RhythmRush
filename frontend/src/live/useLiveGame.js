// frontend/src/live/useLiveGame.js
// ONE EventSource per browser tab, shared through a context (LiveProvider in
// App.jsx): the header indicator, the leaderboard banner and /live all read
// the same state. EventSource reconnects by itself (server sends retry: 2000);
// after 3 failed attempts we fall back to polling /api/live/state every 2 s
// and try the stream again every 20 s. A tab hidden for more than 30 s closes
// the stream; it reopens (fresh snapshot) when the tab is shown again.

import { createContext, createElement, useContext, useEffect, useReducer, useState } from "react"

import { LIVE_STREAM_URL, getLiveState } from "../api"
import { INITIAL_CONNECTION, INITIAL_LIVE, connectionLabel, liveReducer, nextConnection } from "./liveReducer"

const POLL_MS = 2000
const RETRY_STREAM_MS = 20000
const HIDDEN_CLOSE_MS = 30000

const LiveContext = createContext({ state: INITIAL_LIVE, lastEvent: null, connection: "reconnecting", label: "Reconnecting..." })

function reduce(current, action) {
  return {
    state: liveReducer(current.state, action, performance.now()),
    lastEvent: action.type === "event" ? action.event : current.lastEvent,
  }
}

export function LiveProvider({ children }) {
  const [live, dispatch] = useReducer(reduce, { state: INITIAL_LIVE, lastEvent: null })
  const [conn, setConn] = useState(INITIAL_CONNECTION)

  useEffect(() => {
    let current = INITIAL_CONNECTION
    let source = null
    let pollTimer = null
    let retryTimer = null
    let reopenTimer = null
    let hiddenTimer = null

    const signal = (name) => {
      current = nextConnection(current, name)
      setConn(current)
    }

    function stopAll() {
      source?.close()
      source = null
      clearInterval(pollTimer)
      clearTimeout(retryTimer)
      clearTimeout(reopenTimer)
      pollTimer = null
    }

    async function poll() {
      try {
        dispatch({ type: "snapshot", snapshot: await getLiveState() })
        signal("poll_ok")
      } catch {
        signal("poll_error")
      }
    }

    function startPolling() {
      stopAll()
      poll()
      pollTimer = setInterval(() => {
        if (!document.hidden) poll()
      }, POLL_MS)
      retryTimer = setTimeout(() => {
        stopAll()
        signal("retry_stream")
        openStream()
      }, RETRY_STREAM_MS)
    }

    function openStream() {
      source = new EventSource(LIVE_STREAM_URL)
      source.addEventListener("snapshot", (e) => dispatch({ type: "snapshot", snapshot: JSON.parse(e.data) }))
      source.addEventListener("live", (e) => {
        const data = JSON.parse(e.data)
        // age > 0 only for messages replayed after a reconnect.
        dispatch({ type: "event", event: data.event, age: data.now - data.event.receivedAt })
      })
      source.onopen = () => signal("open")
      source.onerror = () => {
        signal("error")
        if (current.mode === "poll") startPolling()
        else if (source?.readyState === EventSource.CLOSED) {
          // e.g. 503 (too many screens): EventSource gives up, so retry by hand.
          source = null
          reopenTimer = setTimeout(openStream, POLL_MS)
        }
      }
    }

    function onVisibility() {
      if (document.hidden) {
        hiddenTimer = setTimeout(stopAll, HIDDEN_CLOSE_MS)
      } else {
        clearTimeout(hiddenTimer)
        if (!source && !pollTimer) openStream()
      }
    }

    // Leaving the page: close the stream at once, so an old page never keeps
    // one of the browser's few connections to the laptop busy.
    const onPageHide = () => stopAll()
    const onPageShow = (event) => {
      if (event.persisted && !source && !pollTimer) openStream()
    }

    openStream()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("pagehide", onPageHide)
    window.addEventListener("pageshow", onPageShow)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("pageshow", onPageShow)
      clearTimeout(hiddenTimer)
      stopAll()
    }
  }, [])

  const value = { ...live, connection: conn.status, label: connectionLabel(conn) }
  return createElement(LiveContext.Provider, { value }, children)
}

// { state, lastEvent, connection: "live"|"reconnecting"|"offline", label }
export default function useLiveGame() {
  return useContext(LiveContext)
}
