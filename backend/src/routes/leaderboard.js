// backend/src/routes/leaderboard.js
// GET /api/leaderboard?limit=20 - public top scores.

const express = require("express");

const db = require("../db");
const { getLeaderboard } = require("../services/queries");

const router = express.Router();

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;

// Only plain digits are accepted: "20" yes, "abc", "2.5", "-1", "" no.
function parseLimit(raw) {
  if (raw === undefined) return { ok: true, value: DEFAULT_LIMIT };

  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    return { ok: false };
  }

  const value = Number(raw);

  if (value < MIN_LIMIT || value > MAX_LIMIT) {
    return { ok: false };
  }

  return { ok: true, value };
}

router.get("/", (req, res, next) => {
  const limit = parseLimit(req.query.limit);

  if (!limit.ok) {
    return res.status(400).json({ error: "invalid_limit" });
  }

  try {
    return res.status(200).json({ entries: getLeaderboard(db, limit.value) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
