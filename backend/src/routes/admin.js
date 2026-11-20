// backend/src/routes/admin.js
// Admin API, mounted on /api/admin (Phase K).
//
//   POST   /login                          check the password (200 or 401)
//   GET    /overview                       stats + devices + recent games
//   GET    /models                         metadata of the 3 artifacts
//   PATCH  /game-sessions/:id/nickname     overwrite or clear (null) a nickname
//   DELETE /game-sessions/:id              delete one game (cascade)
//   DELETE /game-sessions?device=SIM01     delete every game of one device
//
// Every request needs the header X-Admin-Password. The order of the checks:
//   1. Cache-Control: no-store on every answer (set in app.js)
//   2. admin API switched off?        -> 503 admin_disabled
//   3. too many WRONG passwords?      -> 429 too_many_requests
//   4. wrong or missing password      -> 401 unauthorized
//   5. the route itself

const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const { adminConfigProblem, requireAdminPassword } = require("../services/auth");
const { nicknameField } = require("../services/nickname");
const {
  SIMULATED_DEVICE_ID,
  getAdminOverview,
  getModelsInfo,
  overwriteNickname,
  deleteSession,
  deviceExists,
  deleteSessionsOfDevice,
} = require("../services/admin");

// A string (same rule as the public route) or null to clear the nickname.
const nicknameBodySchema = z.object({
  nickname: z.union([nicknameField, z.null()]),
});

/**
 * Build the admin router.
 *
 * @param {object} options
 * @param {import("better-sqlite3").Database} options.db
 * @param {string|undefined} options.password   ADMIN_PASSWORD
 * @param {string|undefined} options.nodeEnv    NODE_ENV
 * @param {string} options.artifactsDir         folder with the model JSON
 * @param {{limit?: number, windowMs?: number}} [options.rateLimit]
 *        Wrong-password attempts per IP and window. Tests raise or lower it.
 */
function createAdminRouter({ db, password, nodeEnv, artifactsDir, rateLimit: limits = {} }) {
  const router = express.Router();

  // 2. Refuse to run with an unsafe password. The public API is unaffected.
  const problem = adminConfigProblem(password, nodeEnv);
  if (problem) {
    router.use((req, res) => res.status(503).json({ error: "admin_disabled" }));
    return router;
  }

  // 3. Only FAILED logins count (401). The dashboard refreshes every 15 s
  //    with the right password, and those requests must never be blocked.
  router.use(
    rateLimit({
      windowMs: limits.windowMs ?? 15 * 60 * 1000,
      limit: limits.limit ?? 10,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      requestWasSuccessful: (req, res) => res.statusCode !== 401,
      message: { error: "too_many_requests" },
    })
  );

  // 4. Password check (SHA-256 + crypto.timingSafeEqual, see services/auth.js).
  router.use(requireAdminPassword(password));

  // -------------------------------------------------------------------------
  // 5. Routes
  // -------------------------------------------------------------------------
  router.post("/login", (req, res) => {
    res.status(200).json({ ok: true });
  });

  router.get("/overview", (req, res, next) => {
    try {
      return res.status(200).json(getAdminOverview(db));
    } catch (err) {
      return next(err);
    }
  });

  router.get("/models", (req, res, next) => {
    try {
      return res.status(200).json(getModelsInfo(artifactsDir));
    } catch (err) {
      return next(err);
    }
  });

  router.patch("/game-sessions/:id/nickname", (req, res, next) => {
    const parsed = nicknameBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_nickname" });
    }

    try {
      const { nickname } = parsed.data;

      if (!overwriteNickname(db, req.params.id, nickname)) {
        return res.status(404).json({ error: "not_found" });
      }

      return res.status(200).json({ saved: true, nickname });
    } catch (err) {
      return next(err);
    }
  });

  router.delete("/game-sessions/:id", (req, res, next) => {
    try {
      const deleted = deleteSession(db, req.params.id);

      if (deleted === 0) {
        return res.status(404).json({ error: "not_found" });
      }

      return res.status(200).json({ deleted, session_id: req.params.id });
    } catch (err) {
      return next(err);
    }
  });

  // Bulk delete. The device must be named explicitly. Real devices (anything
  // except the simulator) also need confirm=<same device id>, so a slip of
  // the mouse can never wipe the real RR01 games.
  router.delete("/game-sessions", (req, res, next) => {
    const { device, confirm } = req.query;

    // A repeated ?device=a&device=b arrives as an array: refuse it.
    if (typeof device !== "string" || device.length === 0) {
      return res.status(400).json({ error: "device_required" });
    }

    if (device !== SIMULATED_DEVICE_ID && confirm !== device) {
      return res.status(400).json({ error: "confirm_required" });
    }

    try {
      if (!deviceExists(db, device)) {
        return res.status(404).json({ error: "device_not_found" });
      }

      const deleted = deleteSessionsOfDevice(db, device);
      return res.status(200).json({ deleted, device_id: device });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = createAdminRouter;
