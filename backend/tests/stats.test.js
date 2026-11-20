// backend/tests/stats.test.js
// Tests for GET /api/stats/summary

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// In-memory database before the app modules load.
process.env.DB_PATH = ":memory:";

const request = require("supertest");
const db = require("../src/db.js");
const app = require("../src/app.js");
const { runMigrations } = require("../../db/migrate.js");

function insertGame(sessionId, finalScore, outcome) {
  db.prepare(`
    INSERT INTO game_sessions
      (session_id, device_id, outcome, final_score, highest_level_completed,
       final_sequence_length, successful_rounds, failed_attempts, duration_seconds)
    VALUES (?, NULL, ?, ?, 1, 3, 1, 0, 10)
  `).run(sessionId, outcome, finalScore);
}

function insertPrediction(sessionId, skillRank, animal) {
  db.prepare(`
    INSERT INTO ml_predictions
      (session_id, skill_rank, animal, animal_iq, matched_session_id, model_versions)
    VALUES (?, ?, ?, 60, 'SYN-000001', '{"skill":1,"animal":1,"difficulty":1}')
  `).run(sessionId, skillRank, animal);
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

describe("GET /api/stats/summary", () => {
  // Four hand-made sessions:
  //   S1 score 0      game_over  Beginner      Pig
  //   S2 score 999    game_over  Beginner      Pig
  //   S3 score 1000   win        Intermediate  Elephant
  //   S4 score 12750  win        Pro           Chimpanzee
  //
  // Hand calculation:
  //   total_games   = 4
  //   average_score = (0 + 999 + 1000 + 12750) / 4 = 14749 / 4 = 3687.25
  //                   rounded to 1 decimal -> 3687.3
  //   max_score     = 12750
  //   wins          = 2 (S3, S4) -> win_rate = 2 / 4 = 0.5
  //   outcomes      = { game_over: 2, win: 2 }
  //   histogram     = 0 -> bin 0 (0-999)
  //                   999 -> bin 0 (0-999)
  //                   1000 -> bin 1 (1000-1999)
  //                   12750 -> bin 12 (12000-12999)
  //   skill_counts  = Beginner 2, Intermediate 1, Pro 1
  //   animal_counts = Pig 2, Elephant 1, Chimpanzee 1, rest 0
  beforeEach(() => {
    insertGame("S1", 0, "game_over");
    insertGame("S2", 999, "game_over");
    insertGame("S3", 1000, "win");
    insertGame("S4", 12750, "win");

    insertPrediction("S1", "Beginner", "Pig");
    insertPrediction("S2", "Beginner", "Pig");
    insertPrediction("S3", "Intermediate", "Elephant");
    insertPrediction("S4", "Pro", "Chimpanzee");
  });

  it("returns the hand-calculated numbers", async () => {
    const res = await request(app).get("/api/stats/summary");

    expect(res.status).toBe(200);
    expect(res.body.total_games).toBe(4);
    expect(res.body.average_score).toBe(3687.3);
    expect(res.body.max_score).toBe(12750);
    expect(res.body.win_rate).toBe(0.5);
    expect(res.body.outcomes).toEqual({ game_over: 2, win: 2 });
  });

  it("has 13 histogram bins of 1000 points", async () => {
    const res = await request(app).get("/api/stats/summary");
    const histogram = res.body.score_histogram;

    expect(histogram).toHaveLength(13);
    expect(histogram[0]).toEqual({ min: 0, max: 999, count: 2 });
    expect(histogram[1]).toEqual({ min: 1000, max: 1999, count: 1 });
    expect(histogram[12]).toEqual({ min: 12000, max: 12999, count: 1 });

    // Every bin between them is present and empty.
    for (let index = 2; index <= 11; index += 1) {
      expect(histogram[index].count).toBe(0);
    }

    // The histogram accounts for every game.
    const total = histogram.reduce((sum, bin) => sum + bin.count, 0);
    expect(total).toBe(4);
  });

  it("counts skills and animals, including zero categories", async () => {
    const res = await request(app).get("/api/stats/summary");

    expect(res.body.skill_counts).toEqual({
      Beginner: 2,
      Intermediate: 1,
      Pro: 1,
    });

    expect(res.body.animal_counts).toEqual({
      Chimpanzee: 1,
      "Bottlenose Dolphin": 0,
      Elephant: 1,
      Orangutan: 0,
      Pig: 2,
    });
  });

  it("survives an empty database", async () => {
    db.exec(`
      DELETE FROM ml_predictions;
      DELETE FROM level_attempts;
      DELETE FROM session_features;
      DELETE FROM game_sessions;
    `);

    const res = await request(app).get("/api/stats/summary");

    expect(res.status).toBe(200);
    expect(res.body.total_games).toBe(0);
    expect(res.body.average_score).toBeNull();
    expect(res.body.max_score).toBeNull();
    expect(res.body.win_rate).toBeNull();
    expect(res.body.outcomes).toEqual({ game_over: 0, win: 0 });

    expect(res.body.score_histogram).toHaveLength(13);
    expect(res.body.score_histogram.every((bin) => bin.count === 0)).toBe(true);

    expect(res.body.skill_counts).toEqual({
      Beginner: 0,
      Intermediate: 0,
      Pro: 0,
    });
    expect(res.body.animal_counts).toEqual({
      Chimpanzee: 0,
      "Bottlenose Dolphin": 0,
      Elephant: 0,
      Orangutan: 0,
      Pig: 0,
    });
  });

  it("rounds a .05 average up to one decimal", async () => {
    db.exec("DELETE FROM game_sessions");
    insertGame("R1", 1, "win");
    insertGame("R2", 2, "win");
    // (1 + 2) / 2 = 1.5 -> stays 1.5
    let res = await request(app).get("/api/stats/summary");
    expect(res.body.average_score).toBe(1.5);

    db.exec("DELETE FROM game_sessions");
    insertGame("R1", 1, "win");
    insertGame("R2", 2, "win");
    insertGame("R3", 2, "win");
    // (1 + 2 + 2) / 3 = 1.666... -> 1.7
    res = await request(app).get("/api/stats/summary");
    expect(res.body.average_score).toBe(1.7);
  });
});
