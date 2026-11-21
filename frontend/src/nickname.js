// frontend/src/nickname.js
// Client-side copy of the nickname rule used by the API:
// trim, then 1-16 characters from letters, numbers, spaces, - and _.
//
// Keeping it in a pure function makes it easy to test and keeps the React
// component focused on the form.

import { visitorText } from "./content/visitorText"

const T = visitorText.nickname

const ALLOWED = /^[A-Za-z0-9 _-]+$/

export function validateNickname(text) {
  const value = typeof text === "string" ? text.trim() : ""

  if (value.length === 0) {
    return { ok: false, value, message: T.empty }
  }

  if (value.length > 16) {
    return {
      ok: false,
      value,
      message: T.tooLong,
    }
  }

  if (!ALLOWED.test(value)) {
    return {
      ok: false,
      value,
      message: T.badCharacters,
    }
  }

  return { ok: true, value, message: "" }
}

// What the player sees when PATCH /api/game-sessions/:id/nickname fails.
// status is the HTTP status from api.js (0 = network error or timeout).
export function nicknameErrorMessage(status) {
  if (status === 409) return T.taken
  if (status === 400) {
    return T.notAllowed
  }
  if (status === 429) return T.tooMany
  return T.failed
}
