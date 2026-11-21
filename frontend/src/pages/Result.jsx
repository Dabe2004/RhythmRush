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
//
// Look: a tent-red stage with marquee bulbs; the result "prints" as a paper
// prize ticket. Sized to be read from about 2 metres on a 1080p TV.

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"

import { getLatestSession, getLeaderboard } from "../api"
import ArcadeButtons from "../components/ArcadeButtons"
import { Confetti, MarqueeBulbs } from "../components/Decor"
import NicknameForm from "../components/NicknameForm"
import PlayerName from "../components/PlayerName"
import ResultCard from "../components/ResultCard"
import ScoreCounter from "../components/ScoreCounter"
import StatusMessage from "../components/StatusMessage"
import {
  INITIAL_KIOSK_STATE,
  POLL_MS,
  RESULT_SECONDS,
  nextKioskState,
} from "../kioskState"
import usePolling from "../usePolling"
import useSession from "../useSession"

// Typing pauses the countdown. If the player walks away with the keyboard
// focused, the countdown resumes after this many milliseconds without a key.
const TYPING_IDLE_MS = 15000

export default function Result() {
  const { sessionId } = useParams()

  return sessionId ? <SingleResult sessionId={sessionId} /> : <KioskResult />
}

// The red stage. It grows to fill the screen (no cream gap on the kiosk TV);
// the header above already has a bulb rail, so the stage only has one at the
// bottom. --notch-bg makes ticket notches show the stage colour.
// backdrop (optional) is drawn BEHIND the content, e.g. the win confetti:
// it shows on the red stage around the ticket but never over any text.
function Stage({ children, backdrop = null }) {
  return (
    <section className="stage relative isolate flex flex-1 flex-col overflow-hidden border-b-[3px] border-ink">
      {backdrop}
      {/* Content is centred vertically, so a short screen (idle) does not
          leave a dead area under it on a big TV. */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1500px] flex-1 flex-col justify-center px-4 py-8 sm:px-8 lg:py-10">
        <div>{children}</div>
      </div>
      <MarqueeBulbs className="relative z-10" />
    </section>
  )
}

function WinConfetti({ game }) {
  return game.data?.session.outcome === "win" ? <Confetti /> : null
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
    <Stage backdrop={<WinConfetti game={game} />}>
      {/* On top, so the countdown and Close are visible without scrolling
          on a TV even when the nickname form makes the page tall. */}
      <Countdown secondsLeft={secondsLeft} paused={paused} onClose={dismiss} />

      <div className="mt-8">
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
      </div>
    </Stage>
  )
}

function ResultLoading({ error }) {
  return (
    <div className="flex flex-col items-start gap-6 py-16" role="status">
      <p className="painted text-5xl text-paint-yellow sm:text-7xl">New result!</p>
      <ArcadeButtons sequence size="3rem" labelTone="cream" />
      <p className="text-2xl font-extrabold text-cream">
        {error ? "Still loading the result, retrying..." : "Printing your ticket..."}
      </p>
    </div>
  )
}

// A fuse that burns down from right to left, plus the text and Close sign.
function Countdown({ secondsLeft, paused, onClose }) {
  const percent = Math.max(0, Math.min(100, (secondsLeft / RESULT_SECONDS) * 100))

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="min-w-[14rem] flex-1">
        <div
          className={`fuse-track ${paused ? "fuse-paused" : ""}`}
          role="progressbar"
          aria-label="Time left on this screen"
          aria-valuemin={0}
          aria-valuemax={RESULT_SECONDS}
          aria-valuenow={secondsLeft}
        >
          {/* The unburnt rope; only transform changes. */}
          <div className="fuse-rope" style={{ transform: `translateX(${percent - 100}%)` }}>
            <span className="fuse-spark" />
          </div>
        </div>
        <p className="mt-2 text-xl font-extrabold text-cream">
          Back to the leaderboard in <span className="font-sign">{secondsLeft}</span>s
          {paused ? <span className="text-cream"> (paused while you type)</span> : null}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="sign min-h-[52px] rotate-1 bg-ticket px-6 py-2 text-lg text-ink transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      >
        Close
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Idle screen: waiting for the next game
// ---------------------------------------------------------------------------
function IdleScreen({ connectionLost }) {
  return (
    <Stage>
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-14">
        <div className="pt-2 lg:pt-8">
          <h1 className="painted -rotate-2 text-[clamp(3rem,8vw,7.5rem)] leading-[0.95] text-paint-yellow">
            Step right up!
          </h1>
          <p className="mt-6 text-[clamp(1.5rem,2.6vw,2.5rem)] font-extrabold leading-tight text-cream">
            Waiting for the next player...
          </p>
          <p className="mt-2 text-xl text-cream sm:text-2xl">Press Start on the device to play.</p>

          {/* The six buttons light up one after another, like the game. */}
          <ArcadeButtons
            sequence
            size="clamp(2.75rem, 6vw, 5.5rem)"
            labelTone="cream"
            labelClassName="text-base sm:text-xl"
            className="mt-10"
          />

          {connectionLost ? (
            <p
              role="status"
              className="mt-8 inline-block -rotate-1 border-[3px] border-ink bg-paint-yellow px-4 py-2 text-lg font-extrabold text-ink shadow-hard"
            >
              Cannot reach the server. Retrying...
            </p>
          ) : null}
        </div>

        <TopFive />
      </div>
    </Stage>
  )
}

function TopFive() {
  const { data, error } = usePolling(() => getLeaderboard(5), 10000)
  const entries = Array.isArray(data?.entries) ? data.entries : []

  // Nothing useful to show yet (first load, empty database, or no server).
  if (entries.length === 0) {
    return error ? null : (
      <p className="ticket rotate-2 self-start px-6 py-5 text-xl font-extrabold">
        Be the first on the leaderboard!
      </p>
    )
  }

  return (
    <div className="ticket rotate-[1.5deg] px-5 pb-5 pt-4 sm:px-7">
      <h2 className="font-sign text-2xl text-tent sm:text-3xl">Hall of Fame</h2>
      <ol className="mt-3">
        {entries.map((entry) => (
          <li
            key={entry.session_id}
            className="flex items-center justify-between gap-4 border-t-2 border-dashed border-ink py-3 first:border-t-0"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="font-sign w-9 shrink-0 text-2xl text-tent lg:text-3xl">{entry.rank}</span>
              <span className="truncate text-xl font-extrabold sm:text-2xl xl:text-3xl">
                <PlayerName nickname={entry.nickname} />
              </span>
            </span>
            <ScoreCounter value={entry.final_score} className="shrink-0 text-lg sm:text-xl xl:text-2xl" />
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
      <Stage>
        <div className="ticket ticket-notched max-w-2xl -rotate-1 px-8 py-10 sm:px-12">
          <h1 className="font-sign text-4xl sm:text-5xl">Game not found</h1>
          <p className="mt-4 text-lg text-muted">
            There is no game with this id. It may have been removed.
          </p>
          <BackLink />
        </div>
      </Stage>
    )
  }

  if (game.error && !game.data) {
    return (
      <Stage>
        <StatusMessage
          variant="error"
          error={game.error}
          onRetry={game.retry}
          title="Could not load this game"
        />
      </Stage>
    )
  }

  if (!game.data) {
    return (
      <Stage>
        <ResultLoading error={null} />
      </Stage>
    )
  }

  const nickname = game.data.session.nickname ?? savedName

  return (
    <Stage backdrop={<WinConfetti game={game} />}>
      <ResultCard detail={game.data} nickname={nickname}>
        {game.data.session.nickname === null && !skipped ? (
          <NicknameForm
            sessionId={sessionId}
            onSkip={() => setSkipped(true)}
            onSaved={setSavedName}
          />
        ) : null}
      </ResultCard>
      <BackLink />
    </Stage>
  )
}

function BackLink() {
  return (
    <Link
      to="/"
      className="sign mt-8 inline-flex min-h-[48px] items-center bg-ticket px-5 py-2 text-base text-ink transition-transform hover:-translate-y-0.5"
    >
      Back to the leaderboard
    </Link>
  )
}
