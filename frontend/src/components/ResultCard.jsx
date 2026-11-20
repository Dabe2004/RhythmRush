// frontend/src/components/ResultCard.jsx
// The big "your result" block, shared by the kiosk screen (/result) and the
// single-game screen (/result/:sessionId).
//
// Sized to be readable from about 2 metres away on a TV or monitor.
// Everything is rendered as React text, never as HTML.

import { useEffect, useState } from "react"

import { getLeaderboard } from "../api"
import {
  animalArticle,
  findRank,
  formatScore,
  levelReached,
  outcomeTitle,
} from "../format"
import { animalEmoji } from "../theme"
import SkillBadge from "./SkillBadge"

// Rank of this game in the top 100.
//   status "loading" | "ok" | "error"; value is null when outside the top 100.
function useRank(sessionId) {
  const [rank, setRank] = useState({ id: null, status: "loading", value: null })

  useEffect(() => {
    let cancelled = false

    getLeaderboard(100).then(
      (data) => {
        if (!cancelled) {
          setRank({ id: sessionId, status: "ok", value: findRank(data?.entries, sessionId) })
        }
      },
      () => {
        if (!cancelled) setRank({ id: sessionId, status: "error", value: null })
      },
    )

    return () => {
      cancelled = true
    }
  }, [sessionId])

  return rank.id === sessionId ? rank : { status: "loading", value: null }
}

function RankLine({ rank }) {
  // If the leaderboard request failed, the rank is simply not shown.
  if (rank.status === "error") return null

  if (rank.status === "loading") {
    return <p className="text-3xl font-bold text-slate-500 sm:text-4xl">Rank ...</p>
  }

  if (rank.value === null) {
    return (
      <p className="text-3xl font-bold text-slate-300 sm:text-4xl">
        Outside the top 100
      </p>
    )
  }

  return (
    <p className="text-4xl font-black text-indigo-200 sm:text-5xl">Rank #{rank.value}</p>
  )
}

function AnimalBlock({ prediction }) {
  if (!prediction || !prediction.animal) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-6 py-5 text-center">
        <p className="text-2xl text-slate-400">Fun result not available for this game</p>
      </div>
    )
  }

  const { animal, animal_iq: iq } = prediction

  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-6 py-5 text-center">
      <p className="text-3xl font-bold text-amber-100 sm:text-4xl">
        You played like {animalArticle(animal)}{" "}
        <span aria-hidden="true" className="text-5xl align-middle sm:text-6xl">
          {animalEmoji(animal)}
        </span>{" "}
        {animal}
        {typeof iq === "number" ? `, IQ ${iq}` : ""}!
      </p>
      <p className="mt-2 text-lg text-amber-200/70">Just for fun, not a real IQ test.</p>
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} props.detail    GET /api/game-sessions/:id response
 * @param {string|null} props.nickname  nickname to show (may come from a save)
 * @param {import("react").ReactNode} [props.children] nickname form, buttons...
 */
export default function ResultCard({ detail, nickname, children }) {
  const session = detail.session
  const rank = useRank(session.session_id)
  const level = levelReached(session)
  const won = session.outcome === "win"

  return (
    <article className="mx-auto w-full max-w-4xl space-y-6 text-center">
      <h1
        className={`text-6xl font-black tracking-tight sm:text-8xl ${
          won
            ? "bg-gradient-to-r from-yellow-200 via-amber-300 to-orange-400 bg-clip-text text-transparent"
            : "text-rose-300"
        }`}
      >
        {outcomeTitle(session.outcome)}
      </h1>

      {nickname ? (
        <p className="text-3xl font-bold text-white sm:text-4xl">{nickname}</p>
      ) : null}

      <div>
        <p className="text-7xl font-black tabular-nums text-amber-300 sm:text-9xl">
          {formatScore(session.final_score)}
        </p>
        <p className="mt-1 text-xl font-semibold uppercase tracking-[0.3em] text-slate-400">
          points
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {level !== null ? (
          <p className="text-4xl font-bold text-white sm:text-5xl">Level {level} reached</p>
        ) : null}
        <RankLine rank={rank} />
      </div>

      {detail.prediction?.skill_rank ? (
        <div className="flex items-center justify-center gap-4">
          <span className="text-2xl text-slate-400">Skill</span>
          <SkillBadge value={detail.prediction.skill_rank} size="lg" />
        </div>
      ) : null}

      <AnimalBlock prediction={detail.prediction} />

      {children}
    </article>
  )
}
