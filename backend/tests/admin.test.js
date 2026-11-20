// backend/tests/admin.test.js
// Tests for the admin API (/api/admin/*), Phase K.
//
// Same setup as the other test files: DB_PATH=":memory:" BEFORE the app
// modules load, and the CommonJS backend is loaded with Node's require so the
// routes and this file share one database.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.DB_PATH = ":memory:";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");

const db = require("../src/db.js");
const { createApp } = require("../src/app.js");
const { runMigrations } = require("../../db/migrate.js");
const { insertSession } = require("../src/services/sessions.js");
const { getStatsSummary } = require("../src/services/queries.js");

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------
const PASSWORD = "test-admin-password";
const RR01_KEY = "test-rr01-key";
const SIM01_KEY = "test-sim01-key";

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// A normal app with a high rate limit, so only the rate-limit test can hit it.
function makeApp(options = {}) {
  return createApp({
    adminPassword: PASSWORD,
    nodeEnv: "test",
    adminRateLimit: { limit: 1000, windowMs: 60 * 1000 },
    ...options,
  });
}

let app;

function record(sessionId, deviceId, overrides = {}) {
  return {
    session_id: sessionId,
    device_id: deviceId,
    outcome: "game_over",
    final_score: 1500,
    highest_level_completed: 4,
    final_sequence_length: 7,
    successful_rounds: 4,
    failed_attempts: 3,
    duration_seconds: 90,
    attempts: [
      { level: 1, result: "pass", response_ms: 3000 },
      { level: 2, result: "pass", response_ms: 4000 },
      { level: 3, result: "pass", response_ms: 5000 },
      { level: 4, result: "pass", response_ms: 6000 },
      { level: 5, result: "wrong", response_ms: 2000 },
      { level: 5, result: "timeout", response_ms: 0 },
      { level: 5, result: "wrong", response_ms: 1000 },
    ],
    ...overrides,
  };
}

function rowCount(sql, ...params) {
  return db.prepare(sql).get(...params).c;
}

function childCounts(sessionId) {
  return {
    attempts: rowCount("SELECT COUNT(*) c FROM level_attempts WHERE session_id = ?", sessionId),
    features: rowCount("SELECT COUNT(*) c FROM session_features WHERE session_id = ?", sessionId),
    predictions: rowCount("SELECT COUNT(*) c FROM ml_predictions WHERE session_id = ?", sessionId),
  };
}

// Admin request helpers. password=null means "no header at all".
function adminGet(target, url, password = PASSWORD) {
  const req = request(target).get(url);
  if (password !== null) req.set("X-Admin-Password", password);
  return req;
}

function adminSend(target, method, url, body, password = PASSWORD) {
  const req = request(target)[method](url);
  if (password !== null) req.set("X-Admin-Password", password);
  return body === undefined ? req : req.send(body);
}

beforeAll(() => {
  runMigrations(db);
  db.prepare("INSERT INTO devices (device_id, name, api_key_hash) VALUES (?, ?, ?)").run(
    "RR01",
    "Rhythm Rush test device",
    sha256Hex(RR01_KEY)
  );
  db.prepare("INSERT INTO devices (device_id, name, api_key_hash) VALUES (?, ?, ?)").run(
    "SIM01",
    "Simulated device",
    sha256Hex(SIM01_KEY)
  );
});

beforeEach(() => {
  db.exec(`
    DELETE FROM ml_predictions;
    DELETE FROM level_attempts;
    DELETE FROM session_features;
    DELETE FROM game_sessions;
    UPDATE devices SET last_seen_at = NULL;
  `);
  app = makeApp();
});

// Every admin route, for the auth tests.
const ROUTES = [
  ["post", "/api/admin/login", undefined],
  ["get", "/api/admin/overview", undefined],
  ["get", "/api/admin/models", undefined],
  ["patch", "/api/admin/game-sessions/RR01-000001/nickname", { nickname: "X" }],
  ["delete", "/api/admin/game-sessions/RR01-000001", undefined],
  ["delete", "/api/admin/game-sessions?device=SIM01", undefined],
];

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
describe("admin authentication", () => {
  it.each(ROUTES)("%s %s is 401 without a password", async (method, url, body) => {
    const res = await adminSend(app, method, url, body, null);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it.each(ROUTES)("%s %s is 401 with a wrong password", async (method, url, body) => {
    const res = await adminSend(app, method, url, body, "wrong-password");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("a password with a different length is a 401, not a crash", async () => {
    for (const guess of ["x", PASSWORD + "-longer", PASSWORD.toUpperCase()]) {
      const res = await adminSend(app, "post", "/api/admin/login", undefined, guess);
      expect(res.status).toBe(401);
    }
  });

  it("nothing is deleted when the password is wrong", async () => {
    insertSession(db, record("SIM01-000001", "SIM01"));

    await adminSend(app, "delete", "/api/admin/game-sessions?device=SIM01", undefined, "nope");
    await adminSend(app, "delete", "/api/admin/game-sessions/SIM01-000001", undefined, "nope");

    expect(rowCount("SELECT COUNT(*) c FROM game_sessions")).toBe(1);
  });

  it("POST /api/admin/login answers 200 {ok:true} with the right password", async () => {
    const res = await adminSend(app, "post", "/api/admin/login");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

// ---------------------------------------------------------------------------
// Configuration safety
// ---------------------------------------------------------------------------
describe("admin configuration", () => {
  it("an empty ADMIN_PASSWORD disables the admin API (503), even in development", async () => {
    for (const adminPassword of ["", undefined]) {
      const disabled = makeApp({ adminPassword, nodeEnv: "development" });
      const res = await adminSend(disabled, "post", "/api/admin/login", undefined, "");

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: "admin_disabled" });
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("'change-me' is refused in production", async () => {
    const prod = makeApp({ adminPassword: "change-me", nodeEnv: "production" });
    const res = await adminSend(prod, "post", "/api/admin/login", undefined, "change-me");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "admin_disabled" });
  });

  it("'change-me' still works outside production (development convenience)", async () => {
    const dev = makeApp({ adminPassword: "change-me", nodeEnv: "development" });
    const res = await adminSend(dev, "post", "/api/admin/login", undefined, "change-me");

    expect(res.status).toBe(200);
  });

  it("a real password works in production", async () => {
    const prod = makeApp({ nodeEnv: "production" });
    const res = await adminSend(prod, "post", "/api/admin/login");

    expect(res.status).toBe(200);
  });

  it("the public API keeps working when the admin API is disabled", async () => {
    const disabled = makeApp({ adminPassword: "" });
    const res = await request(disabled).get("/api/health");

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------
describe("admin rate limit", () => {
  it("answers 429 after too many wrong passwords, even for the right one", async () => {
    const limited = makeApp({ adminRateLimit: { limit: 3, windowMs: 60 * 1000 } });

    for (let i = 0; i < 3; i += 1) {
      const res = await adminSend(limited, "post", "/api/admin/login", undefined, "guess");
      expect(res.status).toBe(401);
    }

    const blocked = await adminSend(limited, "post", "/api/admin/login", undefined, "guess");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: "too_many_requests" });
    expect(blocked.headers["cache-control"]).toBe("no-store");

    const rightButBlocked = await adminSend(limited, "post", "/api/admin/login");
    expect(rightButBlocked.status).toBe(429);
  });

  it("successful requests do not count (the dashboard refreshes often)", async () => {
    const limited = makeApp({ adminRateLimit: { limit: 3, windowMs: 60 * 1000 } });

    for (let i = 0; i < 10; i += 1) {
      const res = await adminGet(limited, "/api/admin/overview");
      expect(res.status).toBe(200);
    }

    const wrong = await adminSend(limited, "post", "/api/admin/login", undefined, "guess");
    expect(wrong.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/overview
// ---------------------------------------------------------------------------
describe("GET /api/admin/overview", () => {
  it("contains everything from /api/stats/summary", async () => {
    insertSession(db, record("RR01-000001", "RR01", { final_score: 2500, outcome: "win" }));
    insertSession(db, record("SIM01-000001", "SIM01", { final_score: 500 }));

    const res = await adminGet(app, "/api/admin/overview");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");

    const summary = getStatsSummary(db);
    for (const [key, value] of Object.entries(summary)) {
      expect(res.body[key]).toEqual(value);
    }
  });

  it("lists devices with game counts and an online flag, never the key hash", async () => {
    insertSession(db, record("SIM01-000001", "SIM01"));
    insertSession(db, record("SIM01-000002", "SIM01"));

    const res = await adminGet(app, "/api/admin/overview");
    const byId = Object.fromEntries(res.body.devices.map((d) => [d.device_id, d]));

    expect(Object.keys(byId).sort()).toEqual(["RR01", "SIM01"]);
    expect(byId.SIM01).toMatchObject({ name: "Simulated device", games_count: 2, is_online: true });
    expect(byId.SIM01.last_seen_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(byId.RR01).toMatchObject({ games_count: 0, is_online: false, last_seen_at: null });
    expect(JSON.stringify(res.body)).not.toContain("api_key_hash");
    expect(JSON.stringify(res.body)).not.toContain(sha256Hex(RR01_KEY));
  });

  it("a device seen more than 10 minutes ago is offline", async () => {
    db.prepare(
      "UPDATE devices SET last_seen_at = datetime('now', '-11 minutes') WHERE device_id = 'RR01'"
    ).run();
    db.prepare(
      "UPDATE devices SET last_seen_at = datetime('now', '-9 minutes') WHERE device_id = 'SIM01'"
    ).run();

    const res = await adminGet(app, "/api/admin/overview");
    const byId = Object.fromEntries(res.body.devices.map((d) => [d.device_id, d]));

    expect(byId.RR01.is_online).toBe(false);
    expect(byId.SIM01.is_online).toBe(true);
  });

  it("counts real and synthetic games (SIM01 or is_synthetic = 1)", async () => {
    insertSession(db, record("RR01-000001", "RR01"));
    insertSession(db, record("RR01-000002", "RR01"));
    insertSession(db, record("SIM01-000001", "SIM01"));
    db.prepare("UPDATE game_sessions SET is_synthetic = 1 WHERE session_id = 'RR01-000002'").run();

    const res = await adminGet(app, "/api/admin/overview");

    expect(res.body.game_counts).toEqual({ real: 1, synthetic: 2 });
  });

  it("returns the 20 most recent sessions, newest first", async () => {
    for (let i = 1; i <= 25; i += 1) {
      insertSession(db, record(`SIM01-${String(i).padStart(6, "0")}`, "SIM01", { final_score: i }));
    }
    db.prepare("UPDATE game_sessions SET nickname = 'Ana' WHERE session_id = 'SIM01-000025'").run();

    const res = await adminGet(app, "/api/admin/overview");
    const recent = res.body.recent_sessions;

    expect(recent).toHaveLength(20);
    expect(recent[0]).toEqual({
      session_id: "SIM01-000025",
      device_id: "SIM01",
      final_score: 25,
      nickname: "Ana",
      received_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
    });
    expect(recent[19].session_id).toBe("SIM01-000006");
  });

  it("works on an empty database", async () => {
    const res = await adminGet(app, "/api/admin/overview");

    expect(res.status).toBe(200);
    expect(res.body.total_games).toBe(0);
    expect(res.body.recent_sessions).toEqual([]);
    expect(res.body.game_counts).toEqual({ real: 0, synthetic: 0 });
    expect(res.body.devices).toHaveLength(2);
  });

  it("a difficulty request marks the device as seen (online)", async () => {
    const res = await request(app)
      .post("/api/difficulty/next")
      .set("X-API-Key", RR01_KEY)
      .send({ accuracy: 0.8, reactionRatio: 0.6, level: 5, currentLength: 7 });
    expect(res.status).toBe(200);

    const overview = await adminGet(app, "/api/admin/overview");
    const rr01 = overview.body.devices.find((d) => d.device_id === "RR01");

    expect(rr01.is_online).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/models
// ---------------------------------------------------------------------------
describe("GET /api/admin/models", () => {
  it("returns version, size and date of the three artifacts", async () => {
    const res = await adminGet(app, "/api/admin/models");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");

    const byName = Object.fromEntries(res.body.models.map((m) => [m.name, m]));
    expect(Object.keys(byName).sort()).toEqual(["animal", "difficulty", "skill"]);

    for (const model of res.body.models) {
      expect(model.version).toBe(1);
      expect(model.size_bytes).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(model.modified_at))).toBe(false);
    }

    expect(byName.difficulty.file).toBe("difficulty.json");
    expect(byName.skill.node_count).toBeGreaterThan(0);
  });

  it("shows the animal tiers and the row COUNT, never the rows", async () => {
    const res = await adminGet(app, "/api/admin/models");
    const animal = res.body.models.find((m) => m.name === "animal");

    expect(animal.reference_rows).toBe(2000);
    expect(animal.tiers).toHaveLength(5);
    expect(animal.tiers[0]).toMatchObject({ animal: "Chimpanzee", percentile_min: 0.9 });
    expect(animal).not.toHaveProperty("rows");
    // The real animal.json is ~340 kB; the answer must stay tiny.
    expect(JSON.stringify(res.body).length).toBeLessThan(5000);
    expect(JSON.stringify(res.body)).not.toContain("SYN-000001");
  });

  it("reports missing or broken files instead of failing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-models-"));
    fs.writeFileSync(path.join(dir, "skill.json"), "{ not json");

    const custom = makeApp({ artifactsDir: dir });
    const res = await adminGet(custom, "/api/admin/models");
    const byName = Object.fromEntries(res.body.models.map((m) => [m.name, m]));

    expect(res.status).toBe(200);
    expect(byName.skill.error).toBe("invalid_json");
    expect(byName.animal.error).toBe("missing");
    expect(byName.difficulty.error).toBe("missing");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/game-sessions/:id/nickname
// ---------------------------------------------------------------------------
describe("PATCH /api/admin/game-sessions/:id/nickname", () => {
  const url = (id) => `/api/admin/game-sessions/${id}/nickname`;
  const nicknameOf = (id) =>
    db.prepare("SELECT nickname FROM game_sessions WHERE session_id = ?").get(id).nickname;

  it("overwrites an existing nickname (the public route cannot)", async () => {
    insertSession(db, record("RR01-000001", "RR01"));
    db.prepare("UPDATE game_sessions SET nickname = 'Rude' WHERE session_id = 'RR01-000001'").run();

    const res = await adminSend(app, "patch", url("RR01-000001"), { nickname: "  Polite  " });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: true, nickname: "Polite" });
    expect(nicknameOf("RR01-000001")).toBe("Polite");
  });

  it("clears the nickname with null", async () => {
    insertSession(db, record("RR01-000001", "RR01"));
    db.prepare("UPDATE game_sessions SET nickname = 'Rude' WHERE session_id = 'RR01-000001'").run();

    const res = await adminSend(app, "patch", url("RR01-000001"), { nickname: null });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: true, nickname: null });
    expect(nicknameOf("RR01-000001")).toBeNull();

    // After clearing, the player can set a new one on the public route.
    const again = await request(app)
      .patch("/api/game-sessions/RR01-000001/nickname")
      .send({ nickname: "Fresh" });
    expect(again.status).toBe(200);
  });

  it("uses the same validation as the public route", async () => {
    insertSession(db, record("RR01-000001", "RR01"));

    for (const body of [
      { nickname: "" },
      { nickname: "   " },
      { nickname: "a".repeat(17) },
      { nickname: "<script>" },
      { nickname: 42 },
      {},
    ]) {
      const res = await adminSend(app, "patch", url("RR01-000001"), body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "invalid_nickname" });
    }
    expect(nicknameOf("RR01-000001")).toBeNull();
  });

  it("treats SQL text as data", async () => {
    insertSession(db, record("RR01-000001", "RR01"));

    const res = await adminSend(app, "patch", url("RR01-000001"), {
      nickname: "'; DROP TABLE game_sessions;--",
    });

    expect(res.status).toBe(400);
    expect(rowCount("SELECT COUNT(*) c FROM game_sessions")).toBe(1);
  });

  it("is 404 for an unknown game", async () => {
    const res = await adminSend(app, "patch", url("NOPE-1"), { nickname: "Ana" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/game-sessions/:id
// ---------------------------------------------------------------------------
describe("DELETE /api/admin/game-sessions/:id", () => {
  it("deletes one game and its attempts, features and prediction (cascade)", async () => {
    insertSession(db, record("RR01-000001", "RR01"));
    insertSession(db, record("RR01-000002", "RR01"));

    const before = childCounts("RR01-000001");
    expect(before.attempts).toBe(7);
    expect(before.features).toBe(1);
    expect(before.predictions).toBe(1);

    const res = await adminSend(app, "delete", "/api/admin/game-sessions/RR01-000001");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 1, session_id: "RR01-000001" });
    expect(rowCount("SELECT COUNT(*) c FROM game_sessions WHERE session_id = 'RR01-000001'")).toBe(0);
    expect(childCounts("RR01-000001")).toEqual({ attempts: 0, features: 0, predictions: 0 });

    // The other game is untouched.
    expect(childCounts("RR01-000002")).toEqual({ attempts: 7, features: 1, predictions: 1 });
  });

  it("is 404 for an unknown id, and for a second delete", async () => {
    insertSession(db, record("RR01-000001", "RR01"));

    const first = await adminSend(app, "delete", "/api/admin/game-sessions/RR01-000001");
    const second = await adminSend(app, "delete", "/api/admin/game-sessions/RR01-000001");
    const unknown = await adminSend(app, "delete", "/api/admin/game-sessions/NOPE");

    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: "not_found" });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/game-sessions?device=...
// ---------------------------------------------------------------------------
describe("DELETE /api/admin/game-sessions?device=", () => {
  beforeEach(() => {
    insertSession(db, record("RR01-000001", "RR01"));
    insertSession(db, record("RR01-000002", "RR01"));
    insertSession(db, record("SIM01-000001", "SIM01"));
    insertSession(db, record("SIM01-000002", "SIM01"));
    insertSession(db, record("SIM01-000003", "SIM01"));
  });

  const countFor = (device) =>
    rowCount("SELECT COUNT(*) c FROM game_sessions WHERE device_id = ?", device);

  it("refuses a request without a device", async () => {
    for (const url of [
      "/api/admin/game-sessions",
      "/api/admin/game-sessions?device=",
      "/api/admin/game-sessions?device=SIM01&device=RR01",
    ]) {
      const res = await adminSend(app, "delete", url);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "device_required" });
    }
    expect(rowCount("SELECT COUNT(*) c FROM game_sessions")).toBe(5);
  });

  it("deletes every SIM01 game (with cascade) and nothing else", async () => {
    const res = await adminSend(app, "delete", "/api/admin/game-sessions?device=SIM01");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 3, device_id: "SIM01" });
    expect(countFor("SIM01")).toBe(0);
    expect(countFor("RR01")).toBe(2);
    expect(childCounts("SIM01-000001")).toEqual({ attempts: 0, features: 0, predictions: 0 });
    expect(
      db.prepare("SELECT last_seen_at FROM devices WHERE device_id = 'SIM01'").get().last_seen_at
    ).toBeNull();
  });

  it("protects RR01: refused without confirm=RR01", async () => {
    const res = await adminSend(app, "delete", "/api/admin/game-sessions?device=RR01");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "confirm_required" });
    expect(countFor("RR01")).toBe(2);
  });

  it("protects RR01: a wrong confirm value is refused too", async () => {
    const res = await adminSend(app, "delete", "/api/admin/game-sessions?device=RR01&confirm=SIM01");

    expect(res.status).toBe(400);
    expect(countFor("RR01")).toBe(2);
  });

  it("deletes RR01 games only with confirm=RR01", async () => {
    const res = await adminSend(app, "delete", "/api/admin/game-sessions?device=RR01&confirm=RR01");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 2, device_id: "RR01" });
    expect(countFor("RR01")).toBe(0);
    expect(countFor("SIM01")).toBe(3);
  });

  it("is 404 for an unknown device", async () => {
    const res = await adminSend(app, "delete", "/api/admin/game-sessions?device=XX99&confirm=XX99");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "device_not_found" });
  });

  it("deleting a device with no games is fine (0 deleted)", async () => {
    await adminSend(app, "delete", "/api/admin/game-sessions?device=SIM01");
    const again = await adminSend(app, "delete", "/api/admin/game-sessions?device=SIM01");

    expect(again.status).toBe(200);
    expect(again.body).toEqual({ deleted: 0, device_id: "SIM01" });
  });
});
