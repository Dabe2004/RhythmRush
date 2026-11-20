// frontend/src/pages/Result.jsx
// Result screen, two modes:
//
//   /result             KIOSK. The ESP32 cannot open a web page, so this
//                       screen watches GET /api/game-sessions/latest every
//                       2 seconds and shows each NEW game for 30 seconds,
//                       then returns to the idle screen by itself.
//   /result/:sessionId  ONE specific game. No countdown, no auto-return.
//
// All kiosk rules (baseline, countdown, pause, dismiss) live in the pure
// reducer kioskState.js; this file only sends events and draws the state.

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { getLatestSession, getLeaderboard } from "../api"
import NicknameForm from "../components/NicknameForm"
import ResultCard from "../components/ResultCard"
import StatusMessage from "../components/StatusMessage"
import { formatScore } from "../format"
import {
  INITIAL_KIOSK_STATE,
  POLL_MS,
  RESULT_SECONDS,
  nextKioskState,
} from "../kioskState"
import { ARCADE_COLORS } from "../theme"
import usePolling from "../usePolling"
import useSession from "../useSession"

// Typing pauses the countdown. If the player walks away with the keyboard
// focused, the countdown resumes after this many milliseconds without a key.
const TYPING_IDLE_MS = 15000

export default function Result() {
  const { sessionId } = useParams()

  return sessionId ? <SingleResult sessionId={sessionId} /> : <KioskResult />
}

// ---------------------------------------------------------------------------
// Kiosk mode
// ---------------------------------------------------------------------------
function KioskResult() {
  const [state, dispatch] = useReducer(nextKioskState, INITIAL_KIOSK_STATE)

  // usePolling skips refreshes while the tab is hidden.
  const latest = usePolling(getLatestSession, POLL_MS)

  // Every successful poll becomes a "latest" event. The reducer ignores the
  // same id, so repeating it is harmless.
  useEffect(() => {
    if (!latest.data) return
    const session = latest.data.session
    dispatch({
      type: "latest",
      id: session ? session.session_id : null,
      receivedAt: session ? session.received_at : null,
    })
  }, [latest.data])

  // 1-second countdown, only while a result is on screen and the tab is
  // visible (a hidden tab does not use up the player's 30 seconds).
  useEffect(() => {
    if (state.activeId === null) return undefined

    const timer = setInterval(() => {
      if (!document.hidden) dispatch({ type: "tick" })
    }, 1000)

    return () => clearInterval(timer)
  }, [state.activeId])

  if (state.activeId === null) {
    return <IdleScreen connectionLost={Boolean(latest.error)} />
  }

  // key: a new game gets a fresh form, fresh rank, fresh everything.
  return (
    <KioskActive
      key={state.activeId}
      sessionId={state.activeId}
      secondsLeft={state.secondsLeft}
      paused={state.paused}
      dispatch={dispatch}
    />
  )
}

function KioskActive({ sessionId, secondsLeft, paused, dispatch }) {
  // The upload was just detected, so retry quickly if the first load fails.
  const game = useSession(sessionId, { retryMs: 2000 })
  const [savedName, setSavedName] = useState(null)
  const idleTimer = useRef(null)

  const resume = useCallback(() => {
    clearTimeout(idleTimer.current)
    dispatch({ type: "resume" })
  }, [dispatch])

  const pauseWhileTyping = useCallback(() => {
    dispatch({ type: "pause" })
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => dispatch({ type: "resume" }), TYPING_IDLE_MS)
  }, [dispatch])

  const dismiss = useCallback(() => {
    clearTimeout(idleTimer.current)
    dispatch({ type: "dismiss" })
  }, [dispatch])

  useEffect(() => () => clearTimeout(idleTimer.current), [])

  const nickname = game.data?.session.nickname ?? savedName

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6 lg:py-8">
      {/* On top, so the countdown and Close are visible without scrolling
          on a TV even when the nickname form makes the page tall. */}
      <Countdown secondsLeft={secondsLeft} paused={paused} onClose={dismiss} />

      {game.data ? (
        <ResultCard detail={game.data} nickname={nickname}>
          {game.data.session.nickname === null ? (
            <NicknameForm
              sessionId={sessionId}
              onActivity={pauseWhileTyping}
              onIdle={resume}
              onSkip={dismiss}
              onSaved={(name) => {
                setSavedName(name)
                resume()
              }}
            />
          ) : null}
        </ResultCard>
      ) : (
        <ResultLoading error={game.error} />
      )}
    </section>
  )
}

function ResultLoading({ error }) {
  return (
    <div className="py-20 text-center" role="status">
      <p className="text-5xl font-black text-white sm:text-6xl">New result!</p>
      <p className="mt-4 text-2xl text-slate-400">
        {error ? "Still loading the result, retrying..." : "Loading the result..."}
      </p>
    </div>
  )
}

function Countdown({ secondsLeft, paused, onClose }) {
  const percent = Math.max(0, Math.min(100, (secondsLeft / RESULT_SECONDS) * 100))

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3">
      <div
        className="h-4 w-full overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-label="Time left on this screen"
        aria-valuemin={0}
        aria-valuemax={RESULT_SECONDS}
        aria-valuenow={secondsLeft}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
            paused ? "bg-slate-500" : "bg-gradient-to-r from-indigo-400 to-fuchsia-400"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xl text-slate-300">
          Back to the leaderboard in {secondsLeft}s
          {paused ? <span className="text-slate-500"> (paused while you type)</span> : null}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-600 px-6 py-3 text-xl font-semibold text-slate-200 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          Close
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Idle screen: waiting for the next game
// ---------------------------------------------------------------------------
function IdleScreen({ connectionLost }) {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col items-center gap-12 px-4 py-16 text-center sm:px-6">
      <div>
        <h1 className="text-5xl font-black tracking-tight text-white sm:text-7xl">
          Waiting for the next player...
        </h1>
        <p className="mt-4 text-2xl text-slate-400">Press Start on the device to play.</p>
      </div>

      {/* Six pulsing dots in the arcade button colours. */}
      <div className="flex items-center gap-4 sm:gap-6" aria-hidden="true">
        {ARCADE_COLORS.map((color, index) => (
          <span
            key={color.name}
            className="arcade-dot h-8 w-8 rounded-full sm:h-12 sm:w-12"
            style={{
              backgroundColor: color.hex,
              boxShadow: `0 0 24px ${color.hex}`,
              animationDelay: `${index * 0.15}s`,
            }}
          />
        ))}
      </div>

      {connectionLost ? (
        <p role="status" className="text-xl font-semibold text-red-300">
          Cannot reach the server. Retrying...
        </p>
      ) : null}

      <TopFive />
    </section>
  )
}

function TopFive() {
  const { data, error } = usePolling(() => getLeaderboard(5), 10000)
  const entries = Array.isArray(data?.entries) ? data.entries : []

  // Nothing useful to show yet (first load, empty database, or no server).
  if (entries.length === 0) {
    return error ? null : (
      <p className="text-xl text-slate-500">Be the first on the leaderboard!</p>
    )
  }

  return (
    <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900/70 p-6 text-left">
      <h2 className="mb-4 text-center text-lg font-bold uppercase tracking-[0.3em] text-slate-400">
        Top 5
      </h2>
      <ol className="space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.session_id}
            className="flex items-center justify-between gap-4 rounded-xl bg-slate-950/50 px-4 py-3 text-2xl"
          >
            <span className="flex min-w-0 items-center gap-4">
              <span className="w-10 text-center font-black text-indigo-300">{entry.rank}</span>
              <span className="truncate font-semibold text-white">
                {entry.nickname || <span className="text-slate-500">Anonymous</span>}
              </span>
            </span>
            <span className="font-black tabular-nums text-amber-300">
              {formatScore(entry.final_score)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// One specific game: /result/:sessionId
// ---------------------------------------------------------------------------
function SingleResult({ sessionId }) {
  const game = useSession(sessionId)
  const [savedName, setSavedName] = useState(null)
  const [skipped, setSkipped] = useState(false)

  if (game.notFound) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-4xl font-black text-white sm:text-5xl">Game not found</h1>
        <p className="mt-4 text-lg text-slate-400">
          There is no game with this id. It may have been removed.
        </p>
        <BackLink />
      </section>
    )
  }

  if (game.error && !game.data) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <StatusMessage
          variant="error"
          error={game.error}
          onRetry={game.retry}
          title="Could not load this game"
        />
      </section>
    )
  }

  if (!game.data) {
    return <ResultLoading error={null} />
  }

  const nickname = game.data.session.nickname ?? savedName

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-10">
      <ResultCard detail={game.data} nickname={nickname}>
        {game.data.session.nickname === null && !skipped ? (
          <NicknameForm
            sessionId={sessionId}
            onSkip={() => setSkipped(true)}
            onSaved={setSavedName}
          />
        ) : null}
      </ResultCard>
      <div className="text-center">
        <BackLink />
      </div>
    </section>
  )
}

function BackLink() {
  return (
    <Link
      to="/"
      className="mt-8 inline-block rounded-xl bg-indigo-500 px-6 py-3 text-lg font-bold text-white transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
    >
      Back to the leaderboard
    </Link>
  )
}
