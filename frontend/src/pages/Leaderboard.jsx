// frontend/src/pages/Leaderboard.jsx
// Public Top 10, refreshed every 10 seconds.
//
// Layout (see docs/FRONTEND.md):
//   - ranks 1-3: the WINNERS PODIUM (rank 1 = the big "First Place" ticket,
//     ranks 2 and 3 side by side under it)
//   - ranks 4-10: a COMPACT LIST of slim ticket rows
//   - from 1024 px: podium left (about 5/12), list right (about 7/12)
//   - narrower: one column, podium first
// Ties keep their shared rank number and are never hidden: every entry the
// API returns is shown, in API order (splitPodium in leaderboard.js).
//
// Every ticket is one link to /session/:id. Nicknames and every other value
// are rendered as React text (never as HTML).

import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { getLeaderboard } from "../api"
import { visitorText } from "../content/visitorText"
import HelpLink from "../components/HelpLink"
import { formatClock } from "../format"
import AnimalIcon from "../components/animals/AnimalIcon"
import AnimalTag from "../components/AnimalTag"
import LevelSign from "../components/LevelSign"
import { LiveBanner } from "../components/LiveIndicator"
import PlayerName from "../components/PlayerName"
import RankBadge from "../components/RankBadge"
import ScoreCounter from "../components/ScoreCounter"
import SkillBadge from "../components/SkillBadge"
import StatusMessage from "../components/StatusMessage"
import { LEADERBOARD_LIMIT, leaderboardSubtitle, splitPodium } from "../leaderboard"
import usePolling from "../usePolling"

const L = visitorText.leaderboard

function sessionPath(sessionId) {
  return `/session/${encodeURIComponent(sessionId)}`
}

// Stagger for the one-time slide-in (40 ms per ticket).
function enterDelay(index) {
  return { "--enter-delay": `${index * 0.04}s` }
}

// Animal drawing + name + fun IQ number. A game without one shows "No animal yet".
function AnimalBlurb({ animal, iq, size }) {
  if (!animal) {
    return (
      <div className="flex items-center gap-3">
        <AnimalIcon animal={null} size={size} className="shrink-0 opacity-60" />
        <p className="font-extrabold text-muted">{L.noAnimal}</p>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <AnimalIcon animal={animal} size={size} className="shrink-0" />
      <div className="min-w-0 leading-tight">
        <p className="truncate font-extrabold">{animal}</p>
        {typeof iq === "number" ? (
          <p className="mt-1 inline-block rounded-[3px] border-2 border-ink bg-tag px-1.5 font-sign text-sm">
            {visitorText.result.iq(iq)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Podium
// ---------------------------------------------------------------------------
function ChampionCard({ entry, index }) {
  return (
    <li className="lb-enter w-full" style={enterDelay(index)}>
      <Link
        to={sessionPath(entry.session_id)}
        className="ticket ticket-notched block -rotate-[0.6deg] px-5 pb-4 pt-5 shadow-hard-lg transition-transform hover:-translate-y-1 sm:px-6"
      >
        <span className="sign absolute -top-4 left-5 -rotate-2 bg-paint-yellow px-3 py-0.5 text-sm text-ink">
          {L.firstPlace}
        </span>

        <div className="flex items-center gap-4">
          <span className="shrink-0">
            <RankBadge rank={entry.rank} size={72} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-2xl font-extrabold sm:text-3xl">
              <PlayerName nickname={entry.nickname} />
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <LevelSign level={entry.highest_level_completed} />
              <SkillBadge value={entry.skill_rank} />
            </div>
          </div>
        </div>

        <div aria-hidden="true" className="my-2.5 border-t-[3px] border-dashed border-ink" />

        {/* Animal and score share one line from 640 px (wraps on phones). */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:flex-nowrap">
          <AnimalBlurb animal={entry.animal} iq={entry.animal_iq} size={96} />
          <div className="shrink-0 text-right">
            <ScoreCounter value={entry.final_score} tone="dark" className="text-3xl" />
            <p className="mt-1 text-xs font-extrabold uppercase tracking-[0.25em] text-muted">points</p>
          </div>
        </div>
      </Link>
    </li>
  )
}

function RunnerUpCard({ entry, index }) {
  const tilt = index % 2 === 0 ? "rotate-[0.6deg]" : "-rotate-[0.5deg]"

  return (
    <li
      className="lb-enter w-full sm:w-[calc(50%-0.375rem)]"
      style={enterDelay(index)}
    >
      {/* Compact two-tier ticket: ribbon + name, level + stamp, tear line,
          then the 72 px animal drawing with its name, fun IQ number and the score. */}
      <Link
        to={sessionPath(entry.session_id)}
        className={`ticket ticket-notched block h-full ${tilt} px-4 pb-3 pt-3 transition-transform hover:-translate-y-1`}
      >
        {/* Name and level sit beside the ribbon; the stamp gets its own
            line, so "Level 13" + "INTERMEDIATE" never wrap and the card
            height is the same for every entry. */}
        <div className="flex items-center gap-3">
          <span className="shrink-0">
            <RankBadge rank={entry.rank} size={48} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold">
              <PlayerName nickname={entry.nickname} />
            </p>
            <LevelSign level={entry.highest_level_completed} small className="mt-0.5" />
          </div>
        </div>
        <div className="mt-1.5">
          <SkillBadge value={entry.skill_rank} size="xs" />
        </div>

        <div aria-hidden="true" className="my-2 border-t-[3px] border-dashed border-ink" />

        <div className="flex items-center gap-3">
          {entry.animal ? (
            <AnimalIcon animal={entry.animal} size={72} className="shrink-0" />
          ) : (
            <AnimalIcon animal={null} size={72} className="shrink-0 opacity-60" />
          )}
          <div className="min-w-0 flex-1 leading-tight">
            {/* Long names ("Bottlenose Dolphin") may use two lines. */}
            <p className="line-clamp-2 text-sm font-extrabold">{entry.animal || L.noAnimal}</p>
            {typeof entry.animal_iq === "number" ? (
              <p className="mt-0.5 inline-block rounded-[3px] border-2 border-ink bg-tag px-1.5 font-sign text-xs">
                {visitorText.result.iq(entry.animal_iq)}
              </p>
            ) : null}
          </div>
        </div>
        {/* The score gets its own line: next to the 72 px drawing a 5-digit
            counter does not fit in a half-width card. */}
        <div className="mt-1.5 text-right">
          <ScoreCounter value={entry.final_score} tone="dark" className="text-xl" />
        </div>
      </Link>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Compact list (ranks 4-10)
// ---------------------------------------------------------------------------
// One line when the list is wide enough (container query), otherwise two
// tidy lines: place, name + level, score / stamp, animal.
function ListRow({ entry, index }) {
  const tilt = index % 2 === 0 ? "-rotate-[0.25deg]" : "rotate-[0.25deg]"

  return (
    <li className="lb-enter @container" style={enterDelay(index)}>
      <Link
        to={sessionPath(entry.session_id)}
        className={`ticket ${tilt} flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 transition-transform hover:-translate-y-0.5 @min-[600px]:flex-nowrap`}
      >
        <span className="shrink-0">
          <RankBadge rank={entry.rank} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold" title={entry.nickname || visitorText.common.mysteryPlayer}>
            <PlayerName nickname={entry.nickname} />
          </p>
          <p className="mt-0.5 font-sign text-xs text-muted">Level {entry.highest_level_completed}</p>
        </div>

        {/* One-line rows use fixed column widths so stamps and tags line up
            row to row; on the second line of a narrow row they shrink to fit
            (a phone row is only about 300 px wide). */}
        <div className="order-last flex w-full items-center gap-3 border-t-2 border-dashed border-rule pt-2 @min-[600px]:order-none @min-[600px]:w-auto @min-[600px]:border-t-0 @min-[600px]:pt-0">
          <span className="shrink-0 text-center @min-[600px]:w-[8rem]">
            <SkillBadge value={entry.skill_rank} size="xs" />
          </span>
          <AnimalTag
            animal={entry.animal}
            iq={entry.animal_iq}
            size={44}
            className="min-w-0 @min-[600px]:w-[12rem] @min-[600px]:shrink-0"
          />
        </div>

        <span className="ml-auto shrink-0 text-right">
          <ScoreCounter value={entry.final_score} className="text-lg" />
        </span>
      </Link>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Leaderboard() {
  const { data, error, loading, lastUpdated, retry } = usePolling(
    () => getLeaderboard(LEADERBOARD_LIMIT),
    10000,
  )

  const entries = Array.isArray(data?.entries) ? data.entries : []
  const hasRows = entries.length > 0
  const { champions, runnersUp, rest } = splitPodium(entries)
  const showList = rest.length > 0

  // One-time slide-in: on for the first 1.5 s after the tickets appear.
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    if (!hasRows) return undefined
    const timer = setTimeout(() => setIntro(false), 1500)
    return () => clearTimeout(timer)
  }, [hasRows])

  // Philippine time, 12-hour clock.
  const updated = lastUpdated ? formatClock(lastUpdated) : "--:--"

  return (
    <section className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-6 sm:px-6 lg:pt-3">
      <LiveBanner />
      {/* Title row: the sign, the subtitle (full remaining width), the time. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 lg:mb-3 lg:flex-nowrap">
        <h1 className="sign shrink-0 -rotate-1 bg-tent px-4 py-1.5 text-3xl text-cream sm:text-4xl lg:text-3xl">
          {L.title}
        </h1>
        <p className="order-last min-h-[1.75rem] w-full text-lg lg:order-none lg:w-auto lg:flex-1">
          {leaderboardSubtitle(entries.length)}
        </p>
        <p className="ml-auto shrink-0 rotate-1 rounded-[4px] border-2 border-ink bg-ticket px-3 py-1.5 text-sm font-extrabold shadow-hard-sm lg:ml-0">
          {L.updated} <span className="font-sign">{updated}</span>
        </p>
        <p className="flex shrink-0 items-center text-sm font-extrabold">
          {L.rankHelp} <HelpLink topic="rank" /> {L.animalHelp} <HelpLink topic="animal" />
        </p>
      </div>

      {/* First load: the buttons light up while waiting. */}
      {loading && !data ? <StatusMessage variant="loading" /> : null}

      {/* First load failed: no data at all. */}
      {!loading && error && !data ? (
        <StatusMessage variant="error" error={error} onRetry={retry} />
      ) : null}

      {/* Loaded successfully, but the database is empty. */}
      {!loading && !error && data && !hasRows ? <StatusMessage variant="empty" /> : null}

      {hasRows ? (
        <div className={`relative ${intro ? "lb-intro" : ""}`}>
          {/* Refresh failed: the sign is taped over the board (no layout
              shift); the old tickets stay. */}
          {error && data ? (
            <div className="absolute left-1/2 top-2 z-20 w-[min(36rem,92%)] -translate-x-1/2">
              <StatusMessage
                variant="error"
                compact
                error={error}
                onRetry={retry}
                title={L.refreshError}
              />
            </div>
          ) : null}

          <div
            className={`${error ? "opacity-75" : ""} ${
              showList
                ? "grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-7"
                : "mx-auto max-w-[36rem]"
            }`}
          >
            <section aria-labelledby="podium-title">
              <h2 id="podium-title" className="sr-only">
                {L.podium}
              </h2>
              <ol className="flex flex-wrap justify-center gap-3 pt-3">
                {champions.map((entry, index) => (
                  <ChampionCard key={entry.session_id} entry={entry} index={index} />
                ))}
                {runnersUp.map((entry, index) => (
                  <RunnerUpCard
                    key={entry.session_id}
                    entry={entry}
                    index={champions.length + index}
                  />
                ))}
              </ol>
            </section>

            {showList ? (
              <section aria-labelledby="list-title">
                <h2 id="list-title" className="sr-only">
                  {L.list}
                </h2>
                <ol className="space-y-2.5 lg:pt-3">
                  {rest.map((entry, index) => (
                    <ListRow
                      key={entry.session_id}
                      entry={entry}
                      index={champions.length + runnersUp.length + index}
                    />
                  ))}
                </ol>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
