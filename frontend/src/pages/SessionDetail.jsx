// frontend/src/pages/SessionDetail.jsx
// /session/:id - everything about one game: facts, ML results, a chart of
// the response time per attempt, and the attempts table (the chart's
// "table view": every value in the chart is also readable as text here).
//
// Lazy-loaded from App.jsx because it pulls in Recharts.

import { Link, useParams } from "react-router-dom"

import { RESULT_STYLES, toAttemptRows } from "../chartData"
import { AttemptsChart, ResultLabel } from "../components/Charts"
import SkillBadge from "../components/SkillBadge"
import StatusMessage from "../components/StatusMessage"
import {
  animalArticle,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatScore,
  levelReached,
  outcomeTitle,
} from "../format"
import { animalEmoji } from "../theme"
import useSession from "../useSession"

function BackToLeaderboard() {
  return (
    <Link
      to="/"
      className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-300 transition hover:text-indigo-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
    >
      <span aria-hidden="true">&larr;</span> Leaderboard
    </Link>
  )
}

function Fact({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

function AnimalResult({ prediction }) {
  if (!prediction?.animal) {
    return <p className="text-lg text-slate-400">Fun result not available for this game</p>
  }

  return (
    <div>
      <p className="text-xl font-bold text-amber-100">
        Played like {animalArticle(prediction.animal)}{" "}
        <span aria-hidden="true">{animalEmoji(prediction.animal)}</span> {prediction.animal}
        {typeof prediction.animal_iq === "number" ? `, IQ ${prediction.animal_iq}` : ""}
      </p>
      <p className="mt-1 text-sm text-amber-200/70">Just for fun, not a real IQ test.</p>
    </div>
  )
}

function AttemptsTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <caption className="sr-only">Every attempt of this game</caption>
        <thead className="bg-slate-950/60 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
          <tr>
            <th scope="col" className="px-4 py-3">#</th>
            <th scope="col" className="px-4 py-3">Level</th>
            <th scope="col" className="px-4 py-3">Sequence length</th>
            <th scope="col" className="px-4 py-3">Result</th>
            <th scope="col" className="px-4 py-3 text-right">Response time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800 text-slate-200">
          {rows.map((row) => (
            <tr key={row.attemptNo}>
              <td className="px-4 py-3 tabular-nums text-slate-400">{row.attemptNo}</td>
              <td className="px-4 py-3 tabular-nums">{row.level}</td>
              <td className="px-4 py-3 tabular-nums">{row.sequenceLength}</td>
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
      <section className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-4xl font-black text-white sm:text-5xl">Game not found</h1>
        <p className="mt-4 text-lg text-slate-400">
          We could not find this game. It may have been removed, or the link is wrong.
        </p>
        <Link
          to="/"
          className="mt-8 inline-block rounded-xl bg-indigo-500 px-6 py-3 text-lg font-bold text-white transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
        >
          Back to the leaderboard
        </Link>
      </section>
    )
  }

  if (game.error && !game.data) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <StatusMessage variant="error" error={game.error} onRetry={game.retry} title="Could not load this game" />
      </section>
    )
  }

  if (!game.data) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6" role="status">
        <p className="text-lg text-slate-400">Loading the game...</p>
      </section>
    )
  }

  const { session, features, prediction } = game.data
  const rows = toAttemptRows(game.data.attempts)
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.result]: (acc[row.result] || 0) + 1 }), {})

  return (
    <section className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <BackToLeaderboard />

      {/* Header facts */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-slate-500">
            {outcomeTitle(session.outcome)}
          </p>
          <h1 className="mt-1 text-4xl font-black tracking-tight text-white sm:text-5xl">
            {session.nickname || <span className="text-slate-400">Anonymous player</span>}
          </h1>
          <p className="mt-2 text-slate-400">
            Game <span className="font-mono text-slate-300">{session.session_id}</span> · device{" "}
            {session.device_id ?? "-"} · {formatDateTime(session.received_at)}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-5xl font-black text-amber-300 sm:text-6xl">{formatScore(session.final_score)}</p>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">points</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Fact label="Level reached" value={levelReached(session) ?? "-"} />
        <Fact label="Levels cleared" value={session.highest_level_completed ?? "-"} />
        <Fact label="Successful rounds" value={session.successful_rounds ?? "-"} />
        <Fact label="Failed attempts" value={session.failed_attempts ?? "-"} />
        <Fact label="Duration" value={formatDuration(session.duration_seconds)} />
        <Fact label="Success rate" value={formatPercent(features?.success_rate)} />
        <Fact
          label="Average time per press"
          value={
            typeof features?.avg_reaction_sec === "number"
              ? `${features.avg_reaction_sec.toFixed(2)} s`
              : "-"
          }
        />
        <Fact label="Data" value={session.is_synthetic === 1 || session.device_id === "SIM01" ? "Simulated" : "Real"} />
      </div>

      {/* ML results */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-sm text-slate-400">Skill (ML classifier)</p>
          <div className="mt-2">
            {prediction?.skill_rank ? (
              <SkillBadge value={prediction.skill_rank} size="lg" />
            ) : (
              <p className="text-lg text-slate-400">Not available for this game</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 p-5">
          <p className="mb-2 text-sm text-slate-400">Animal match</p>
          <AnimalResult prediction={prediction} />
        </div>
      </div>

      {/* Chart + table */}
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-700 px-6 py-10 text-center text-lg text-slate-400">
          No attempts were recorded for this game.
        </p>
      ) : (
        <>
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
            <h2 className="text-xl font-bold text-white">Response time per attempt</h2>
            <p className="mb-4 mt-1 text-sm text-slate-400">
              {rows.length} attempts:{" "}
              {["pass", "wrong", "timeout"]
                .map((result) => `${counts[result] || 0} ${RESULT_STYLES[result].label.toLowerCase()}`)
                .join(", ")}
            </p>
            <AttemptsChart rows={rows} />
          </div>

          <div>
            <h2 className="mb-3 text-xl font-bold text-white">Attempts</h2>
            <AttemptsTable rows={rows} />
          </div>
        </>
      )}
    </section>
  )
}
