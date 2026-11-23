// frontend/src/pages/Result.jsx
// Result screen, two modes:
//
//   /live (= /result)   KIOSK. While a game runs on the ESP32 the LIVE MIRROR
//                       of the control panel has priority (live/liveReducer.js,
//                       screenMode). Otherwise it watches GET
//                       /api/game-sessions/latest every 2 seconds and shows each
//                       NEW game for 30 seconds (kioskState.js, unchanged).
//                       ?demo=1 plays a scripted game in the browser (?auto=1
//                       loops it), ?debug=1 shows timing for developers.
//   /result/:sessionId  ONE specific game. No countdown, no auto-return.
//
// Look: a tent-red stage with marquee bulbs; the result "prints" as a paper
// paper ticket. Sized to be read from about 2 metres on a 1080p TV.

import { useCallback, useEffect, useReducer, useRef, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"

import { getLatestSession, getLeaderboard, getRecentSessions } from "../api"
import ArcadeButtons from "../components/ArcadeButtons"
import { Confetti, MarqueeBulbs } from "../components/Decor"
import LivePanel, { ConnectionChip } from "../components/LivePanel"
import NicknameForm from "../components/NicknameForm"
import PlayerName from "../components/PlayerName"
import ResultCard from "../components/ResultCard"
import ScoreCounter from "../components/ScoreCounter"
import StatusMessage from "../components/StatusMessage"
import { visitorText } from "../content/visitorText"
import { formatScore } from "../format"
import {
  INITIAL_KIOSK_STATE,
  POLL_MS,
  RESULT_SECONDS,
  nextKioskState,
} from "../kioskState"
import { useDemoGame } from "../live/demoGame"
import { screenMode } from "../live/liveReducer"
import { useFirstCueDelay, useLiveClock, usePanelView } from "../live/usePanel"
import useLiveGame from "../live/useLiveGame"
import usePolling from "../usePolling"
import useSession from "../useSession"

// Typing pauses the countdown. If the player walks away with the keyboard
// focused, the countdown resumes after this many milliseconds without a key.
const TYPING_IDLE_MS = 15000

const R = visitorText.result
const V = visitorText.live

export default function Result() {
  const { sessionId } = useParams()

  return sessionId ? <SingleResult sessionId={sessionId} /> : <KioskResult />
}

// The red stage. It grows to fill the screen (no cream gap on the kiosk TV);
// the header above already has a bulb rail, so the stage only has one at the
// bottom. --notch-bg makes ticket notches show the stage colour.
// backdrop (optional) is drawn BEHIND the content, e.g. the win confetti:
// it shows on the red stage around the ticket but never over any text.
function Stage({ children, backdrop = null, compact = false }) {
  return (
    <section className="stage relative isolate flex flex-1 flex-col overflow-hidden border-b-[3px] border-ink">
      {backdrop}
      {/* Content is centred vertically, so a short screen (idle) does not
          leave a dead area under it on a big TV. compact (live panel): top
          aligned, so the panel never moves when the list beside it changes,
          and it fits a 1280x720 screen. */}
      <div
        className={`relative z-10 mx-auto flex w-full max-w-[1500px] flex-1 flex-col px-4 sm:px-8 ${
          compact ? "justify-start py-5 lg:py-4" : "justify-center py-8 lg:py-10"
        }`}
      >
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
  const [params] = useSearchParams()
  const debug = params.get("debug") === "1"
  if (params.get("demo") === "1") return <DemoScreen auto={params.get("auto") === "1"} debug={debug} />
  return <LiveKiosk debug={debug} />
}

function LiveKiosk({ debug }) {
  const [state, dispatch] = useReducer(nextKioskState, INITIAL_KIOSK_STATE)
  const live = useLiveGame()
  // screenMode also depends on time (15 s upload wait, 90 s silence).
  const liveBusy = live.state.phase !== "idle"
  const [now] = useLiveClock(live.state, liveBusy ? 1000 : null)

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

  if (screenMode(live.state, state.activeId, now) === "mirror") {
    return (
      <LiveStage
        state={live.state}
        connection={live.connection}
        label={live.label}
        debug={debug}
        latestId={latest.data?.session?.session_id ?? null}
      />
    )
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
      <p className="painted text-5xl text-paint-yellow sm:text-7xl">{R.newResult}</p>
      <ArcadeButtons sequence size="3rem" />
      <p className="text-2xl font-extrabold text-cream">
        {error ? R.stillLoading : R.printing}
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
          aria-label={R.timeLeft}
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
          {R.countdownBefore} <span className="font-sign">{secondsLeft}</span> {R.countdownAfter}
          {paused ? <span className="text-cream"> {R.paused}</span> : null}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="sign min-h-[52px] rotate-1 bg-ticket px-6 py-2 text-lg text-ink transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      >
        {visitorText.common.close}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Live mirror: the control panel left, "Last results" right (phones: panel first)
// ---------------------------------------------------------------------------
function LiveStage({ state, connection, label, debug, demo = null, latestId = null }) {
  const view = usePanelView(state)
  const firstCue = useFirstCueDelay(state, view)

  return (
    <Stage compact>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] lg:gap-10">
        <div className="relative min-w-0">
          {/* A sticker on the corner: always in view, adds no height. */}
          {demo ? (
            <p className="sign absolute -top-4 left-6 z-20 -rotate-3 bg-paint-yellow px-4 py-0.5 text-xl text-ink">{V.demo}</p>
          ) : null}
          <LivePanel view={view} interactive={Boolean(demo)} onStart={demo?.start} />
          <p className="sr-only" aria-live="polite">
            {view.announce ?? ""}
          </p>
        </div>

        {/* Right column on TV/desktop, under the panel on phones. */}
        <div className="flex min-w-0 flex-col gap-5">
          {view.mode === "finished" ? (
            <p className="painted text-3xl text-paint-yellow sm:text-4xl" role="status">
              {V.finalScore(formatScore(state.final.final_score))}
              {demo ? "" : V.saving}
            </p>
          ) : null}
          <p className="text-lg font-extrabold text-cream sm:text-xl">
            {demo
              ? V.demoNote
              : V.note}
          </p>
          {demo ? null : (
            <div>
              <ConnectionChip connection={connection} label={label} />
            </div>
          )}
          {debug ? (
            <p className="self-start bg-ink px-3 py-1 font-mono text-sm text-cream">
              debug: connection {connection}; playback arrival to first lit cue: {firstCue ?? "-"} ms
            </p>
          ) : null}
          <LastResults latestId={latestId} />
          <TopScores latestId={latestId} />
        </div>
      </div>
    </Stage>
  )
}

function DemoScreen({ auto, debug }) {
  const demo = useDemoGame({ auto })
  return <LiveStage state={demo.state} connection="live" label="Live" debug={debug} demo={demo} />
}

// "Last results" (newest first) and the leaderboard's top 5. Both refresh
// every 10 s and at once when a new game is saved (latestId changes).
const LOAD_RECENT = () => getRecentSessions(5)
const LOAD_TOP = () => getLeaderboard(5)

function ScoreList({ title, load, pick, latestId, ranked = false, tilt }) {
  const { data, error, retry } = usePolling(load, 10000)
  useEffect(() => {
    if (latestId) retry()
  }, [latestId, retry])
  const rows = Array.isArray(pick(data)) ? pick(data) : []

  return (
    <div className={`ticket px-5 pb-3 pt-3 sm:px-7 ${tilt}`}>
      <h2 className="font-sign text-2xl text-tent sm:text-3xl">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-xl font-extrabold">{error ? V.resultsUnavailable : V.noResults}</p>
      ) : (
        <ol className="mt-1">
          {rows.map((row) => (
            <li
              key={row.session_id}
              className="flex items-center justify-between gap-4 border-t-2 border-dashed border-ink py-2 first:border-t-0"
            >
              <Link
                to={`/session/${encodeURIComponent(row.session_id)}`}
                className="min-w-0 truncate text-xl font-extrabold sm:text-2xl"
              >
                {ranked ? <span className="mr-2 font-sign text-tent">{row.rank}.</span> : null}
                <PlayerName nickname={row.nickname} number={row.player_number} />
              </Link>
              <ScoreCounter value={row.final_score} className="shrink-0 text-lg sm:text-xl" />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function LastResults({ latestId }) {
  return <ScoreList title={V.lastResults} load={LOAD_RECENT} pick={(d) => d?.sessions} latestId={latestId} tilt="rotate-[1.5deg]" />
}

function TopScores({ latestId }) {
  return <ScoreList title={V.leaderboard} load={LOAD_TOP} pick={(d) => d?.entries} latestId={latestId} ranked tilt="-rotate-1" />
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
          <h1 className="font-sign text-4xl sm:text-5xl">{R.notFoundTitle}</h1>
          <p className="mt-4 text-lg text-muted">
            {R.notFoundText}
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
          title={R.loadError}
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
      to="/leaderboard"
      className="sign mt-8 inline-flex min-h-[48px] items-center bg-ticket px-5 py-2 text-base text-ink transition-transform hover:-translate-y-0.5"
    >
      {visitorText.common.backToLeaderboard}
    </Link>
  )
}
