// frontend/src/pages/SessionDetail.jsx
// /session/:id - everything about one game: facts, ML results, a chart of
// the response time per attempt, and the attempts table (the chart's
// "table view": every value in the chart is also readable as text here).
//
// Look: the same paper-ticket language as the leaderboard; the facts are a
// printed receipt, the attempts a ruled ledger.
//
// Lazy-loaded from App.jsx because it pulls in Recharts.

import { Link, useParams } from "react-router-dom"

import { RESULT_STYLES, toAttemptRows } from "../chartData"
import AnimalIcon from "../components/animals/AnimalIcon"
import { AttemptsChart, ResultLabel } from "../components/Charts"
import PlayerName from "../components/PlayerName"
import ScoreCounter from "../components/ScoreCounter"
import SkillBadge from "../components/SkillBadge"
import StatusMessage from "../components/StatusMessage"
import {
  animalArticle,
  formatDateTime,
  formatDuration,
  formatPercent,
  levelReached,
  outcomeTitle,
} from "../format"
import useSession from "../useSession"

function BackToLeaderboard() {
  return (
    <Link
      to="/"
      className="sign inline-flex min-h-[44px] -rotate-1 items-center gap-2 bg-ticket px-4 py-2 text-sm transition-transform hover:-translate-y-0.5"
    >
      <svg aria-hidden="true" width="18" height="14" viewBox="0 0 18 14">
        <path d="M7 1L1 7l6 6M1 7h16" fill="none" stroke="#1d1a2f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Leaderboard
    </Link>
  )
}

// One receipt line: label ........ value
function ReceiptLine({ label, value }) {
  return (
    <div className="flex items-baseline gap-2 py-1.5">
      <dt className="shrink-0 text-base">{label}</dt>
      <span aria-hidden="true" className="min-w-4 flex-1 translate-y-[-4px] border-b-2 border-dotted border-ink/50" />
      <dd className="shrink-0 text-lg font-extrabold tabular-nums">{value}</dd>
    </div>
  )
}

function AnimalResult({ prediction }) {
  if (!prediction?.animal) {
    return (
      <div className="flex items-center gap-4">
        <AnimalIcon animal={null} size={64} />
        <p className="text-lg font-extrabold">Fun result not available for this game</p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <AnimalIcon animal={prediction.animal} size={88} className="shrink-0" />
      <div>
        <p className="text-xl font-extrabold leading-tight">
          Played like {animalArticle(prediction.animal)} {prediction.animal}
        </p>
        {typeof prediction.animal_iq === "number" ? (
          <p className="font-sign text-2xl">IQ {prediction.animal_iq}</p>
        ) : null}
        <p className="mt-1 text-sm font-extrabold">Just for fun, not a real IQ test.</p>
      </div>
    </div>
  )
}

function AttemptsTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-[6px] border-[3px] border-ink bg-ticket shadow-hard">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <caption className="sr-only">Every attempt of this game</caption>
        <thead className="border-b-[3px] border-ink bg-cream font-sign text-xs">
          <tr>
            <th scope="col" className="px-4 py-3">#</th>
            <th scope="col" className="px-4 py-3">Level</th>
            <th scope="col" className="px-4 py-3">Sequence length</th>
            <th scope="col" className="px-4 py-3">Result</th>
            <th scope="col" className="px-4 py-3 text-right">Response time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.attemptNo} className="border-b border-rule last:border-b-0">
              <td className="px-4 py-3 font-sign text-muted">{row.attemptNo}</td>
              <td className="px-4 py-3 font-sign">{row.level}</td>
              <td className="px-4 py-3 font-sign">{row.sequenceLength}</td>
              <td className="px-4 py-3">
                <ResultLabel result={row.result} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {row.isTimeout
                  ? `no answer (limit ${row.deadlineSec.toFixed(1)} s)`
                  : `${row.responseSec.toFixed(2)} s`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function SessionDetail() {
  const { id } = useParams()
  const game = useSession(id)

  if (game.notFound) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
        <div className="ticket ticket-notched max-w-2xl -rotate-1 px-8 py-10 sm:px-12">
          <h1 className="font-sign text-4xl sm:text-5xl">Game not found</h1>
          <p className="mt-4 text-lg text-muted">
            We could not find this game. It may have been removed, or the link is wrong.
          </p>
          <Link
            to="/"
            className="sign mt-8 inline-flex min-h-[44px] items-center bg-tent px-5 py-2 text-base text-cream transition-transform hover:-translate-y-0.5"
          >
            Back to the leaderboard
          </Link>
        </div>
      </section>
    )
  }

  if (game.error && !game.data) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
        <StatusMessage variant="error" error={game.error} onRetry={game.retry} title="Could not load this game" />
      </section>
    )
  }

  if (!game.data) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6" role="status">
        <p className="font-sign text-lg">Loading the game...</p>
      </section>
    )
  }

  const { session, features, prediction } = game.data
  const rows = toAttemptRows(game.data.attempts)
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.result]: (acc[row.result] || 0) + 1 }), {})
  const won = session.outcome === "win"

  return (
    <section className="mx-auto w-full max-w-5xl space-y-10 px-4 py-8 sm:px-6 lg:py-12">
      <BackToLeaderboard />

      {/* Header ticket: outcome stub | name and game | score */}
      <header className="ticket ticket-notched grid md:grid-cols-[auto_1fr_auto]">
        <div className="flex items-center px-6 pb-2 pt-6 md:px-6 md:py-6">
          <span
            className={`sign -rotate-3 px-3 py-1.5 text-lg sm:text-xl ${
              won ? "bg-paint-yellow text-ink" : "bg-tent text-cream"
            }`}
          >
            {outcomeTitle(session.outcome)}
          </span>
        </div>
        <div className="min-w-0 border-ink px-6 py-4 md:border-l-[3px] md:border-dashed md:py-6">
          <h1 className="truncate text-3xl font-extrabold sm:text-4xl">
            <PlayerName nickname={session.nickname} />
          </h1>
          <p className="mt-1 text-muted">
            Game <span className="font-sign text-sm text-ink">{session.session_id}</span> · device{" "}
            {session.device_id ?? "-"} · {formatDateTime(session.received_at)}
          </p>
        </div>
        <div className="flex flex-col items-start justify-center gap-1 border-t-[3px] border-dashed border-ink px-6 py-5 md:items-end md:border-l-[3px] md:border-t-0">
          <ScoreCounter value={session.final_score} tone="dark" className="text-3xl sm:text-4xl" />
          <span className="text-xs font-extrabold uppercase tracking-[0.25em] text-muted">points</span>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* The printed receipt */}
        <div className="ticket rotate-[0.4deg] px-6 py-5">
          <h2 className="font-sign text-lg text-tent">Receipt</h2>
          <dl className="mt-2">
            <ReceiptLine label="Level reached" value={levelReached(session) ?? "-"} />
            <ReceiptLine label="Levels cleared" value={session.highest_level_completed ?? "-"} />
            <ReceiptLine label="Successful rounds" value={session.successful_rounds ?? "-"} />
            <ReceiptLine label="Failed attempts" value={session.failed_attempts ?? "-"} />
            <ReceiptLine label="Duration" value={formatDuration(session.duration_seconds)} />
            <ReceiptLine label="Success rate" value={formatPercent(features?.success_rate)} />
            <ReceiptLine
              label="Average time per press"
              value={
                typeof features?.avg_reaction_sec === "number"
                  ? `${features.avg_reaction_sec.toFixed(2)} s`
                  : "-"
              }
            />
            <ReceiptLine
              label="Data"
              value={session.is_synthetic === 1 || session.device_id === "SIM01" ? "Simulated" : "Real"}
            />
          </dl>
        </div>

        {/* ML results: stamp and prize */}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4 px-1">
            <p className="text-lg font-extrabold">Skill, by the ML classifier:</p>
            {prediction?.skill_rank ? (
              <SkillBadge value={prediction.skill_rank} size="lg" />
            ) : (
              <p className="text-lg text-muted">Not available for this game</p>
            )}
          </div>
          <div className="-rotate-1 rounded-[6px] border-[3px] border-ink bg-tag px-5 py-5 shadow-hard">
            <p className="mb-2 font-sign text-sm">Animal match</p>
            <AnimalResult prediction={prediction} />
          </div>
        </div>
      </div>

      {/* Chart + table */}
      {rows.length === 0 ? (
        <p className="ticket px-6 py-10 text-lg">No attempts were recorded for this game.</p>
      ) : (
        <>
          <div className="ticket px-5 py-6 sm:px-7">
            <h2 className="font-sign text-xl sm:text-2xl">Response time per attempt</h2>
            <p className="mb-5 mt-1 text-muted">
              {rows.length} attempts:{" "}
              {["pass", "wrong", "timeout"]
                .map((result) => `${counts[result] || 0} ${RESULT_STYLES[result].label.toLowerCase()}`)
                .join(", ")}
            </p>
            <AttemptsChart rows={rows} />
          </div>

          <div>
            <h2 className="mb-4 font-sign text-xl sm:text-2xl">Attempts</h2>
            <AttemptsTable rows={rows} />
          </div>
        </>
      )}
    </section>
  )
}
