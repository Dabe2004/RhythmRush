// backend/src/routes/sessions.js
// GET   /api/game-sessions/:id            - full session, public
// PATCH /api/game-sessions/:id/nickname   - set the nickname once, public
//
// The upload itself (POST /api/game-sessions) lives in gameSessions.js.
// Both routers are mounted on the same path, so this one only handles GET/PATCH.

const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const db = require("../db");
const { getLatestSession, getSessionDetail, setNickname } = require("../services/queries");
const { nicknameField } = require("../services/nickname");

// Nickname rules: trimmed, 1-16 chars, letters/numbers/space/dash/underscore.
// The rule itself lives in services/nickname.js (shared with the admin route).
const nicknameSchema = z.object({
  nickname: nicknameField,
});

/**
 * Build the sessions router.
 *
 * @param {object} [options]
 * @param {{windowMs?: number, limit?: number}} [options.nicknameRateLimit]
 *        Rate limit for the nickname route. Tests lower the limit.
 */
function createSessionsRouter(options = {}) {
  const limits = options.nicknameRateLimit || {};

  const router = express.Router();

  // Only this route is rate limited; the kiosk may call it often.
  const nicknameLimiter = rateLimit({
    windowMs: limits.windowMs ?? 60 * 1000,
    limit: limits.limit ?? 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "too_many_requests" },
  });

  // -------------------------------------------------------------------------
  // GET /api/game-sessions/latest
  // -------------------------------------------------------------------------
  // MUST stay before "/:id", otherwise Express treats "latest" as a session id.
  router.get("/latest", (req, res, next) => {
    try {
      return res.status(200).json({ session: getLatestSession(db) });
    } catch (err) {
      return next(err);
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/game-sessions/:id
  // -------------------------------------------------------------------------
  router.get("/:id", (req, res, next) => {
    try {
      const detail = getSessionDetail(db, req.params.id);

      if (!detail) {
        return res.status(404).json({ error: "not_found" });
      }

      return res.status(200).json(detail);
    } catch (err) {
      return next(err);
    }
  });

  // -------------------------------------------------------------------------
  // PATCH /api/game-sessions/:id/nickname
  // -------------------------------------------------------------------------
  router.patch("/:id/nickname", nicknameLimiter, (req, res, next) => {
    // 1. Shape and characters.
    const parsed = nicknameSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_nickname" });
    }

    const { nickname } = parsed.data;

    try {
      // 2. Existence, then "set once" rule.
      const result = setNickname(db, req.params.id, nickname);

      if (result.status === "not_found") {
        return res.status(404).json({ error: "not_found" });
      }

      if (result.status === "already_set") {
        return res.status(409).json({ error: "nickname_already_set" });
      }

      return res.status(200).json({ saved: true, nickname: result.nickname });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = createSessionsRouter;
