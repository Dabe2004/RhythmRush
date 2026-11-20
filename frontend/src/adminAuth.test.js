// frontend/src/adminAuth.test.js
// The admin password lives ONLY in sessionStorage. Vitest runs in Node (no
// browser storage), so the tests pass a tiny fake storage object.

import { describe, expect, it } from "vitest"

import {
  ADMIN_STORAGE_KEY,
  adminErrorMessage,
  clearAdminPassword,
  loadAdminPassword,
  saveAdminPassword,
} from "./adminAuth"

function httpError(status, message = "x") {
  const error = new Error(message)
  error.status = status
  return error
}

describe("adminErrorMessage", () => {
  it("explains every admin API error in plain words", () => {
    expect(adminErrorMessage(httpError(401))).toBe("Wrong password.")
    expect(adminErrorMessage(httpError(429))).toMatch(/Too many wrong passwords/)
    expect(adminErrorMessage(httpError(503))).toMatch(/ADMIN_PASSWORD/)
    expect(adminErrorMessage(httpError(404))).toMatch(/no longer exists/)
    expect(adminErrorMessage(httpError(400, "confirm_required"))).toMatch(/confirm/)
    expect(adminErrorMessage(httpError(400, "invalid_nickname"))).toMatch(/nickname/i)
  })

  it("keeps the network message for status 0 and is generic otherwise", () => {
    expect(adminErrorMessage(httpError(0, "Cannot reach the server."))).toBe(
      "Cannot reach the server.",
    )
    expect(adminErrorMessage(httpError(500))).toMatch(/HTTP 500/)
    expect(adminErrorMessage(null)).toMatch(/went wrong/)
  })
})

function fakeStorage() {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  }
}

// Private browsing windows can throw on every storage call.
const brokenStorage = {
  getItem() {
    throw new Error("blocked")
  },
  setItem() {
    throw new Error("blocked")
  },
  removeItem() {
    throw new Error("blocked")
  },
}

describe("admin password storage", () => {
  it("saves, loads and clears the password", () => {
    const storage = fakeStorage()

    expect(loadAdminPassword(storage)).toBe("")
    saveAdminPassword("s3cret", storage)
    expect(storage.data.get(ADMIN_STORAGE_KEY)).toBe("s3cret")
    expect(loadAdminPassword(storage)).toBe("s3cret")

    clearAdminPassword(storage)
    expect(loadAdminPassword(storage)).toBe("")
  })

  it("never throws when storage is blocked", () => {
    expect(loadAdminPassword(brokenStorage)).toBe("")
    expect(saveAdminPassword("x", brokenStorage)).toBe(false)
    expect(() => clearAdminPassword(brokenStorage)).not.toThrow()
  })

  it("works without any storage at all", () => {
    expect(loadAdminPassword(null)).toBe("")
    expect(saveAdminPassword("x", null)).toBe(false)
  })
})
