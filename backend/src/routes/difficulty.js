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

// Longest legal sequence: level 15 -> 17 steps.
const MAX_SEQUENCE_LENGTH = 17;

const bodySchema = z.object({
  accuracy: z.number().min(0).max(1),
  reactionRatio: z.number().min(0),
  level: z.number().int().min(1).max(15),
  currentLength: z.number().int().min(3).max(MAX_SEQUENCE_LENGTH),
});

function formatIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

// The ESP32 asks for difficulty between levels, so this request is a good
// "the device is alive" signal for the admin page (online badge). A failure
// here must never block gameplay, so it is only logged.
function markDeviceSeen(deviceId) {
  try {
    db.prepare("UPDATE devices SET last_seen_at = CURRENT_TIMESTAMP WHERE device_id = ?").run(
      deviceId
    );
  } catch (err) {
    console.error(`Could not update last_seen_at for ${deviceId}: ${err.message}`);
  }
}

router.post("/next", requireDeviceApiKey(db), (req, res, next) => {
  markDeviceSeen(req.device.device_id);

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
