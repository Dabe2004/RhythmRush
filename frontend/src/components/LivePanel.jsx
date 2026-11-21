// frontend/src/components/LivePanel.jsx
// The live mirror of the hardware control panel (copies the real panel, not
// the carnival look): START | LCD | RESET on top, six round buttons in two
// rows, a speaker grille. It draws a panelView (live/liveReducer.js); timing
// lives there, so this file only toggles CSS classes. Animations are
// transform/opacity only and stop for prefers-reduced-motion.
//
// interactive = false (live mirror): nothing here is a control, because the
// web cannot control the hardware. interactive = true (demo): START and RESET
// are real buttons.

import { visitorText } from "../content/visitorText"
import { ARCADE_COLORS } from "../theme"

const V = visitorText.live

function Pill({ kind, label, view, interactive, onPress }) {
  const down = view.control?.control === kind
  const className = `rr-pill rr-pill-${kind} ${down ? "is-down" : ""}`
  if (interactive) {
    return (
      <button key={down ? view.control.key : kind} type="button" className={className} onClick={onPress}>
        {label}
      </button>
    )
  }
  return (
    <span key={down ? view.control.key : kind} className={className} aria-hidden="true">
      {label}
    </span>
  )
}

function GameButton({ number, view }) {
  const color = ARCADE_COLORS[number - 1]
  const lit = view.lit.includes(number)
  const press = view.press?.button === number ? view.press : null
  const classes = ["rr-btn", `rr-btn-${number}`, lit ? "is-lit" : "", press ? "is-pressed" : "", press && !press.ok ? "is-wrong" : ""]
  return (
    <div className="rr-btn-wrap">
      <div key={press ? press.key : "still"} className={classes.join(" ")}>
        <span className="rr-btn-num">{number}</span>
        {press ? <span className="rr-ripple" /> : null}
      </div>
      <span className="rr-btn-label">
        {color.name}
      </span>
    </div>
  )
}

function Lives({ lives }) {
  if (lives === null || lives === undefined) return <div className="rr-lives" />
  return (
    <div className="rr-lives" aria-label={V.lives(lives)}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`rr-life ${n > lives ? "is-spent" : ""}`} aria-hidden="true">
          <svg viewBox="0 0 24 22">
            <path d="M12 21 2.6 11.6A5.7 5.7 0 0 1 12 3.9a5.7 5.7 0 0 1 9.4 7.7Z" />
          </svg>
        </span>
      ))}
    </div>
  )
}

export default function LivePanel({ view, interactive = false, onStart, onReset }) {
  return (
    <div className={`rr-panel ${view.dim ? "rr-dim" : ""}`}>
      <div className="rr-top">
        <Pill kind="start" label={V.start} view={view} interactive={interactive} onPress={onStart} />
        <div className="rr-lcd-wrap">
          <div className="rr-lcd-box">
            <div className="rr-lcd" aria-label={V.screen}>
              {view.lcd.map((line, i) => (
                <span key={i} className="rr-lcd-line">
                  {line}
                </span>
              ))}
            </div>
          </div>
          {/* Fixed height: nothing below the LCD jumps when the input phase starts. */}
          <div className="rr-status">
            <Lives lives={view.lives} />
            <div className="rr-dots" aria-label={view.progress ? V.presses(view.progress.done, view.progress.total) : undefined}>
              {view.progress
                ? Array.from({ length: view.progress.total }, (_, i) => <span key={i} className={i < view.progress.done ? "is-done" : ""} />)
                : null}
            </div>
          </div>
          <div className="rr-fuse" aria-hidden="true">
            {view.fuse ? <span key={view.fuse.key} style={{ animationDuration: `${view.fuse.ms}ms` }} /> : null}
          </div>
        </div>
        <Pill kind="reset" label={V.reset} view={view} interactive={interactive} onPress={onReset} />
      </div>

      <div className="rr-grid" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <GameButton key={n} number={n} view={view} />
        ))}
      </div>

      <div className="rr-speaker" aria-hidden="true">
        {Array.from({ length: 21 }, (_, i) => (
          <span key={i} />
        ))}
      </div>

      {view.overlay ? (
        <div className="rr-overlay" aria-hidden="true">
          <span key={view.overlayKey}>{view.overlay}</span>
        </div>
      ) : null}
    </div>
  )
}

// "Live" / "Reconnecting..." / "Device offline": text plus a shape, never colour alone.
export function ConnectionChip({ connection, label }) {
  return (
    <span className={`live-chip live-chip-${connection}`} role="status">
      <span className="live-chip-dot" aria-hidden="true" />
      {label}
    </span>
  )
}
