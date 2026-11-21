// frontend/src/components/NicknameForm.jsx
// "Add your nickname" form on the result screen.
//
// - client-side check with validateNickname (same rule as the API)
// - one request at a time (no double submit, even with a fast double click)
// - API errors are turned into short messages by nicknameErrorMessage
//
// Callbacks (all optional):
//   onActivity() - the player focused the input or typed (kiosk pauses)
//   onIdle()     - the input lost focus (kiosk resumes)
//   onSkip()     - Skip button
//   onSaved(name)

import { useRef, useState } from "react"

import { setNickname } from "../api"
import { nicknameErrorMessage, validateNickname } from "../nickname"

export default function NicknameForm({
  sessionId,
  onActivity,
  onIdle,
  onSkip,
  onSaved,
}) {
  const [text, setText] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [savedName, setSavedName] = useState(null)

  // A ref updates immediately, a state update only on the next render, so the
  // ref is what really blocks a second click.
  const savingRef = useRef(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (savingRef.current) return

    const check = validateNickname(text)
    if (!check.ok) {
      setMessage(check.message)
      return
    }

    savingRef.current = true
    setSaving(true)
    setMessage("")

    try {
      const response = await setNickname(sessionId, check.value)
      const name = response?.nickname ?? check.value
      setSavedName(name)
      onSaved?.(name)
    } catch (error) {
      setMessage(nicknameErrorMessage(error.status))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (savedName) {
    return (
      <p
        role="status"
        className="mt-8 inline-block -rotate-2 border-4 border-double border-ok bg-ticket px-6 py-4 font-sign text-2xl text-ok sm:text-3xl"
      >
        Saved! You are {savedName}
      </p>
    )
  }

  // "Sign the guest book": a dashed paper field with big tap targets.
  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mt-8 rounded-[6px] border-[3px] border-dashed border-ink bg-ticket px-5 pb-3 pt-5 sm:px-6"
    >
      <label htmlFor="nickname-input" className="block font-sign text-2xl text-tent sm:text-3xl">
        Sign the guest book
      </label>
      <p id="nickname-help" className="mt-1 text-base sm:text-lg">
        Put your name on the leaderboard: up to 16 letters, numbers, spaces, - or _.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          id="nickname-input"
          type="text"
          value={text}
          maxLength={16}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="Your nickname"
          aria-describedby="nickname-help nickname-message"
          disabled={saving}
          onFocus={() => onActivity?.()}
          onBlur={() => onIdle?.()}
          onChange={(event) => {
            setText(event.target.value)
            setMessage("")
            onActivity?.()
          }}
          className="min-h-[56px] min-w-0 flex-1 rounded-[4px] border-[3px] border-ink bg-cream px-4 text-2xl font-extrabold text-ink placeholder:font-normal placeholder:text-muted disabled:opacity-60"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="sign min-h-[56px] flex-1 bg-tent px-7 text-xl text-cream transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-wait disabled:opacity-60 sm:flex-none"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSkip?.()}
            className="sign min-h-[56px] flex-1 bg-ticket px-6 text-xl text-ink transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-60 sm:flex-none"
          >
            Skip
          </button>
        </div>
      </div>

      <p
        id="nickname-message"
        role="alert"
        className="mt-2 min-h-[2rem] text-lg font-extrabold text-danger"
      >
        {message}
      </p>
    </form>
  )
}
