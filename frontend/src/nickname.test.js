// frontend/src/nickname.test.js
// Unit tests for the client-side nickname rule.

import { describe, expect, it } from "vitest"

import { nicknameErrorMessage, validateNickname } from "./nickname"

describe("nicknameErrorMessage", () => {
  it("maps every API status to a short player-friendly message", () => {
    expect(nicknameErrorMessage(409)).toBe("This game already has a nickname.")
    expect(nicknameErrorMessage(400)).toBe(
      "That nickname isn't allowed. Use letters, numbers, spaces, - or _.",
    )
    expect(nicknameErrorMessage(429)).toBe("Too many tries. Wait a minute.")
  })

  it("uses one generic message for anything else", () => {
    for (const status of [0, 404, 500, 503, undefined]) {
      expect(nicknameErrorMessage(status)).toBe("Could not save. Try again.")
    }
  })
})

describe("validateNickname with odd input", () => {
  it("treats null, undefined and numbers as empty", () => {
    for (const input of [null, undefined, 42]) {
      expect(validateNickname(input).ok).toBe(false)
      expect(validateNickname(input).value).toBe("")
    }
  })
})

describe("validateNickname", () => {
  it("rejects an empty string", () => {
    const result = validateNickname("")

    expect(result.ok).toBe(false)
    expect(result.value).toBe("")
    expect(result.message).toBeTruthy()
  })

  it("rejects spaces only", () => {
    const result = validateNickname("     ")

    expect(result.ok).toBe(false)
    expect(result.value).toBe("")
  })

  it("rejects 17 characters", () => {
    const result = validateNickname("a".repeat(17))

    expect(result.ok).toBe(false)
    expect(result.value).toHaveLength(17)
  })

  it("accepts exactly 16 characters", () => {
    const name = "a".repeat(16)
    const result = validateNickname(name)

    expect(result.ok).toBe(true)
    expect(result.value).toBe(name)
  })

  it("rejects HTML", () => {
    const result = validateNickname("<script>")

    expect(result.ok).toBe(false)
    expect(result.value).toBe("<script>")
  })

  it("rejects SQL injection text", () => {
    const result = validateNickname("'; DROP TABLE x;--")

    expect(result.ok).toBe(false)
  })

  it("rejects unicode letters", () => {
    // The API only allows ASCII letters, so this is rejected on purpose.
    expect(validateNickname("José").ok).toBe(false)
    expect(validateNickname("Ünicode").ok).toBe(false)
  })

  it("accepts a name with letters, numbers, dash and underscore", () => {
    const result = validateNickname("Ana_Maria-2")

    expect(result.ok).toBe(true)
    expect(result.value).toBe("Ana_Maria-2")
    expect(result.message).toBe("")
  })

  it("trims leading and trailing spaces", () => {
    const result = validateNickname("  Ana Maria  ")

    expect(result.ok).toBe(true)
    expect(result.value).toBe("Ana Maria")
  })
})
