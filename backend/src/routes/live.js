// backend/src/routes/live.js
// POST /api/live/events   device -> server (X-API-Key), 202 {"accepted": n}
// GET  /api/live/state    public snapshot, or {"active": false}
// GET  /api/live/stream   public Server-Sent Events: snapshot, then every event
//
// Contract: docs/LIVE_PROTOCOL.md. Mounted BEFORE the app's 100 kb JSON
// parser, so this router's own 8 kb limit applies. No compression on the
// stream (the app has none), so every event is flushed at once.

const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const db = require("../db");
const { requireDeviceApiKey } = require("../services/auth");
const { createLiveStore } = require("../services/liveState");

const tMs = z.number().int().min(0);
const button = z.number().int().min(1).max(6);
const level = z.number().int().min(1).max(15);
const lives = z.number().int().min(0).max(3);
const count = z.number().int().min(0);

const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("control_pressed"), t_ms: tMs, control: z.enum(["start", "reset"]) }),
  z.object({
    type: z.literal("countdown_started"),
    t_ms: tMs,
    seconds: z.number().int().min(1).max(5),
    step_ms: z.number().int().min(500).max(1500),
  }),
  z.object({ type: z.literal("game_started"), t_ms: tMs, lives, level }),
  z.object({
    type: z.literal("playback_started"),
    t_ms: tMs,
    level,
    attempt: z.number().int().min(1).max(99),
    sequence: z.array(button).min(1).max(17),
    cue_ms: z.number().int().min(50).max(5000),
    gap_ms: z.number().int().min(0).max(5000),
  }),
  z.object({
    type: z.literal("input_started"),
    t_ms: tMs,
    level,
    deadline_ms: z.number().int().min(100).max(60000),
    expected_length: z.number().int().min(1).max(17),
  }),
  z.object({
    type: z.literal("press"),
    t_ms: tMs,
    index: z.number().int().min(0).max(16),
    button,
    expected: button,
    ok: z.boolean(),
  }),
  z.object({
    type: z.literal("attempt_result"),
    t_ms: tMs,
    level,
    result: z.enum(["pass", "wrong", "timeout"]),
    lives,
    score: count,
    points_awarded: count,
    speed_bonus: z.number().int().min(0).max(50),
  }),
  z.object({
    type: z.literal("game_finished"),
    t_ms: tMs,
    outcome: z.enum(["game_over", "win"]),
    final_score: count,
    highest_level_completed: z.number().int().min(0).max(15),
    session_id: z.string().min(1).max(64),
  }),
  z.object({ type: z.literal("game_reset"), t_ms: tMs }),
]);

const bodySchema = z.object({
  device_id: z.string().min(1).max(32),
  game_id: z.string().min(1).max(64),
  events: z.array(eventSchema).min(1).max(20),
});

function sseMessage(id, name, data) {
  return `id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * @param {object} [options]
 * @param {() => number} [options.now]        clock (tests inject one)
 * @param {number} [options.abandonMs]        default 90 s
 * @param {number} [options.maxClients]       default LIVE_MAX_CLIENTS or 100
 * @param {number} [options.heartbeatMs]      default 15 s
 * @param {{windowMs?: number, limit?: number}} [options.rateLimit] per device
 */
function createLiveRouter(options = {}) {
  const now = options.now ?? Date.now;
  const store = createLiveStore({ now, abandonMs: options.abandonMs });
  const maxClients = options.maxClients ?? (Number(process.env.LIVE_MAX_CLIENTS) || 100);
  const heartbeatMs = options.heartbeatMs ?? 15000;
  const limits = options.rateLimit || {};
  const clients = new Set();

  const router = express.Router();

  const perDevice = rateLimit({
    windowMs: limits.windowMs ?? 60 * 1000,
    limit: limits.limit ?? 600,
    keyGenerator: (req) => req.device.device_id,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests" },
  });

  router.post("/events", requireDeviceApiKey(db), perDevice, express.json({ limit: "8kb" }), (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "invalid_body" });

    const { device_id: deviceId, game_id: gameId, events } = parsed.data;
    if (deviceId !== req.device.device_id) return res.status(403).json({ error: "device_mismatch" });

    return res.status(202).json({ accepted: store.accept(deviceId, gameId, events) });
  });

  router.get("/state", (req, res) => {
    res.set("Cache-Control", "no-store").status(200).json(store.snapshot());
  });

  router.get("/stream", (req, res) => {
    if (clients.size >= maxClients) return res.status(503).json({ error: "too_many_clients" });

    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write("retry: 2000\n\n");

    // Reconnect: replay what was missed, or a fresh snapshot if it is too old.
    const header = req.get("Last-Event-ID");
    const missed = header !== undefined && /^\d+$/.test(header) ? store.since(Number(header)) : null;
    if (missed) {
      for (const message of missed) res.write(sseMessage(message.id, "live", { event: message.event, state: message.state, now: now() }));
    } else {
      res.write(sseMessage(store.lastId(), "snapshot", store.snapshot()));
    }

    const unsubscribe = store.subscribe((message) => {
      res.write(sseMessage(message.id, "live", { event: message.event, state: message.state, now: now() }));
    });
    // The heartbeat also notices abandoned games (90 s of silence).
    const heartbeat = setInterval(() => {
      store.tick();
      res.write(": ping\n\n");
    }, heartbeatMs);
    clients.add(res);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      clients.delete(res);
    });
    return undefined;
  });

  router.store = store;
  router.clientCount = () => clients.size;
  return router;
}

module.exports = createLiveRouter;
