// frontend/src/api.js
// Tiny fetch wrapper for the Rhythm Rush backend.
//
// VITE_API_URL is empty by default, which means "same origin". In development
// the Vite proxy (vite.config.js) forwards /api to http://localhost:3000.

const BASE_URL = import.meta.env.VITE_API_URL || ""
const TIMEOUT_MS = 8000

// Make an Error with a numeric .status (0 = network/timeout).
function makeError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

async function request(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        // Only send a JSON content type when there is a body.
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    })

    const text = await response.text()
    let body = null

    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = null
      }
    }

    if (!response.ok) {
      // Prefer the backend's short error code (for example "not_found").
      const message =
        body && typeof body.error === "string"
          ? body.error
          : `Request failed (HTTP ${response.status})`
      throw makeError(message, response.status)
    }

    return body
  } catch (error) {
    // Our own HTTP errors already have a status: keep them as they are.
    if (typeof error.status === "number") throw error

    if (error.name === "AbortError") {
      throw makeError("The server took too long to answer. Please try again.", 0)
    }

    throw makeError("Cannot reach the server. Is the backend running?", 0)
  } finally {
    clearTimeout(timer)
  }
}

export function getLeaderboard(limit = 20) {
  return request(`/api/leaderboard?limit=${encodeURIComponent(limit)}`)
}

export function getLatestSession() {
  return request("/api/game-sessions/latest")
}

export function getSession(id) {
  return request(`/api/game-sessions/${encodeURIComponent(id)}`)
}

export function setNickname(id, nickname) {
  return request(`/api/game-sessions/${encodeURIComponent(id)}/nickname`, {
    method: "PATCH",
    body: JSON.stringify({ nickname }),
  })
}

// ---------------------------------------------------------------------------
// Admin API (Phase K). The password travels only in this header.
// ---------------------------------------------------------------------------
function adminRequest(password, path, options = {}) {
  return request(path, {
    ...options,
    headers: { "X-Admin-Password": password, ...options.headers },
  })
}

export function adminLogin(password) {
  return adminRequest(password, "/api/admin/login", { method: "POST" })
}

export function getAdminOverview(password) {
  return adminRequest(password, "/api/admin/overview")
}

export function getAdminModels(password) {
  return adminRequest(password, "/api/admin/models")
}

// nickname: a string to overwrite, or null to clear.
export function adminSetNickname(password, id, nickname) {
  return adminRequest(password, `/api/admin/game-sessions/${encodeURIComponent(id)}/nickname`, {
    method: "PATCH",
    body: JSON.stringify({ nickname }),
  })
}

export function adminDeleteSession(password, id) {
  return adminRequest(password, `/api/admin/game-sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}

// Every game of one device. Real devices also need confirm=<same id>.
export function adminDeleteDeviceGames(password, device, confirm) {
  const query = new URLSearchParams({ device })
  if (confirm) query.set("confirm", confirm)
  return adminRequest(password, `/api/admin/game-sessions?${query}`, { method: "DELETE" })
}
