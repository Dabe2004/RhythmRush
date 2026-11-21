// backend/tests/nickname.test.js
// Tests for PATCH /api/game-sessions/:id/nickname

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// In-memory database before the app modules load.
process.env.DB_PATH = ":memory:";

const request = require("supertest");
const db = require("../src/db.js");
const app = require("../src/app.js");
const { runMigrations } = require("../../db/migrate.js");

function insertGame(sessionId, nickname = null) {
  db.prepare(`
    INSERT INTO game_sessions
      (session_id, device_id, outcome, final_score, highest_level_completed,
       final_sequence_length, successful_rounds, failed_attempts, duration_seconds, nickname)
    VALUES (?, NULL, 'game_over', 100, 1, 3, 1, 0, 10, ?)
  `).run(sessionId, nickname);
}

function patchNickname(target, sessionId, nickname) {
  return request(target)
    .patch(`/api/game-sessions/${sessionId}/nickname`)
    .send({ nickname });
}

beforeAll(() => {
  runMigrations(db);
});

beforeEach(() => {
  db.exec(`
    DELETE FROM ml_predictions;
    DELETE FROM level_attempts;
    DELETE FROM session_features;
    DELETE FROM game_sessions;
  `);
});

describe("PATCH /api/game-sessions/:id/nickname", () => {
  it("sets a nickname", async () => {
    insertGame("RR01-000001");

    const res = await patchNickname(app, "RR01-000001", "Alice");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: true, nickname: "Alice" });

    const row = db
      .prepare("SELECT nickname FROM game_sessions WHERE session_id = ?")
      .get("RR01-000001");
    expect(row.nickname).toBe("Alice");
  });

  it("trims spaces before saving", async () => {
    insertGame("RR01-000002");

    const res = await patchNickname(app, "RR01-000002", "  Bob  ");

    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe("Bob");
  });

  it("refuses a second nickname with 409", async () => {
    insertGame("RR01-000003");

    const first = await patchNickname(app, "RR01-000003", "Alice");
    const second = await patchNickname(app, "RR01-000003", "Mallory");

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: "nickname_already_set" });

    // The first name is kept.
    const row = db
      .prepare("SELECT nickname FROM game_sessions WHERE session_id = ?")
      .get("RR01-000003");
    expect(row.nickname).toBe("Alice");
  });

  it("rejects a nickname longer than 16 characters", async () => {
    insertGame("RR01-000004");

    const res = await patchNickname(app, "RR01-000004", "ABCDEFGHIJKLMNOPQ");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_nickname" });
  });

  it("rejects an empty nickname", async () => {
    insertGame("RR01-000005");

    const res = await patchNickname(app, "RR01-000005", "   ");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_nickname" });
  });

  it("rejects symbols", async () => {
    insertGame("RR01-000006");

    const res = await patchNickname(app, "RR01-000006", "bad!name");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_nickname" });
  });

  it("allows letters, numbers, spaces, dashes and underscores", async () => {
    insertGame("RR01-000007");

    const res = await patchNickname(app, "RR01-000007", "Player_1 - Red");

    expect(res.status).toBe(200);
    expect(res.body.nickname).toBe("Player_1 - Red");
  });

  it("returns 404 for an unknown session", async () => {
    const res = await patchNickname(app, "NOPE-000000", "Alice");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("rejects an SQL injection attempt and leaves the table intact", async () => {
    insertGame("RR01-000008");
    const attack = "'; DROP TABLE game_sessions;--";

    const res = await patchNickname(app, "RR01-000008", attack);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_nickname" });

    // The table still exists and the row is unchanged.
    const row = db
      .prepare("SELECT COUNT(*) AS c FROM game_sessions")
      .get();
    expect(row.c).toBe(1);
  });

  it("answers 429 once the rate limit is exceeded", async () => {
    // A separate app instance with a limit of 2 per minute.
    const limitedApp = app.createApp({
      nicknameRateLimit: { limit: 2, windowMs: 60 * 1000 },
    });

    insertGame("RR01-000009");

    const first = await patchNickname(limitedApp, "RR01-000009", "Alice");
    const second = await patchNickname(limitedApp, "RR01-000009", "Bob");
    const third = await patchNickname(limitedApp, "RR01-000009", "Carol");

    expect(first.status).toBe(200);
    expect(second.status).toBe(409); // already set, but still inside the limit
    expect(third.status).toBe(429);
    expect(third.body).toEqual({ error: "too_many_requests" });
  });

  it("rate limits per app instance, not across the whole process", async () => {
    // The default app allows 30/minute, so it still answers after the
    // limited app above has used up its own counter.
    insertGame("RR01-000010");

    const res = await patchNickname(app, "RR01-000010", "Dave");

    expect(res.status).toBe(200);
  });
});

describe("nickname blocklist (backend/blocklist.txt)", () => {
  const fs = require("node:fs");
  const { BLOCKLIST_FILE, parseBlocklist, isBlockedNickname } = require("../src/services/nickname.js");
  const words = parseBlocklist(fs.readFileSync(BLOCKLIST_FILE, "utf8"));

  it("refuses a blocked word with the usual 400 and saves nothing", async () => {
    insertGame("RR01-000010");

    const res = await patchNickname(app, "RR01-000010", "Big Fucker");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_nickname" });
    const row = db.prepare("SELECT nickname FROM game_sessions WHERE session_id = ?").get("RR01-000010");
    expect(row.nickname).toBeNull();
  });

  it("sees through case, separators, digit swaps and repeated letters", () => {
    for (const name of ["SHIT", "f-u-c-k", "F_U_C_K", "p u t a", "Fuuuuck", "5h1t", "b0b0", "4ss", "Mother_Fucker", "PutangIna Mo", "G4G0 ka", "B1g F-u-c-k", "my a s s"]) {
      expect(isBlockedNickname(name, words), name).toBe(true);
    }
  });

  it("lets innocent words that merely contain the letters through", async () => {
    for (const name of ["Class", "Bass Player", "Grass", "Assassin", "Peacock", "Grape", "Scunthorpe", "Shitake", "Petite", "Potato", "Cocktail"]) {
      expect(isBlockedNickname(name, words), name).toBe(false);
    }

    insertGame("RR01-000011");
    const res = await patchNickname(app, "RR01-000011", "Class Act");
    expect(res.status).toBe(200);
  });
});
