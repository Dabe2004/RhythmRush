// frontend/src/pages/Leaderboard.jsx
// Public top-20 leaderboard, refreshed every 10 seconds.
//
// Nicknames and every other value are rendered as React text (never as HTML),
// so a nickname containing < or > is shown literally.

import { Link, useNavigate } from "react-router-dom"

import { getLeaderboard } from "../api"
import AnimalTag from "../components/AnimalTag"
import SkillBadge from "../components/SkillBadge"
import StatusMessage from "../components/StatusMessage"
import usePolling from "../usePolling"

// Gold, silver, and bronze for the first three ranks. Tied entries keep the
// same number and therefore the same colour.
function rankClasses(rank) {
  if (rank === 1) {
    return "bg-gradient-to-br from-yellow-200 to-amber-500 text-amber-950 ring-yellow-100/70"
  }
  if (rank === 2) {
    return "bg-gradient-to-br from-slate-100 to-slate-400 text-slate-900 ring-slate-100/70"
  }
  if (rank === 3) {
    return "bg-gradient-to-br from-orange-300 to-amber-700 text-orange-950 ring-orange-200/70"
  }
  return "bg-slate-800 text-slate-300 ring-slate-700"
}

function RankBadge({ rank }) {
  return (
    <span
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-lg font-black ring-2 ring-inset ${rankClasses(
        rank,
      )}`}
    >
      {rank}
    </span>
  )
}

function sessionPath(sessionId) {
  return `/session/${encodeURIComponent(sessionId)}`
}

// The name is a real link (keyboard and screen readers); the whole row or
// card is also clickable for mouse and touch users.
function PlayerName({ nickname, sessionId }) {
  return (
    <Link
      to={sessionPath(sessionId)}
      className="rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
    >
      {nickname ? nickname : <span className="text-slate-500">Anonymous</span>}
    </Link>
  )
}

// Row/card click, ignored when the click was on the link itself (otherwise
// the same page would be pushed onto the history twice).
function useOpenSession() {
  const navigate = useNavigate()
  return (event, sessionId) => {
    if (event.target.closest("a")) return
    navigate(sessionPath(sessionId))
  }
}

function formatScore(score) {
  return typeof score === "number" ? score.toLocaleString("en-US") : "-"
}

function formatLevel(level) {
  return typeof level === "number" ? `Level ${level}` : "-"
}

export default function Leaderboard() {
  const { data, error, loading, lastUpdated, retry } = usePolling(
    () => getLeaderboard(20),
    10000,
  )
  const openSession = useOpenSession()

  const entries = Array.isArray(data?.entries) ? data.entries : []
  const hasRows = entries.length > 0
  const updated = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "--:--:--"

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            Leaderboard
          </h1>
          <p className="mt-2 text-lg text-slate-400">
            Top 20 scores from the arcade.
          </p>
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Updated {updated}
        </p>
      </div>

      {/* Refresh failed, but old rows are still on screen. */}
      {error && data ? (
        <StatusMessage
          variant="error"
          compact
          error={error}
          onRetry={retry}
          title="Could not refresh. Showing the last known scores."
        />
      ) : null}

      {/* First load: skeleton rows. */}
      {loading && !data ? <StatusMessage variant="loading" /> : null}

      {/* First load failed: no data at all. */}
      {!loading && error && !data ? (
        <StatusMessage variant="error" error={error} onRetry={retry} />
      ) : null}

      {/* Loaded successfully, but the database is empty. */}
      {!loading && !error && data && !hasRows ? (
        <StatusMessage variant="empty" />
      ) : null}

      {hasRows ? (
        <>
          {/* Wide screens: table. */}
          <div className="hidden overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-indigo-950/40 md:block">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead className="bg-slate-950/60 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                <tr>
                  <th scope="col" className="px-5 py-4">
                    Rank
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Player
                  </th>
                  <th scope="col" className="px-5 py-4 text-right">
                    Score
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Level
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Skill
                  </th>
                  <th scope="col" className="px-5 py-4">
                    Animal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {entries.map((entry) => (
                  <tr
                    key={entry.session_id}
                    onClick={(event) => openSession(event, entry.session_id)}
                    className="cursor-pointer transition hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-4">
                      <RankBadge rank={entry.rank} />
                    </td>
                    <td className="px-5 py-4 text-xl font-semibold text-white">
                      <PlayerName nickname={entry.nickname} sessionId={entry.session_id} />
                    </td>
                    <td className="px-5 py-4 text-right text-2xl font-black tabular-nums text-amber-300">
                      {formatScore(entry.final_score)}
                    </td>
                    <td className="px-5 py-4 text-lg text-slate-300">
                      {formatLevel(entry.highest_level_completed)}
                    </td>
                    <td className="px-5 py-4">
                      <SkillBadge value={entry.skill_rank} />
                    </td>
                    <td className="px-5 py-4 text-lg text-slate-300">
                      <AnimalTag animal={entry.animal} iq={entry.animal_iq} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow phones: one card per entry. */}
          <div className="space-y-3 md:hidden">
            {entries.map((entry) => (
              <article
                key={entry.session_id}
                onClick={(event) => openSession(event, entry.session_id)}
                className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg transition hover:bg-slate-800/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <RankBadge rank={entry.rank} />
                    <div>
                      <p className="text-lg font-bold text-white">
                        <PlayerName nickname={entry.nickname} sessionId={entry.session_id} />
                      </p>
                      <p className="text-sm text-slate-400">
                        {formatLevel(entry.highest_level_completed)}
                      </p>
                    </div>
                  </div>
                  <p className="text-2xl font-black tabular-nums text-amber-300">
                    {formatScore(entry.final_score)}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
                  <SkillBadge value={entry.skill_rank} />
                  <AnimalTag animal={entry.animal} iq={entry.animal_iq} />
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
