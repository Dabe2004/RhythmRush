// frontend/src/components/ResultCard.jsx
// The result ticket, shared by the kiosk screen (/result) and the
// single-game screen (/result/:sessionId). It slides in like a ticket coming
// out of the machine. Sized to be readable from about 2 metres on a TV.
// Everything is rendered as React text, never as HTML.

import { useEffect, useState } from "react"

import { getLeaderboard } from "../api"
import {
  animalArticle,
  findRank,
  levelReached,
  outcomeTitle,
} from "../format"
import { visitorText } from "../content/visitorText"
import AnimalIcon from "./animals/AnimalIcon"
import HelpLink from "./HelpLink"
import RankBadge from "./RankBadge"
import ScoreCounter from "./ScoreCounter"
import SkillBadge from "./SkillBadge"

// Rank of this game in the top 100.
//   status "loading" | "ok" | "error"; value is null when outside the top 100.
const T = visitorText.result

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

function RankBlock({ rank }) {
  // If the leaderboard request failed, the rank is simply not shown.
  if (rank.status === "error") return null

  if (rank.status === "loading") {
    return <p className="font-sign text-2xl text-muted">{T.placeLoading}</p>
  }

  if (rank.value === null) {
    return (
      <p className="sign rotate-2 bg-cream px-4 py-2 text-xl sm:text-2xl">{T.outsideTop}</p>
    )
  }

  // A ribbon only for the podium; otherwise the number alone (a small stub
  // next to a huge "Rank #6" just repeated the number).
  const podium = rank.value <= 3

  return (
    <div className="flex items-center gap-3">
      {podium ? <RankBadge rank={rank.value} size={76} /> : null}
      <p className="font-sign text-3xl sm:text-5xl">{T.place(rank.value)}</p>
    </div>
  )
}

function AnimalBlock({ prediction }) {
  const hasAnimal = Boolean(prediction?.animal)

  return (
    <div className="relative rotate-1 rounded-[6px] border-[3px] border-ink bg-tag px-5 pb-5 pt-4 shadow-hard sm:px-7">
      <div className="flex items-center justify-between gap-2">
        <p className="font-sign text-base">{T.animalTitle}</p>
        <HelpLink topic="animal" />
      </div>
      {hasAnimal ? (
        <>
          <div className="mt-2 flex items-center gap-4 sm:gap-6">
            <AnimalIcon animal={prediction.animal} size={112} className="shrink-0" />
            <div>
              <p className="text-[clamp(1.6rem,2.6vw,2.5rem)] font-extrabold leading-tight">
                {T.playedLike(animalArticle(prediction.animal), prediction.animal)}
              </p>
              {typeof prediction.animal_iq === "number" ? (
                <p className="mt-1 leading-tight">
                  <span className="block text-lg font-extrabold">{T.iqLabel}</span>
                  <span className="font-sign text-[clamp(1.75rem,3vw,3rem)]">{prediction.animal_iq}</span>
                </p>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-lg font-extrabold">{T.justForFun}</p>
        </>
      ) : (
        <div className="mt-2 flex items-center gap-4">
          <AnimalIcon animal={null} size={72} />
          <p className="text-2xl font-extrabold">{T.noAnimal}</p>
        </div>
      )}
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} props.detail    GET /api/game-sessions/:id response
 * @param {string|null} props.nickname  nickname to show (may come from a save)
 * @param {import("react").ReactNode} [props.children] the guest book form
 */
export default function ResultCard({ detail, nickname, children }) {
  const session = detail.session
  const rank = useRank(session.session_id)
  const level = levelReached(session)
  const won = session.outcome === "win"

  return (
    <article className="ticket ticket-notched ticket-print w-full px-6 py-8 shadow-hard-lg sm:px-10 lg:px-12 lg:py-10">
      {/* The win confetti is drawn by the stage behind this ticket
          (Result.jsx), so it never covers the text. */}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:gap-0">
        <div className="xl:pr-10">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-5">
            <h1
              className={`sign -rotate-2 px-5 py-2 text-[clamp(2.5rem,6vw,5.25rem)] ${
                won ? "bg-paint-yellow text-ink" : "bg-tent text-cream"
              }`}
            >
              {outcomeTitle(session.outcome)}
            </h1>
            <RankBlock rank={rank} />
          </div>

          {nickname ? (
            <p className="mt-6 truncate text-3xl font-extrabold sm:text-4xl">{nickname}</p>
          ) : null}

          <div className="mt-6">
            <ScoreCounter
              value={session.final_score}
              tone="dark"
              className="text-[clamp(2.75rem,6.5vw,6.5rem)]"
            />
            <p className="mt-2 text-base font-extrabold uppercase tracking-[0.3em] text-muted">
              {visitorText.common.points}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-6">
            {level !== null ? (
              <p className="sign -rotate-1 bg-cream px-4 py-2 text-2xl sm:text-3xl">
                {T.levelReached(level)}
              </p>
            ) : null}
            {detail.prediction?.skill_rank ? (
              <div className="flex items-center gap-3">
                <span className="text-lg font-extrabold text-muted">{T.rank}</span>
                <SkillBadge value={detail.prediction.skill_rank} size="lg" />
                <HelpLink topic="rank" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t-[3px] border-dashed border-ink pt-8 xl:border-l-[3px] xl:border-t-0 xl:pl-10 xl:pt-0">
          <AnimalBlock prediction={detail.prediction} />
          {children}
        </div>
      </div>
    </article>
  )
}
