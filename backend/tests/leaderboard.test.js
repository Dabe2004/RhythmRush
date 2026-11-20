// backend/tests/leaderboard.test.js
// Tests for GET /api/leaderboard.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// In-memory database before the app modules load.
process.env.DB_PATH = ":memory:";

const request = require("supertest");
const db = require("../src/db.js");
const app = require("../src/app.js");
const { runMigrations } = require("../../db/migrate.js");

// Insert a finished game without going through the upload endpoint.
function insertGame({
  session_id,
  final_score,
  highest_level_completed = 1,
  outcome = "game_over",
  nickname = null,
  received_at = "2026-01-01 00:00:00",
}) {
  db.prepare(`
    INSERT INTO game_sessions
      (session_id, device_id, outcome, final_score, highest_level_completed,
       final_sequence_length, successful_rounds, failed_attempts, duration_seconds,
       nickname, is_synthetic, received_at)
    VALUES (?, NULL, ?, ?, ?, 4, 1, 0, 10, ?, 0, ?)
  `).run(
    session_id,
    outcome,
    final_score,
    highest_level_completed,
    nickname,
    received_at
  );
}

function insertPrediction(session_id, skill_rank, animal, animal_iq) {
  db.prepare(`
    INSERT INTO ml_predictions
      (session_id, skill_rank, animal, animal_iq, matched_session_id, model_versions)
    VALUES (?, ?, ?, ?, 'SYN-000001', '{"skill":1,"animal":1,"difficulty":1}')
  `).run(session_id, skill_rank, animal, animal_iq);
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

describe("GET /api/leaderboard", () => {
  it("returns an empty list for an empty database", async () => {
    const res = await request(app).get("/api/leaderboard");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries: [] });
  });

  it("orders entries by final_score DESC", async () => {
    insertGame({ session_id: "A", final_score: 100 });
    insertGame({ session_id: "B", final_score: 300 });
    insertGame({ session_id: "C", final_score: 200 });

    const res = await request(app).get("/api/leaderboard");

    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.session_id)).toEqual(["B", "C", "A"]);
    expect(res.body.entries.map((e) => e.final_score)).toEqual([300, 200, 100]);
    expect(res.body.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("gives equal scores the same rank and skips the next one (1,2,2,4)", async () => {
    insertGame({ session_id: "A", final_score: 300, highest_level_completed: 3 });
    insertGame({ session_id: "B", final_score: 200, highest_level_completed: 2 });
    insertGame({ session_id: "C", final_score: 200, highest_level_completed: 2 });
    insertGame({ session_id: "D", final_score: 100, highest_level_completed: 1 });

    const res = await request(app).get("/api/leaderboard");

    expect(res.status).toBe(200);
    // RANK() only looks at the score, so two second places share rank 2
    // and the next entry is rank 4.
    expect(res.body.entries.map((e) => e.rank)).toEqual([1, 2, 2, 4]);
  });

  it("breaks score ties by level, then received_at, then session_id", async () => {
    insertGame({
      session_id: "OLD",
      final_score: 200,
      highest_level_completed: 2,
      received_at: "2026-01-01 00:00:00",
    });
    insertGame({
      session_id: "LOW",
      final_score: 200,
      highest_level_completed: 1,
      received_at: "2025-01-01 00:00:00",
    });
    insertGame({
      session_id: "NEW",
      final_score: 200,
      highest_level_completed: 2,
      received_at: "2026-02-01 00:00:00",
    });

    const res = await request(app).get("/api/leaderboard");

    // Level 2 before level 1, and inside level 2 the older upload first.
    expect(res.body.entries.map((e) => e.session_id)).toEqual([
      "OLD",
      "NEW",
      "LOW",
    ]);
    // All three still share rank 1: the rank only depends on the score.
    expect(res.body.entries.map((e) => e.rank)).toEqual([1, 1, 1]);
  });

  it("honours the limit parameter", async () => {
    insertGame({ session_id: "A", final_score: 300 });
    insertGame({ session_id: "B", final_score: 200 });
    insertGame({ session_id: "C", final_score: 100 });

    const res = await request(app).get("/api/leaderboard?limit=2");

    expect(res.status).toBe(200);
    expect(res.body.entries.map((e) => e.session_id)).toEqual(["A", "B"]);
    // The rank is computed before LIMIT, so the third game keeps its rank.
    expect(res.body.entries.map((e) => e.rank)).toEqual([1, 2]);
  });

  it("returns the full row, including prediction fields", async () => {
    insertGame({ session_id: "A", final_score: 500, nickname: "Alice" });
    insertPrediction("A", "Pro", "Chimpanzee", 95);

    const res = await request(app).get("/api/leaderboard");

    expect(res.body.entries[0]).toMatchObject({
      rank: 1,
      session_id: "A",
      nickname: "Alice",
      final_score: 500,
      highest_level_completed: 1,
      outcome: "game_over",
      skill_rank: "Pro",
      animal: "Chimpanzee",
      animal_iq: 95,
    });
    expect(typeof res.body.entries[0].received_at).toBe("string");
  });

  it("still lists games that have no prediction row", async () => {
    insertGame({ session_id: "NOPRED", final_score: 100 });
    insertGame({ session_id: "PRED", final_score: 200 });
    insertPrediction("PRED", "Beginner", "Pig", 55);

    const res = await request(app).get("/api/leaderboard");

    expect(res.body.entries).toHaveLength(2);
    const noPrediction = res.body.entries.find((e) => e.session_id === "NOPRED");
    expect(noPrediction.skill_rank).toBeNull();
    expect(noPrediction.animal).toBeNull();
    expect(noPrediction.animal_iq).toBeNull();
  });

  it("rejects limit=0 with 400", async () => {
    const res = await request(app).get("/api/leaderboard?limit=0");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_limit" });
  });

  it("rejects limit=101 with 400", async () => {
    const res = await request(app).get("/api/leaderboard?limit=101");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_limit" });
  });

  it("rejects limit=abc with 400", async () => {
    const res = await request(app).get("/api/leaderboard?limit=abc");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "invalid_limit" });
  });

  it("does not treat the SQL keyword as a limit", async () => {
    // Try to smuggle SQL through the parameter; it must be a plain number.
    const res = await request(app).get(
      "/api/leaderboard?limit=1%20UNION%20SELECT%20*%20FROM%20devices"
    );

    expect(res.status).toBe(400);
    // The table is still there.
    expect(() => db.prepare("SELECT COUNT(*) FROM game_sessions").get()).not.toThrow();
  });
});
