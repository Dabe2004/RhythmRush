// backend/tests/gameSessions.test.js
// vitest + supertest tests for POST /api/game-sessions.
//
// IMPORTANT: DB_PATH must be ":memory:" BEFORE src/db.js is loaded, otherwise
// the tests would write to the real data/rhythm.db file.
//
// Vitest cannot be require()d from CommonJS, so this file is ESM. The app
// modules are loaded with dynamic import() AFTER the env vars are set,
// because normal imports would run before them.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "node:module";

// The backend source files are CommonJS. Loading them with Node's own require
// (instead of a Vite import) guarantees ONE shared module cache, so the route
// handler and this test really use the same db instance.
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Environment first, app modules after.
// ---------------------------------------------------------------------------
const TEST_DEVICE_ID = "RR01";
const TEST_API_KEY = "test-rr01-key-0001";

process.env.DB_PATH = ":memory:";
process.env.DEVICE_API_KEY = TEST_API_KEY;

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const request = require("supertest");

const db = require("../src/db.js");
const app = require("../src/app.js");
const { runMigrations } = require("../../db/migrate.js");
const { insertSession } = require("../src/services/sessions.js");
const ml = require("../src/services/ml.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function countRows(sql, ...params) {
  return db.prepare(sql).get(...params).c;
}

function counts() {
  return {
    sessions: countRows("SELECT COUNT(*) c FROM game_sessions"),
    attempts: countRows("SELECT COUNT(*) c FROM level_attempts"),
    features: countRows("SELECT COUNT(*) c FROM session_features"),
    predictions: countRows("SELECT COUNT(*) c FROM ml_predictions"),
  };
}

function postSession(body, apiKey = TEST_API_KEY) {
  const req = request(app).post("/api/game-sessions").send(body);
  if (apiKey !== null) req.set("X-API-Key", apiKey);
  return req;
}

// The exact record published in AGENTS.md and docs/session.schema.json.
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

// ---------------------------------------------------------------------------
// Setup: migrate the in-memory database and add the test device.
// ---------------------------------------------------------------------------
beforeAll(() => {
  runMigrations(db);

  const hash = crypto.createHash("sha256").update(TEST_API_KEY).digest("hex");
  db.prepare(
    "INSERT INTO devices (device_id, name, api_key_hash) VALUES (?, ?, ?)"
  ).run(TEST_DEVICE_ID, "Test device", hash);
});

// Every test starts from empty session tables and a device that never connected.
beforeEach(() => {
  db.exec(`
    DELETE FROM level_attempts;
    DELETE FROM session_features;
    DELETE FROM ml_predictions;
    DELETE FROM game_sessions;
  `);
  db.prepare("UPDATE devices SET last_seen_at = NULL WHERE device_id = ?").run(
    TEST_DEVICE_ID
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("GET /api/health", () => {
  it("returns 200 with {ok:true}", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe("POST /api/game-sessions", () => {
  it("saves a valid upload and writes one row in each table", async () => {
    const res = await postSession(exampleRecord());

    expect(res.status).toBe(201);
    expect(res.body.saved).toBe(true);

    // Phase G: the upload also returns the ML prediction.
    expect(typeof res.body.skill_rank).toBe("string");
    expect(typeof res.body.animal).toBe("string");
    expect(typeof res.body.animal_iq).toBe("number");

    expect(counts()).toEqual({ sessions: 1, attempts: 3, features: 1, predictions: 1 });
  });

  it("numbers attempts 1..N in the order sent", async () => {
    await postSession(exampleRecord());

    const rows = db
      .prepare(
        "SELECT attempt_no, level, result FROM level_attempts ORDER BY attempt_no"
      )
      .all();

    expect(rows).toEqual([
      { attempt_no: 1, level: 1, result: "pass" },
      { attempt_no: 2, level: 2, result: "wrong" },
      { attempt_no: 3, level: 2, result: "timeout" },
    ]);
  });

  it("is idempotent: the same record twice saves once", async () => {
    const first = await postSession(exampleRecord());
    const second = await postSession(exampleRecord());

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    // The retry repeats the prediction saved on the first upload.
    expect(second.body.skill_rank).toBe(first.body.skill_rank);
    expect(second.body.animal).toBe(first.body.animal);
    expect(second.body.animal_iq).toBe(first.body.animal_iq);

    // Still exactly one of everything, including the prediction.
    expect(counts()).toEqual({ sessions: 1, attempts: 3, features: 1, predictions: 1 });
  });

  it("computes the AGENTS.md example features correctly", async () => {
    await postSession(exampleRecord());

    const features = db
      .prepare("SELECT * FROM session_features WHERE session_id = ?")
      .get("RR01-000127");

    // Hand calculation for the AGENTS.md example record.
    //
    // Pass attempts: only one -> level 1, response_ms = 4100.
    //   sequence length = level + 2 = 1 + 2 = 3
    //   value = (4100 / 1000) / 3 = 4.1 / 3 = 1.3666666666666667
    //   avg_reaction_sec = 1.3666666666666667 (average of one value)
    //
    // success_rate = successful_rounds / (successful_rounds + failed_attempts)
    //              = 1 / (1 + 3) = 1 / 4 = 0.25
    //
    // highest_sequence_length = final_sequence_length = 4
    // final_score = 127 (copied)
    expect(features.avg_reaction_sec).toBeCloseTo(4.1 / 3, 12);
    expect(features.success_rate).toBeCloseTo(0.25, 12);
    expect(features.highest_sequence_length).toBe(4);
    expect(features.final_score).toBe(127);
  });

  it("uses avg_reaction_sec = 3.0 when there are no pass attempts", async () => {
    const record = exampleRecord();
    record.session_id = "RR01-000200";
    record.final_score = 0;
    record.successful_rounds = 0;
    record.failed_attempts = 2;
    record.attempts = [
      { level: 1, result: "wrong", response_ms: 900 },
      { level: 1, result: "timeout", response_ms: 0 },
    ];

    const res = await postSession(record);
    expect(res.status).toBe(201);

    const features = db
      .prepare("SELECT * FROM session_features WHERE session_id = ?")
      .get("RR01-000200");

    expect(features.avg_reaction_sec).toBe(3.0);
    expect(features.success_rate).toBe(0);
  });

  it("rejects a body with a missing field", async () => {
    const record = exampleRecord();
    delete record.final_score;

    const res = await postSession(record);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
    expect(Array.isArray(res.body.details)).toBe(true);
    expect(res.body.details.length).toBeGreaterThan(0);
    expect(counts().sessions).toBe(0);
  });

  it("rejects an unknown outcome", async () => {
    const record = exampleRecord();
    record.outcome = "quit";

    const res = await postSession(record);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
  });

  it("rejects level 16", async () => {
    const record = exampleRecord();
    record.attempts[0].level = 16;

    const res = await postSession(record);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
  });

  it("rejects a negative response_ms", async () => {
    const record = exampleRecord();
    record.attempts[0].response_ms = -1;

    const res = await postSession(record);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
  });

  it("rejects a bad API key with 401", async () => {
    const res = await postSession(exampleRecord(), "wrong-key");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
    expect(counts().sessions).toBe(0);
  });

  it("rejects a missing API key with 401", async () => {
    const res = await postSession(exampleRecord(), null);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("rejects a device_id that does not belong to the key", async () => {
    const record = exampleRecord();
    record.device_id = "RR02";

    const res = await postSession(record);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "device_mismatch" });
    expect(counts().sessions).toBe(0);
  });

  it("updates devices.last_seen_at after a successful upload", async () => {
    const before = db
      .prepare("SELECT last_seen_at FROM devices WHERE device_id = ?")
      .get(TEST_DEVICE_ID);
    expect(before.last_seen_at).toBeNull();

    const res = await postSession(exampleRecord());
    expect(res.status).toBe(201);

    const after = db
      .prepare("SELECT last_seen_at FROM devices WHERE device_id = ?")
      .get(TEST_DEVICE_ID);
    expect(after.last_seen_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("does not touch last_seen_at for a duplicate upload", async () => {
    await postSession(exampleRecord());
    db.prepare("UPDATE devices SET last_seen_at = NULL WHERE device_id = ?").run(
      TEST_DEVICE_ID
    );

    const res = await postSession(exampleRecord());
    expect(res.body.duplicate).toBe(true);

    const row = db
      .prepare("SELECT last_seen_at FROM devices WHERE device_id = ?")
      .get(TEST_DEVICE_ID);
    expect(row.last_seen_at).toBeNull();
  });
  it("stores exactly one prediction row, even when uploaded twice", async () => {
    await postSession(exampleRecord());
    await postSession(exampleRecord());

    const rows = db.prepare("SELECT * FROM ml_predictions").all();

    expect(rows).toHaveLength(1);
    expect(rows[0].session_id).toBe("RR01-000127");
    // Model versions are stored as JSON text.
    expect(rows[0].model_versions).toBe(
      JSON.stringify({ skill: 1, animal: 1, difficulty: 1 })
    );
    // Matched against a synthetic reference row.
    expect(rows[0].matched_session_id).toMatch(/^SYN-/);
  });

  it("still saves the game when the ML artifacts are missing", async () => {
    // Empty folder -> every artifact read fails inside the transaction.
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-empty-artifacts-"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const previousDir = process.env.ARTIFACTS_DIR;

    try {
      process.env.ARTIFACTS_DIR = emptyDir;
      ml.resetCache();

      const record = exampleRecord();
      record.session_id = "RR01-000777";

      const res = await postSession(record);

      // The game is saved, the prediction fields are null.
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        saved: true,
        skill_rank: null,
        animal: null,
        animal_iq: null,
      });
      expect(counts()).toEqual({
        sessions: 1,
        attempts: 3,
        features: 1,
        predictions: 0,
      });
      // The failure was logged, not silently ignored.
      expect(consoleError).toHaveBeenCalled();
    } finally {
      if (previousDir === undefined) delete process.env.ARTIFACTS_DIR;
      else process.env.ARTIFACTS_DIR = previousDir;

      ml.resetCache();
      consoleError.mockRestore();
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("insertSession rollback", () => {
  it("rolls back everything when a write fails", () => {
    // A separate in-memory db with game_sessions but NO level_attempts table.
    const brokenDb = new Database(":memory:");

    brokenDb.exec(`
      CREATE TABLE devices (
        device_id    TEXT PRIMARY KEY,
        name         TEXT,
        api_key_hash TEXT NOT NULL,
        last_seen_at TEXT
      );
      CREATE TABLE game_sessions (
        session_id              TEXT PRIMARY KEY,
        device_id               TEXT REFERENCES devices(device_id),
        outcome                 TEXT,
        final_score             INTEGER,
        highest_level_completed INTEGER,
        final_sequence_length   INTEGER,
        successful_rounds       INTEGER,
        failed_attempts         INTEGER,
        duration_seconds        INTEGER,
        nickname                TEXT,
        is_synthetic            INTEGER DEFAULT 0,
        received_at             TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    brokenDb
      .prepare("INSERT INTO devices (device_id, api_key_hash) VALUES (?, ?)")
      .run(TEST_DEVICE_ID, "not-used-here");

    // The attempts insert fails because the table does not exist.
    expect(() => insertSession(brokenDb, exampleRecord())).toThrow();

    // The already-inserted game_sessions row must be gone again.
    const remaining = brokenDb
      .prepare("SELECT COUNT(*) c FROM game_sessions")
      .get().c;
    expect(remaining).toBe(0);

    brokenDb.close();
  });
});
