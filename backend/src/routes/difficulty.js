// backend/src/routes/difficulty.js
// POST /api/difficulty/next - how many steps to add at the next level.
//
// Needs the device API key. If the model cannot run, the route answers with
// the fixed "+1 step" rule the ESP32 uses as its own fallback, so gameplay
// never stops because of the server.

const express = require("express");
const { z } = require("zod");

const db = require("../db");
const { requireDeviceApiKey } = require("../services/auth");
const { predictSteps, modelVersions } = require("../services/ml");

const router = express.Router();

// Longest legal sequence. 7 levels starting at 3 steps with at most +2 per
// level reach 15; 17 is kept as a safe cap.
const MAX_SEQUENCE_LENGTH = 17;

const bodySchema = z.object({
  accuracy: z.number().min(0).max(1),
  reactionRatio: z.number().min(0),
  level: z.number().int().min(1).max(7),
  currentLength: z.number().int().min(3).max(MAX_SEQUENCE_LENGTH),
});

function formatIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

router.post("/next", requireDeviceApiKey(db), (req, res, next) => {
  const parsed = bodySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_body",
      details: formatIssues(parsed.error),
    });
  }

  const { accuracy, reactionRatio, level, currentLength } = parsed.data;

  try {
    const steps = predictSteps({ accuracy, reactionRatio, level });
    const nextLength = Math.min(MAX_SEQUENCE_LENGTH, currentLength + steps);

    return res.status(200).json({
      steps,
      nextLength,
      model_version: modelVersions().difficulty,
    });
  } catch (err) {
    // Same fixed rule as the ESP32 fallback: add exactly one step.
    console.error(`Difficulty model failed: ${err.message}`);

    const steps = 1;

    return res.status(200).json({
      steps,
      nextLength: Math.min(MAX_SEQUENCE_LENGTH, currentLength + steps),
      fallback: true,
    });
  }
});

module.exports = router;
