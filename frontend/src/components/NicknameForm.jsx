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
        className="rounded-2xl border border-green-400/40 bg-green-500/10 px-6 py-5 text-center text-2xl font-bold text-green-200 sm:text-3xl"
      >
        Saved! You are {savedName}
      </p>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 sm:p-6"
    >
      <label
        htmlFor="nickname-input"
        className="block text-xl font-bold text-white sm:text-2xl"
      >
        Add your nickname to the leaderboard
      </label>

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
          className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-2xl text-white placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 disabled:opacity-60"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-indigo-500 px-6 py-3 text-xl font-bold text-white transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 disabled:cursor-wait disabled:opacity-60 sm:flex-none"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSkip?.()}
            className="flex-1 rounded-xl border border-slate-600 px-6 py-3 text-xl font-semibold text-slate-300 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-60 sm:flex-none"
          >
            Skip
          </button>
        </div>
      </div>

      <p id="nickname-help" className="mt-3 text-base text-slate-400">
        Up to 16 letters, numbers, spaces, - or _.
      </p>
      <p
        id="nickname-message"
        role="alert"
        className="mt-2 min-h-[1.75rem] text-lg font-semibold text-red-300"
      >
        {message}
      </p>
    </form>
  )
}
