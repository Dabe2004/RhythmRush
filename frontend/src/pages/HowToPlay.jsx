// frontend/src/pages/HowToPlay.jsx
// /how-to-play: a folded paper brochure for visitors (text: content/howToPlay.js).
// Desktop: three columns like a tri-fold; tablet two; phone one, with a
// sticky mini contents. Prints on one portrait A4 page with a QR code that is
// never shown on screen. No popups anywhere.

import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"

import AnimalIcon from "../components/animals/AnimalIcon"
import PrintQr from "../components/PrintQr"
import SkillBadge from "../components/SkillBadge"
import { LANGUAGES, brochure } from "../content/howToPlay"
import { ARCADE_COLORS } from "../theme"

const LANG_KEY = "rhythmRushLang"
const JUMPS = ["play", "score", "rank", "animal"]

function storedLang() {
  try {
    return localStorage.getItem(LANG_KEY) === "fil" ? "fil" : "en"
  } catch {
    return "en"
  }
}

// Smooth jump to a panel (instant with reduced motion), focus moves with it.
function goTo(id) {
  const target = document.getElementById(id)
  if (!target) return
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" })
  target.focus({ preventScroll: true })
}

// Watch -> your turn -> next level, drawn with the six button colours.
function Strip({ ui }) {
  const frame = (x, lit, extra) => (
    <g transform={`translate(${x} 0)`}>
      <rect x="2" y="2" width="96" height="70" rx="10" fill="#fffaee" stroke="#1d1a2f" strokeWidth="3" />
      {ARCADE_COLORS.map((c, i) => (
        <circle
          key={c.name}
          cx={22 + (i % 3) * 28}
          cy={24 + Math.floor(i / 3) * 26}
          r={i === lit ? 11 : 9}
          fill={c.hex}
          stroke="#1d1a2f"
          strokeWidth={i === lit ? 4 : 2}
        />
      ))}
      {extra}
    </g>
  )
  return (
    <figure className="mt-4">
      <svg viewBox="0 0 340 100" role="img" aria-label={ui.strip} className="w-full max-w-[22rem]">
        {frame(0, 1)}
        <path d="M104 37h18m-6-6 6 6-6 6" fill="none" stroke="#1d1a2f" strokeWidth="3" strokeLinecap="round" />
        {frame(120, 4, <path d="M78 58l10 10" stroke="#1d1a2f" strokeWidth="4" strokeLinecap="round" />)}
        <path d="M224 37h18m-6-6 6 6-6 6" fill="none" stroke="#1d1a2f" strokeWidth="3" strokeLinecap="round" />
        {frame(240, -1, <text x="82" y="66" fontFamily="Bungee, sans-serif" fontSize="16" fill="#1d1a2f">+1</text>)}
        {ui.stripSteps.map((label, i) => (
          <text key={label} x={50 + i * 120} y="94" textAnchor="middle" fontFamily="Nunito, sans-serif" fontWeight="800" fontSize="13" fill="#1d1a2f">
            {label}
          </text>
        ))}
      </svg>
    </figure>
  )
}

function Panel({ panel, number, ui }) {
  return (
    <section id={panel.id} tabIndex={-1} aria-labelledby={`${panel.id}-title`} className="brochure-panel ticket">
      <h2 id={`${panel.id}-title`} className="brochure-title">
        <span className="brochure-num" aria-hidden="true">
          {number}
        </span>
        {panel.title}
      </h2>

      {panel.steps ? (
        <ol className="brochure-steps">
          {panel.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}
      {panel.id === "how" ? <Strip ui={ui} /> : null}
      {panel.paragraphs?.map((text) => (
        <p key={text} className="brochure-text">
          {text}
        </p>
      ))}

      {panel.stamps ? (
        <ul className="brochure-stamps" aria-label={ui.stampsLabel}>
          {panel.stamps.map((s) => (
            <li key={s.rank}>
              <SkillBadge value={s.rank} size="sm" />
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {panel.table ? (
        <table className="brochure-animals">
          <caption>{ui.animalCaption}</caption>
          <thead>
            <tr>
              {ui.animalHeaders.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {panel.table.map((row) => (
              <tr key={row.animal}>
                <th scope="row">
                  <AnimalIcon animal={row.animal} size={44} className="shrink-0" />
                  <span>{row.animal}</span>
                </th>
                <td>{row.group}</td>
                <td className="font-sign">{row.iq}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {panel.bullets ? (
        <ul className="brochure-bullets">
          {panel.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      {panel.notes?.map((text) => (
        <p key={text} className="brochure-note">
          {text}
        </p>
      ))}
    </section>
  )
}

export default function HowToPlay() {
  const [lang, setLang] = useState(storedLang)
  const b = brochure(lang)
  const { hash } = useLocation()

  // Arriving from a "?" link (/how-to-play#rank): go to that panel.
  useEffect(() => {
    if (hash) goTo(hash.slice(1))
  }, [hash])

  const choose = (next) => {
    setLang(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      // Private mode: just not remembered.
    }
  }

  return (
    <article className="brochure mx-auto w-full max-w-[1240px] px-4 pb-14 pt-6 sm:px-6" lang={b.lang === "fil" ? "fil" : "en"}>
      <header className="brochure-head">
        <h1 className="sign -rotate-1 bg-tent px-4 py-1.5 text-3xl text-cream sm:text-4xl">{b.ui.title}</h1>
        <p className="brochure-intro">{b.ui.intro}</p>
        <div className="brochure-tools no-print">
          <div role="group" aria-label={b.ui.language} className="flex gap-2">
            {Object.entries(LANGUAGES).map(([code, name]) => (
              <button
                key={code}
                type="button"
                aria-pressed={b.lang === code}
                onClick={() => choose(code)}
                className={`sign min-h-[44px] px-3 py-1.5 text-sm ${b.lang === code ? "bg-paint-yellow" : "bg-ticket"}`}
              >
                {name}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => window.print()} className="sign min-h-[44px] bg-ticket px-3 py-1.5 text-sm">
            {b.ui.print}
          </button>
        </div>
      </header>
      {b.ui.review ? <p className="brochure-review">{b.ui.review}</p> : null}

      <nav aria-label={b.ui.contents} className="brochure-contents no-print">
        {JUMPS.map((id) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(event) => {
              event.preventDefault()
              window.history.replaceState(null, "", `#${id}`)
              goTo(id)
            }}
          >
            {b.ui.jump[id]}
          </a>
        ))}
      </nav>

      <div className="brochure-grid">
        {b.panels.map((panel, i) => (
          <Panel key={panel.id} panel={panel} number={i + 1} ui={b.ui} />
        ))}
        {/* Print only: the last item of the column flow, so on paper it sits at
            the bottom and the columns stay balanced. Hidden on screen. */}
        <PrintQr ui={b.ui} />
      </div>

      <details className="brochure-glossary ticket">
        <summary>{b.ui.glossary}</summary>
        <dl>
          {b.glossary.map(([term, text]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </details>
    </article>
  )
}
