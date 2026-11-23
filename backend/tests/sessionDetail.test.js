// backend/tests/sessionDetail.test.js
// Tests for GET /api/game-sessions/:id

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const TEST_DEVICE_ID = "RR01";
const TEST_API_KEY = "test-rr01-key-0001";

process.env.DB_PATH = ":memory:";
process.env.DEVICE_API_KEY = TEST_API_KEY;

const crypto = require("node:crypto");
const request = require("supertest");

const db = require("../src/db.js");
const app = require("../src/app.js");
const { runMigrations } = require("../../db/migrate.js");

// The AGENTS.md example record.
function exampleRecord() {
  return {
    session_id: "RR01-000127",
    device_id: "RR01",
    outcome: "game_over",
    final_score: 127,
    highest_level_completed: 1,
    final_sequence_length: 4,
    successful_rounds: 1,
    failed_attempts: 3,
    duration_seconds: 42,
    attempts: [
      { level: 1, result: "pass", response_ms: 4100 },
      { level: 2, result: "wrong", response_ms: 2100 },
      { level: 2, result: "timeout", response_ms: 0 },
    ],
  };
}

beforeAll(() => {
  runMigrations(db);

  const hash = crypto.createHash("sha256").update(TEST_API_KEY).digest("hex");
  db.prepare(
    "INSERT INTO devices (device_id, name, api_key_hash) VALUES (?, ?, ?)"
  ).run(TEST_DEVICE_ID, "Test device", hash);
});

beforeEach(() => {
  db.exec(`
    DELETE FROM ml_predictions;
    DELETE FROM level_attempts;
    DELETE FROM session_features;
    DELETE FROM game_sessions;
  `);
});

describe("GET /api/game-sessions/:id", () => {
  it("returns the full detail of an uploaded session", async () => {
    const upload = await request(app)
      .post("/api/game-sessions")
      .set("X-API-Key", TEST_API_KEY)
      .send(exampleRecord());

    expect(upload.status).toBe(201);

    const res = await request(app).get("/api/game-sessions/RR01-000127");

    expect(res.status).toBe(200);

    // All game_sessions columns.
    expect(res.body.session).toMatchObject({
      session_id: "RR01-000127",
      device_id: "RR01",
      outcome: "game_over",
      final_score: 127,
      highest_level_completed: 1,
      final_sequence_length: 4,
      successful_rounds: 1,
      failed_attempts: 3,
      duration_seconds: 42,
      nickname: null,
      is_synthetic: 0,
    });
    expect(typeof res.body.session.received_at).toBe("string");

    // Attempts in attempt_no order.
    expect(res.body.attempts).toHaveLength(3);
    expect(res.body.attempts.map((a) => a.attempt_no)).toEqual([1, 2, 3]);
    expect(res.body.attempts.map((a) => a.result)).toEqual([
      "pass",
      "wrong",
      "timeout",
    ]);

    // Features from Phase F/G.
    expect(res.body.features).toMatchObject({
      session_id: "RR01-000127",
      highest_sequence_length: 4,
      final_score: 127,
    });
    expect(res.body.features.avg_reaction_sec).toBeCloseTo(4.1 / 3, 12);
    expect(res.body.features.success_rate).toBeCloseTo(0.25, 12);

    // Prediction with model_versions parsed back into an object.
    expect(res.body.prediction.skill_rank).toMatch(/^(Beginner|Intermediate|Pro)$/);
    expect(typeof res.body.prediction.animal).toBe("string");
    expect(typeof res.body.prediction.animal_iq).toBe("number");
    expect(typeof res.body.prediction.matched_session_id).toBe("string");
    expect(res.body.prediction.model_versions).toEqual({
      skill: 1,
      animal: 1,
      difficulty: 1,
    });
  });

  it("returns null features and null prediction when they are missing", async () => {
    // Insert a bare session row, like an old upload.
    db.prepare(`
      INSERT INTO game_sessions
        (session_id, device_id, outcome, final_score, highest_level_completed,
         final_sequence_length, successful_rounds, failed_attempts, duration_seconds)
      VALUES ('BARE', NULL, 'game_over', 10, 1, 3, 1, 0, 5)
    `).run();

    const res = await request(app).get("/api/game-sessions/BARE");

    expect(res.status).toBe(200);
    expect(res.body.attempts).toEqual([]);
    expect(res.body.features).toBeNull();
    expect(res.body.prediction).toBeNull();
  });

  it("returns 404 for an unknown session id", async () => {
    const res = await request(app).get("/api/game-sessions/NOPE-000000");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("does not treat the id as SQL", async () => {
    const res = await request(app).get(
      "/api/game-sessions/1%27%20OR%20%271%27%3D%271"
    );

    expect(res.status).toBe(404);
    expect(() => db.prepare("SELECT COUNT(*) FROM game_sessions").get()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GET /api/game-sessions/latest
// ---------------------------------------------------------------------------
// Inserts a bare session row with a fixed timestamp, so the order is explicit.
function insertSessionRow({ sessionId, receivedAt, nickname = null, score = 100 }) {
  db.prepare(`
    INSERT INTO game_sessions
      (session_id, device_id, outcome, final_score, highest_level_completed,
       final_sequence_length, successful_rounds, failed_attempts, duration_seconds,
       nickname, received_at)
    VALUES (?, NULL, 'game_over', ?, 1, 3, 1, 0, 5, ?, ?)
  `).run(sessionId, score, nickname, receivedAt);
}

describe("GET /api/game-sessions/latest", () => {
  it("returns {session:null} on an empty database", async () => {
    const res = await request(app).get("/api/game-sessions/latest");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ session: null });
  });

  it("returns the newest session by received_at", async () => {
    insertSessionRow({
      sessionId: "OLD",
      receivedAt: "2026-01-01 00:00:00",
      score: 100,
    });
    insertSessionRow({
      sessionId: "NEW",
      receivedAt: "2026-02-01 12:30:00",
      nickname: "Alice",
      score: 900,
    });

    const res = await request(app).get("/api/game-sessions/latest");

    expect(res.status).toBe(200);
    expect(res.body.session).toEqual({
      session_id: "NEW",
      nickname: "Alice",
      player_number: null, // inserted by hand here; uploads get a number
      final_score: 900,
      highest_level_completed: 1,
      outcome: "game_over",
      received_at: "2026-02-01 12:30:00",
    });
  });

  it("uses rowid DESC when two sessions share a timestamp", async () => {
    // CURRENT_TIMESTAMP has one-second precision, so this happens in practice.
    insertSessionRow({ sessionId: "FIRST", receivedAt: "2026-03-01 10:00:00" });
    insertSessionRow({ sessionId: "SECOND", receivedAt: "2026-03-01 10:00:00" });

    const res = await request(app).get("/api/game-sessions/latest");

    expect(res.status).toBe(200);
    expect(res.body.session.session_id).toBe("SECOND");
  });

  it("is not shadowed by the /:id route", async () => {
    insertSessionRow({ sessionId: "ONLY", receivedAt: "2026-04-01 00:00:00" });

    const res = await request(app).get("/api/game-sessions/latest");

    // A shadowed route would answer 404 {"error":"not_found"} here.
    expect(res.status).toBe(200);
    expect(res.body.session.session_id).toBe("ONLY");
    expect(res.body.error).toBeUndefined();
  });
});
