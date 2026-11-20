// frontend/src/adminAuth.js
// Keeps the admin password ONLY in sessionStorage: it disappears when the
// browser tab is closed, and it is removed on logout or on any 401.
// It is never put in localStorage, a cookie, or the URL.
//
// Every function takes the storage as a parameter (default: the browser's
// sessionStorage) so the unit tests can pass a fake one.

export const ADMIN_STORAGE_KEY = "rhythmRushAdminPassword"

function browserSessionStorage() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage
  } catch {
    // Some privacy settings throw on simply reading window.sessionStorage.
    return null
  }
}

export function loadAdminPassword(storage = browserSessionStorage()) {
  try {
    return storage?.getItem(ADMIN_STORAGE_KEY) || ""
  } catch {
    return ""
  }
}

// Returns false when the browser refused to store it (the page then keeps the
// password in memory only, for this page view).
export function saveAdminPassword(password, storage = browserSessionStorage()) {
  try {
    if (!storage) return false
    storage.setItem(ADMIN_STORAGE_KEY, password)
    return true
  } catch {
    return false
  }
}

// Plain-language text for an error thrown by the admin functions in api.js
// (error.status is the HTTP status, error.message the API's error code).
export function adminErrorMessage(error) {
  const status = error?.status

  if (status === 401) return "Wrong password."
  if (status === 429) return "Too many wrong passwords. Wait 15 minutes, then try again."
  if (status === 503) {
    return "The admin API is switched off on the server. Set a real ADMIN_PASSWORD in backend/.env and restart the server."
  }
  if (status === 404) return "That game or device no longer exists. The list will refresh."
  if (status === 400 && error.message === "confirm_required") {
    return "Deleting a real device's games needs a confirm value."
  }
  if (status === 400 && error.message === "invalid_nickname") {
    return "That nickname is not allowed."
  }
  if (status === 0) return error.message
  if (typeof status === "number") return `Something went wrong (HTTP ${status}).`
  return "Something went wrong."
}

export function clearAdminPassword(storage = browserSessionStorage()) {
  try {
    storage?.removeItem(ADMIN_STORAGE_KEY)
  } catch {
    // Nothing else to do: the page also forgets its in-memory copy.
  }
}
