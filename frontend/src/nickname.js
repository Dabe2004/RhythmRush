// frontend/src/nickname.js
// Client-side copy of the nickname rule used by the API:
// trim, then 1-16 characters from letters, numbers, spaces, - and _.
//
// Keeping it in a pure function makes it easy to test and keeps the React
// component focused on the form.

const ALLOWED = /^[A-Za-z0-9 _-]+$/

export function validateNickname(text) {
  const value = typeof text === "string" ? text.trim() : ""

  if (value.length === 0) {
    return { ok: false, value, message: "Enter a nickname." }
  }

  if (value.length > 16) {
    return {
      ok: false,
      value,
      message: "Use 16 characters or fewer.",
    }
  }

  if (!ALLOWED.test(value)) {
    return {
      ok: false,
      value,
      message: "Use only letters, numbers, spaces, - or _.",
    }
  }

  return { ok: true, value, message: "" }
}

// What the player sees when PATCH /api/game-sessions/:id/nickname fails.
// status is the HTTP status from api.js (0 = network error or timeout).
export function nicknameErrorMessage(status) {
  if (status === 409) return "This game already has a nickname."
  if (status === 400) {
    return "That nickname isn't allowed. Use letters, numbers, spaces, - or _."
  }
  if (status === 429) return "Too many tries. Wait a minute."
  return "Could not save. Try again."
}
