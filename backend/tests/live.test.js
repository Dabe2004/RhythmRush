// backend/tests/live.test.js
// Live game mirror: the pure reducer, the in-memory store, POST /api/live/events,
// GET /api/live/state, the SSE stream, and GET /api/game-sessions/recent.

import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.DB_PATH = ":memory:";

const crypto = require("node:crypto");
const http = require("node:http");
const request = require("supertest");

const db = require("../src/db.js");
const { createApp } = require("../src/app.js");
const { reduceLive, createLiveStore, emptyState } = require("../src/services/liveState.js");
const { runMigrations } = require("../../db/migrate.js");

const KEYS = { RR01: "test-live-rr01", SIM01: "test-live-sim01" };

beforeAll(() => {
  runMigrations(db);
  for (const [id, key] of Object.entries(KEYS)) {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    db.prepare("INSERT INTO devices (device_id, name, api_key_hash) VALUES (?, ?, ?)").run(id, id, hash);
  }
});

// --- event builders ---------------------------------------------------------
const ev = {
  start: () => ({ type: "control_pressed", t_ms: 0, control: "start" }),
  reset: () => ({ type: "control_pressed", t_ms: 0, control: "reset" }),
  countdown: (then = "watch", level = 1) => ({ type: "countdown_started", t_ms: 0, seconds: 3, step_ms: 1000, then, level }),
  game: () => ({ type: "game_started", t_ms: 3000, lives: 3, level: 1 }),
  playback: (level = 1, attempt = 1, sequence = [1, 4, 2]) => ({
    type: "playback_started", t_ms: 3600, level, attempt, sequence, cue_ms: 500, gap_ms: 200,
  }),
  input: (level = 1, length = 3) => ({ type: "input_started", t_ms: 5700, level, deadline_ms: 3000, expected_length: length }),
  press: (index, button, ok = true) => ({ type: "press", t_ms: 6000, index, button, expected: button, ok }),
  result: (result = "pass", lives = 3, score = 140, points = 140) => ({
    type: "attempt_result", t_ms: 7000, level: 1, result, lives, score, points_awarded: points, speed_bonus: result === "pass" ? 40 : 0,
  }),
  finished: (score = 140) => ({
    type: "game_finished", t_ms: 9000, outcome: "game_over", final_score: score, highest_level_completed: 1, session_id: "SIM01-L-1",
  }),
  gameReset: () => ({ type: "game_reset", t_ms: 100 }),
};

// Run events through the pure reducer; time advances 10 ms per event.
function run(events, state = emptyState("RR01", "G1"), start = 1000) {
  let t = start;
  for (const event of events) state = reduceLive(state, event, (t += 10)).state;
  return state;
}

describe("reduceLive (pure)", () => {
  it("walks a whole game: START, GO countdown, watch, BEGIN countdown, input, presses, result, finished", () => {
    let s = run([ev.start(), ev.game(), ev.countdown("watch")]);
    expect(s).toMatchObject({ phase: "countdown", lives: 3, level: 1, score: 0 });
    expect(s.lastControl.control).toBe("start");
    expect(s.countdown).toMatchObject({ seconds: 3, step_ms: 1000, then: "watch" });

    s = run([ev.playback()], s, 5000);
    expect(s).toMatchObject({ phase: "watch", lives: 3, level: 1, attempt: 1, score: 0, countdown: null });
    expect(s.sequence).toMatchObject({ sequence: [1, 4, 2], cue_ms: 500, gap_ms: 200 });

    s = run([ev.countdown("input")], s, 6000);
    expect(s).toMatchObject({ phase: "countdown", lives: 3, level: 1 });
    expect(s.countdown.then).toBe("input");
    expect(s.sequence).not.toBeNull(); // BEGIN keeps the sequence just shown

    s = run([ev.input(), ev.press(0, 1), ev.press(1, 4)], s, 7000);
    expect(s.phase).toBe("input");
    expect(s.input).toMatchObject({ expected_length: 3, deadline_ms: 3000, done: 2 });
    expect(s.lastPress).toMatchObject({ index: 1, button: 4, ok: true });

    s = run([ev.press(2, 2), ev.result("pass")], s, 9000);
    expect(s).toMatchObject({ phase: "watch", score: 140, input: null });
    expect(s.lastResult).toMatchObject({ result: "pass", points_awarded: 140, speed_bonus: 40 });

    const attempt = (attemptNo, sequence, ...rest) => [ev.countdown("watch", 2), ev.playback(2, attemptNo, sequence), ev.countdown("input", 2), ev.input(2, 4), ...rest];
    s = run(attempt(1, [3, 3, 5, 6], ev.press(0, 2, false), ev.result("wrong", 2, 140, 0)), s, 11000);
    s = run(attempt(2, [6, 1, 2, 4], ev.result("timeout", 1, 140, 0)), s, 13000); // a NEW pattern after a fail
    s = run(attempt(3, [5, 2, 2, 1], ev.press(0, 1, false), ev.result("wrong", 0, 140, 0), ev.finished()), s, 15000);
    expect(s.phase).toBe("result_pending");
    expect(s.final).toMatchObject({ outcome: "game_over", final_score: 140, session_id: "SIM01-L-1" });
  });

  it("ignores events that do not fit the phase (invalid transitions)", () => {
    const idle = emptyState("RR01", "G1");
    for (const event of [ev.press(0, 1), ev.input(), ev.result(), ev.finished()]) {
      expect(reduceLive(idle, event, 5).applied, event.type).toBe(false);
    }
    const watching = run([ev.game(), ev.countdown(), ev.playback()]);
    expect(reduceLive(watching, ev.press(0, 1), 5).applied).toBe(false);
    const finished = run([ev.game(), ev.countdown(), ev.playback(), ev.input(), ev.finished()]);
    expect(reduceLive(finished, ev.playback(), 5).applied).toBe(false);
    expect(reduceLive(idle, { type: "something_new", t_ms: 0 }, 5).applied).toBe(false);
  });

  it("ignores game-button presses during the countdown", () => {
    const s = run([ev.countdown()]);
    const result = reduceLive(s, ev.press(0, 3), 2000);
    expect(result.applied).toBe(false);
    expect(result.state).toBe(s);
  });

  it("a countdown mid-game keeps lives, score and level (next level comes from the event)", () => {
    const s = run([ev.game(), ev.countdown(), ev.playback(), ev.countdown("input"), ev.input(), ev.result("pass", 3, 140, 140), ev.countdown("watch", 2)]);
    expect(s).toMatchObject({ phase: "countdown", lives: 3, score: 140, level: 2, lastResult: null, sequence: null });
  });

  it("a countdown from idle (no game_started yet) is a fresh game", () => {
    const s = run([ev.countdown()]);
    expect(s).toMatchObject({ phase: "countdown", lives: null, score: null });
    expect(s.countdown.then).toBe("watch"); // an old device without "then" means GO
  });

  it("game_reset mid-game (START held) goes back to idle and keeps the RESET mark", () => {
    const s = run([ev.game(), ev.countdown(), ev.playback(), ev.input(), ev.press(0, 1), ev.reset(), ev.gameReset()]);
    expect(s).toMatchObject({ phase: "idle", input: null, sequence: null, lives: null });
    expect(s.resetAt).not.toBeNull();
  });
});

describe("createLiveStore", () => {
  it("RESET mid-game: a new game_id starts a new game; the old game's events are ignored", () => {
    let t = 0;
    const store = createLiveStore({ now: () => (t += 5) });
    store.accept("RR01", "G1", [ev.start(), ev.game(), ev.countdown(), ev.playback(), ev.input()]);
    store.accept("RR01", "G1", [ev.reset(), ev.gameReset()]);
    store.accept("RR01", "G2", [ev.countdown()]);

    expect(store.snapshot().state).toMatchObject({ game_id: "G2", phase: "countdown" });
    expect(store.snapshot().state.resetAt).not.toBeNull();

    // A late batch from the abandoned game changes nothing.
    expect(store.accept("RR01", "G1", [ev.press(0, 1)])).toBe(0);
    expect(store.snapshot().state.game_id).toBe("G2");
  });

  it("90 s without events: abandoned, idle, broadcast once (injected clock)", () => {
    let t = 0;
    const store = createLiveStore({ now: () => t });
    const seen = [];
    store.subscribe((message) => seen.push(message.event.type));
    store.accept("RR01", "G1", [ev.game(), ev.countdown(), ev.playback()]);

    t = 89_000;
    store.tick();
    expect(store.snapshot().active).toBe(true);

    t = 90_001;
    store.tick();
    store.tick();
    expect(store.snapshot()).toMatchObject({ active: false });
    expect(seen.filter((type) => type === "abandoned")).toHaveLength(1);
  });

  it("numbers messages 1, 2, 3 and replays only what the ring buffer still has", () => {
    const store = createLiveStore({ bufferSize: 3 });
    store.accept("RR01", "G1", [ev.start(), ev.game(), ev.countdown(), ev.playback(), ev.input()]);
    expect(store.lastId()).toBe(5);
    expect(store.since(3).map((m) => m.id)).toEqual([4, 5]);
    expect(store.since(5)).toEqual([]);
    expect(store.since(1)).toBeNull(); // too old: send a snapshot instead
    expect(store.since(99)).toBeNull(); // from a previous server run
  });
});

describe("POST /api/live/events", () => {
  const body = (events, extra = {}) => ({ device_id: "SIM01", game_id: "SIM01-L-1", events, ...extra });
  const post = (app, payload, key = KEYS.SIM01) => {
    const req = request(app).post("/api/live/events").send(payload);
    return key === null ? req : req.set("X-API-Key", key);
  };

  it("accepts events with 202 and the applied count (ignored ones not counted)", async () => {
    const app = createApp();
    const res = await post(app, body([ev.start(), ev.countdown(), ev.press(0, 1)]));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: 2 });

    const state = await request(app).get("/api/live/state");
    expect(state.headers["cache-control"]).toBe("no-store");
    expect(state.body).toMatchObject({ active: true, state: { device_id: "SIM01", phase: "countdown" } });
  });

  it("GET /api/live/state is {active:false} with no game", async () => {
    const res = await request(createApp()).get("/api/live/state");
    expect(res.body).toMatchObject({ active: false });
  });

  it("401 without or with a wrong key, 403 for another device's id", async () => {
    const app = createApp();
    expect((await post(app, body([ev.start()]), null)).status).toBe(401);
    expect((await post(app, body([ev.start()]), "wrong")).status).toBe(401);
    const mismatch = await post(app, body([ev.start()]), KEYS.RR01);
    expect(mismatch.status).toBe(403);
    expect(mismatch.body).toEqual({ error: "device_mismatch" });
  });

  it("400 for every limit of the contract", async () => {
    const app = createApp();
    const bad = [
      body([{ type: "nope", t_ms: 0 }]),
      body([]),
      body(Array.from({ length: 21 }, () => ev.start())),
      body([{ ...ev.playback(), sequence: Array(18).fill(1) }]),
      body([{ ...ev.playback(), sequence: [1, 7] }]),
      body([{ ...ev.playback(), level: 16 }]),
      body([{ ...ev.game(), lives: 4 }]),
      body([{ ...ev.countdown(), seconds: 6 }]),
      body([{ ...ev.countdown(), step_ms: 400 }]),
      body([{ ...ev.press(0, 1), ok: "yes" }]),
      body([ev.start()], { game_id: "" }),
      { device_id: "SIM01", events: [ev.start()] },
    ];
    for (const payload of bad) {
      const res = await post(app, payload);
      expect(res.status, JSON.stringify(payload).slice(0, 80)).toBe(400);
    }
    expect((await post(app, "{broken").set("Content-Type", "application/json")).status).toBe(400);
  });

  it("413 for a body over 8 KB", async () => {
    const res = await post(createApp(), body([ev.start()], { pad: "x".repeat(9000) }));
    expect(res.status).toBe(413);
  });

  it("429 per device once the rate limit is used up", async () => {
    const app = createApp({ live: { rateLimit: { limit: 2, windowMs: 60_000 } } });
    expect((await post(app, body([ev.start()]))).status).toBe(202);
    expect((await post(app, body([ev.start()]))).status).toBe(202);
    const third = await post(app, body([ev.start()]));
    expect(third.status).toBe(429);
    // Another device has its own budget.
    const other = await post(app, { ...body([ev.start()]), device_id: "RR01" }, KEYS.RR01);
    expect(other.status).toBe(202);
  });
});

// --- SSE helpers (a real server: supertest waits for the end of a stream) ---
function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// Opens the stream and collects parsed messages; resolves once headers arrive.
function openStream(server, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ port: server.address().port, host: "127.0.0.1", path: "/api/live/stream", headers }, (res) => {
      const stream = { res, req, raw: "", messages: [], waiters: [] };
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        stream.raw += chunk;
        const blocks = stream.raw.split("\n\n");
        stream.raw = blocks.pop();
        for (const block of blocks) {
          const message = { comment: block.startsWith(":") };
          for (const line of block.split("\n")) {
            const [, field, value] = line.match(/^([a-z]+): ?(.*)$/) || [];
            if (field === "data") message.data = JSON.parse(value);
            else if (field) message[field] = value;
          }
          stream.messages.push(message);
        }
        stream.waiters = stream.waiters.filter((w) => !w());
      });
      resolve(stream);
    });
    req.on("error", reject);
  });
}

function waitFor(stream, predicate, ms = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout waiting for SSE message")), ms);
    const check = () => {
      const found = stream.messages.find(predicate);
      if (found) {
        clearTimeout(timer);
        resolve(found);
      }
      return Boolean(found);
    };
    if (!check()) stream.waiters.push(check);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("GET /api/live/stream (SSE)", () => {
  it("sends SSE headers, retry, a snapshot first, then a posted event within a second", async () => {
    const app = createApp();
    const server = await listen(app);
    try {
      const stream = await openStream(server);
      expect(stream.res.headers["content-type"]).toMatch(/text\/event-stream/);
      expect(stream.res.headers["cache-control"]).toBe("no-cache");
      expect(stream.res.headers["x-accel-buffering"]).toBe("no");
      expect(stream.res.headers["content-encoding"]).toBeUndefined();
      expect(stream.res.headers.connection).toBe("keep-alive");

      const snapshot = await waitFor(stream, (m) => m.event === "snapshot");
      expect(snapshot.data).toMatchObject({ active: false });
      expect(stream.messages[0].retry).toBe("2000");

      const sentAt = Date.now();
      await request(app)
        .post("/api/live/events")
        .set("X-API-Key", KEYS.SIM01)
        .send({ device_id: "SIM01", game_id: "S-1", events: [ev.start(), ev.countdown()] });
      const live = await waitFor(stream, (m) => m.event === "live" && m.data.event.type === "countdown_started");
      expect(Date.now() - sentAt).toBeLessThan(1000);
      expect(live.id).toBe("2");
      expect(live.data.state).toMatchObject({ phase: "countdown", game_id: "S-1" });
      expect(typeof live.data.event.receivedAt).toBe("number");
      stream.req.destroy();
    } finally {
      server.close();
    }
  });

  it("replays missed messages after Last-Event-ID, or sends a snapshot when too old", async () => {
    const app = createApp();
    const server = await listen(app);
    try {
      await request(app)
        .post("/api/live/events")
        .set("X-API-Key", KEYS.SIM01)
        .send({ device_id: "SIM01", game_id: "S-2", events: [ev.start(), ev.countdown(), ev.game()] });

      const resumed = await openStream(server, { "Last-Event-ID": "1" });
      await waitFor(resumed, (m) => m.id === "3");
      expect(resumed.messages.filter((m) => m.event === "live").map((m) => m.id)).toEqual(["2", "3"]);
      expect(resumed.messages.some((m) => m.event === "snapshot")).toBe(false);
      resumed.req.destroy();

      const stale = await openStream(server, { "Last-Event-ID": "999" });
      const snapshot = await waitFor(stale, (m) => m.event === "snapshot");
      expect(snapshot.data.state.phase).toBe("watch");
      stale.req.destroy();
    } finally {
      server.close();
    }
  });

  it("sends a heartbeat comment", async () => {
    const server = await listen(createApp({ live: { heartbeatMs: 50 } }));
    try {
      const stream = await openStream(server);
      await waitFor(stream, (m) => m.comment);
      stream.req.destroy();
    } finally {
      server.close();
    }
  });

  it("answers 503 above the connection cap and frees slots (no leak) on disconnect", async () => {
    const app = createApp({ live: { maxClients: 2 } });
    const server = await listen(app);
    try {
      const a = await openStream(server);
      const b = await openStream(server);
      const third = await openStream(server);
      expect(third.res.statusCode).toBe(503);
      third.req.destroy();
      expect(app.locals.live.clientCount()).toBe(2);
      expect(app.locals.live.store.listenerCount()).toBe(2);

      a.req.destroy();
      b.req.destroy();
      await sleep(100);
      expect(app.locals.live.clientCount()).toBe(0);
      expect(app.locals.live.store.listenerCount()).toBe(0);

      const again = await openStream(server);
      expect(again.res.statusCode).toBe(200);
      again.req.destroy();
    } finally {
      server.close();
    }
  });
});

describe("GET /api/game-sessions/recent", () => {
  it("returns the newest games first, limited, and rejects a bad limit", async () => {
    const app = createApp();
    const insert = db.prepare(`
      INSERT INTO game_sessions (session_id, device_id, outcome, final_score, highest_level_completed,
        final_sequence_length, successful_rounds, failed_attempts, duration_seconds, received_at)
      VALUES (?, 'SIM01', 'game_over', ?, 1, 3, 1, 0, 10, ?)`);
    insert.run("R-1", 100, "2026-11-21 10:00:00");
    insert.run("R-2", 200, "2026-11-21 10:00:05");
    insert.run("R-3", 300, "2026-11-21 10:00:09");

    const res = await request(app).get("/api/game-sessions/recent?limit=2");
    expect(res.status).toBe(200);
    expect(res.body.sessions.map((s) => s.session_id)).toEqual(["R-3", "R-2"]);
    expect(Object.keys(res.body.sessions[0]).sort()).toEqual(
      ["final_score", "highest_level_completed", "nickname", "outcome", "player_number", "received_at", "session_id"]
    );
    expect((await request(app).get("/api/game-sessions/recent?limit=0")).status).toBe(400);
    expect((await request(app).get("/api/game-sessions/recent?limit=abc")).status).toBe(400);
  });
});
