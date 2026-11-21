// frontend/src/pages/SessionDetail.jsx
// /session/:id - everything about one game: facts, rank and animal, a chart
// of how long each try took, and the attempts table (the chart's
// "table view": every value in the chart is also readable as text here).
//
// Look: the same paper-ticket language as the leaderboard; the facts are a
// printed receipt, the attempts a ruled ledger.
//
// Lazy-loaded from App.jsx because it pulls in Recharts.

import { Link, useParams } from "react-router-dom"

import { toAttemptRows } from "../chartData"
import { visitorText } from "../content/visitorText"
import AnimalIcon from "../components/animals/AnimalIcon"
import { AttemptsChart, ResultLabel } from "../components/Charts"
import HelpLink from "../components/HelpLink"
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

const T = visitorText.game

function BackToLeaderboard() {
  return (
    <Link
      to="/leaderboard"
      className="sign inline-flex min-h-[44px] -rotate-1 items-center gap-2 bg-ticket px-4 py-2 text-sm transition-transform hover:-translate-y-0.5"
    >
      <svg aria-hidden="true" width="18" height="14" viewBox="0 0 18 14">
        <path d="M7 1L1 7l6 6M1 7h16" fill="none" stroke="#1d1a2f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {T.back}
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
        <p className="text-lg font-extrabold">{visitorText.result.noAnimal}</p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-4">
      <AnimalIcon animal={prediction.animal} size={88} className="shrink-0" />
      <div>
        <p className="text-xl font-extrabold leading-tight">
          {T.playedLike(animalArticle(prediction.animal), prediction.animal)}
        </p>
        {typeof prediction.animal_iq === "number" ? (
          <p className="font-sign text-2xl">{visitorText.result.iq(prediction.animal_iq)}</p>
        ) : null}
        <p className="mt-1 text-sm font-extrabold">{visitorText.result.justForFun}</p>
      </div>
    </div>
  )
}

function AttemptsTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-[6px] border-[3px] border-ink bg-ticket shadow-hard">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <caption className="sr-only">{T.tableCaption}</caption>
        <thead className="border-b-[3px] border-ink bg-cream font-sign text-xs">
          <tr>
            <th scope="col" className="px-4 py-3">{T.columns.number}</th>
            <th scope="col" className="px-4 py-3">{T.columns.level}</th>
            <th scope="col" className="px-4 py-3">{T.columns.lights}</th>
            <th scope="col" className="px-4 py-3">{T.columns.result}</th>
            <th scope="col" className="px-4 py-3 text-right">{T.columns.time}</th>
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
                  ? T.noAnswer(row.deadlineSec.toFixed(1))
                  : T.seconds(row.responseSec.toFixed(2))}
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
          <h1 className="font-sign text-4xl sm:text-5xl">{visitorText.result.notFoundTitle}</h1>
          <p className="mt-4 text-lg text-muted">
            {visitorText.result.notFoundText}
          </p>
          <Link
            to="/leaderboard"
            className="sign mt-8 inline-flex min-h-[44px] items-center bg-tent px-5 py-2 text-base text-cream transition-transform hover:-translate-y-0.5"
          >
            {visitorText.common.backToLeaderboard}
          </Link>
        </div>
      </section>
    )
  }

  if (game.error && !game.data) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
        <StatusMessage variant="error" error={game.error} onRetry={game.retry} title={visitorText.result.loadError} />
      </section>
    )
  }

  if (!game.data) {
    return (
      <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6" role="status">
        <p className="font-sign text-lg">{T.loading}</p>
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
          <p className="mt-1 text-muted">{T.gameLine(session.session_id, formatDateTime(session.received_at))}</p>
        </div>
        <div className="flex flex-col items-start justify-center gap-1 border-t-[3px] border-dashed border-ink px-6 py-5 md:items-end md:border-l-[3px] md:border-t-0">
          <ScoreCounter value={session.final_score} tone="dark" className="text-3xl sm:text-4xl" />
          <span className="text-xs font-extrabold uppercase tracking-[0.25em] text-muted">{visitorText.common.points}</span>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* The printed receipt */}
        <div className="ticket rotate-[0.4deg] px-6 py-5">
          <h2 className="font-sign text-lg text-tent">{T.receipt}</h2>
          <dl className="mt-2">
            <ReceiptLine label={T.levelReached} value={levelReached(session) ?? "-"} />
            <ReceiptLine label={T.levelsCleared} value={session.highest_level_completed ?? "-"} />
            <ReceiptLine label={T.roundsCleared} value={session.successful_rounds ?? "-"} />
            <ReceiptLine label={T.livesLost} value={session.failed_attempts ?? "-"} />
            <ReceiptLine label={T.gameTime} value={formatDuration(session.duration_seconds)} />
            <ReceiptLine label={T.gotRight} value={formatPercent(features?.success_rate)} />
            <ReceiptLine
              label={T.speed}
              value={typeof features?.avg_reaction_sec === "number" ? T.seconds(features.avg_reaction_sec.toFixed(2)) : "-"}
            />
            <ReceiptLine
              label={T.gameType}
              value={session.is_synthetic === 1 || session.device_id === "SIM01" ? T.testGame : T.realGame}
            />
          </dl>
        </div>

        {/* Rank stamp and animal */}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4 px-1">
            <p className="text-lg font-extrabold">{T.rank}</p>
            {prediction?.skill_rank ? (
              <SkillBadge value={prediction.skill_rank} size="lg" />
            ) : (
              <p className="text-lg text-muted">{T.notAvailable}</p>
            )}
            <HelpLink topic="rank" />
          </div>
          <div className="-rotate-1 rounded-[6px] border-[3px] border-ink bg-tag px-5 py-5 shadow-hard">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-sign text-sm">{T.animalTitle}</p>
              <HelpLink topic="animal" />
            </div>
            <AnimalResult prediction={prediction} />
          </div>
        </div>
      </div>

      {/* Chart + table */}
      {rows.length === 0 ? (
        <p className="ticket px-6 py-10 text-lg">{T.noTries}</p>
      ) : (
        <>
          <div className="ticket px-5 py-6 sm:px-7">
            <h2 className="font-sign text-xl sm:text-2xl">{T.chartTitle}</h2>
            <p className="mb-5 mt-1 text-muted">
              {T.summary(rows.length, counts.pass || 0, counts.wrong || 0, counts.timeout || 0)}
            </p>
            <AttemptsChart rows={rows} />
          </div>

          <div>
            <h2 className="mb-4 font-sign text-xl sm:text-2xl">{T.triesTitle}</h2>
            <AttemptsTable rows={rows} />
          </div>
        </>
      )}
    </section>
  )
}
