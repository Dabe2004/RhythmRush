// backend/src/routes/gameSessions.js
// POST /api/game-sessions - the ESP32 uploads one finished game here.
//
// Order of checks (per AGENTS.md):
//   1. API key       -> 401 unauthorized
//   2. body shape    -> 400 invalid_body
//   3. device match  -> 403 device_mismatch
//   4. save          -> 201 saved, or 200 duplicate

const express = require("express");
const { z } = require("zod");

const db = require("../db");
const { requireDeviceApiKey } = require("../services/auth");
const { insertSession } = require("../services/sessions");

const router = express.Router();

// ---------------------------------------------------------------------------
// Validation, following docs/session.schema.json
// ---------------------------------------------------------------------------
const attemptSchema = z.object({
  level: z.number().int().min(1).max(7),
  result: z.enum(["pass", "wrong", "timeout"]),
  response_ms: z.number().int().min(0),
});

const sessionSchema = z.object({
  session_id: z.string().min(1),
  device_id: z.string().min(1),
  outcome: z.enum(["game_over", "win"]),
  final_score: z.number().int().min(0),
  highest_level_completed: z.number().int().min(0),
  final_sequence_length: z.number().int().min(0),
  successful_rounds: z.number().int().min(0),
  failed_attempts: z.number().int().min(0),
  duration_seconds: z.number().int().min(0),
  attempts: z.array(attemptSchema).max(200),
});

// Short, readable error list for the ESP32 / developer.
function formatIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

// ---------------------------------------------------------------------------
// POST /api/game-sessions
// ---------------------------------------------------------------------------
// requireDeviceApiKey answers 401 for a missing or unknown key and puts the
// device on req.device (shared with POST /api/difficulty/next).
router.post("/", requireDeviceApiKey(db), (req, res, next) => {
  try {
    // (a) Authentication already done by the middleware.
    const device = req.device;

    // (b) Validate the body.
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_body",
        details: formatIssues(parsed.error),
      });
    }

    const record = parsed.data;

    // (c) The key may only upload for its own device.
    if (record.device_id !== device.device_id) {
      return res.status(403).json({ error: "device_mismatch" });
    }

    // (d) One transaction for session + attempts + features + predictions.
    const result = insertSession(db, record);

    // A retry repeats the prediction stored on the first upload.
    if (result.duplicate) {
      return res.status(200).json({
        duplicate: true,
        skill_rank: result.skillRank,
        animal: result.animal,
        animal_iq: result.animalIq,
      });
    }

    // Predictions are null when the ML step failed (the game is still saved).
    return res.status(201).json({
      saved: true,
      skill_rank: result.skillRank,
      animal: result.animal,
      animal_iq: result.animalIq,
    });
  } catch (err) {
    // Unexpected database errors go to the JSON error handler.
    return next(err);
  }
});

module.exports = router;
