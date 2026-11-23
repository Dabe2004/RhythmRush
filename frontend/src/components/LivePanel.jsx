// frontend/src/components/LivePanel.jsx
// The live mirror of the real game box top (copies the box, not the carnival
// look): pink START | blue LCD | buzzer on top, then six arcade buttons in
// two rows with a green LED above each. The buttons cannot light up, so the
// LED above a button lights instead, as on the box. The box has no RESET
// button: a RESET from the device (START held) animates START. It draws a
// panelView (live/liveReducer.js); timing lives there, so this file only
// toggles CSS classes. Animations are transform/opacity only and stop for
// prefers-reduced-motion.
//
// interactive = false (live mirror): nothing here is a control, because the
// web cannot control the hardware. interactive = true (demo): START is a real
// button.

import { visitorText } from "../content/visitorText"
import { ARCADE_COLORS } from "../theme"

const V = visitorText.live

function StartButton({ view, interactive, onPress }) {
  const down = Boolean(view.control)
  const className = `rr-start ${down ? "is-down" : ""}`
  const key = down ? view.control.key : "still"
  if (interactive) {
    return <button key={key} type="button" className={className} aria-label={V.start} onClick={onPress} />
  }
  return <span key={key} className={className} aria-hidden="true" />
}

function GameButton({ number, view }) {
  const lit = view.lit.includes(number)
  const press = view.press?.button === number ? view.press : null
  const classes = ["rr-btn", press ? "is-pressed" : "", press && !press.ok ? "is-wrong" : ""]
  return (
    <div className="rr-btn-wrap" style={{ "--c": ARCADE_COLORS[number - 1].hex }}>
      <span className={`rr-led ${lit ? "is-lit" : ""}`} />
      <div key={press ? press.key : "still"} className={classes.join(" ")}>
        {press ? <span className="rr-ripple" /> : null}
      </div>
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

export default function LivePanel({ view, interactive = false, onStart }) {
  return (
    <div className={`rr-panel ${view.dim ? "rr-dim" : ""}`}>
      <div className="rr-top">
        <StartButton view={view} interactive={interactive} onPress={onStart} />
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
        <span className="rr-buzzer" aria-hidden="true" />
      </div>

      <div className="rr-grid" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <GameButton key={n} number={n} view={view} />
        ))}
      </div>

      {view.overlay ? (
        <div className="rr-overlay" aria-hidden="true">
          <span
            key={view.overlayKey}
            className={view.overlayTone ? `is-message is-${view.overlayTone}` : view.overlay.length > 3 ? "is-word" : undefined}
          >
            {view.overlay}
          </span>
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
