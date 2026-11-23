// backend/src/services/sessions.js
// Database writes for game session uploads.
//
// The db is a PARAMETER (not imported) so tests can pass their own
// in-memory database: insertSession(myDb, record).

const { predictSkill, matchAnimal, modelVersions } = require("./ml");

/**
 * Compute the 4 model features for a finished session.
 *
 * Rules copied from AGENTS.md:
 *   - sequence length of an attempt = level + 2
 *   - avg_reaction_sec = average over PASS attempts of
 *                        (response_ms / 1000) / (level + 2),
 *                        or 3.0 when there are no pass attempts
 *   - success_rate = successful_rounds / (successful_rounds + failed_attempts),
 *                    or 0 when both are 0
 *   - highest_sequence_length = final_sequence_length
 *   - final_score is copied unchanged
 *
 * @param {object} record a validated session record
 */
function computeFeatures(record) {
  const passAttempts = record.attempts.filter((a) => a.result === "pass");

  // 3.0 is the documented fallback for a game with no successful attempt.
  let avgReactionSec = 3.0;

  if (passAttempts.length > 0) {
    const total = passAttempts.reduce((sum, attempt) => {
      const levelSeconds = attempt.response_ms / 1000; // ms -> sec
      const seqLength = attempt.level + 2;             // AGENTS.md rule
      return sum + levelSeconds / seqLength;           // seconds per press
    }, 0);

    avgReactionSec = total / passAttempts.length;
  }

  const attemptsTotal = record.successful_rounds + record.failed_attempts;
  const successRate =
    attemptsTotal === 0 ? 0 : record.successful_rounds / attemptsTotal;

  return {
    avgReactionSec,
    successRate,
    highestSequenceLength: record.final_sequence_length,
    finalScore: record.final_score,
  };
}

/**
 * Read the stored prediction for a session, or nulls when there is none.
 * Used by the duplicate branch: a retry never runs the models again.
 */
function readPrediction(db, sessionId) {
  try {
    const row = db
      .prepare(
        "SELECT skill_rank, animal, animal_iq FROM ml_predictions WHERE session_id = ?"
      )
      .get(sessionId);

    if (!row) {
      return { skillRank: null, animal: null, animalIq: null };
    }

    return {
      skillRank: row.skill_rank ?? null,
      animal: row.animal ?? null,
      animalIq: row.animal_iq ?? null,
    };
  } catch (err) {
    // A broken predictions table must not break the upload.
    console.error(`Could not read ml_predictions for ${sessionId}: ${err.message}`);
    return { skillRank: null, animal: null, animalIq: null };
  }
}

/**
 * Save one session, its attempts, its features, and its ML prediction in a
 * single transaction.
 *
 * Idempotent: the same session_id twice is saved once. The second call
 * returns { duplicate: true } and writes nothing else.
 *
 * ML errors are logged and swallowed: the game record is always kept, just
 * without a prediction row (skillRank/animal/animalIq are then null).
 *
 * @param {import("better-sqlite3").Database} db open database
 * @param {object} record validated session record
 * @returns {{duplicate: boolean, skillRank: string|null, animal: string|null, animalIq: number|null}}
 */
function insertSession(db, record) {
  const insertGameSession = db.prepare(`
    INSERT OR IGNORE INTO game_sessions (
      session_id, device_id, outcome, final_score, highest_level_completed,
      final_sequence_length, successful_rounds, failed_attempts, duration_seconds,
      player_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
      -- "Player #N": the next number (a duplicate upload inserts nothing).
      (SELECT COALESCE(MAX(player_number), 0) + 1 FROM game_sessions))
  `);

  const insertAttempt = db.prepare(`
    INSERT INTO level_attempts (session_id, attempt_no, level, result, response_ms)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertFeatures = db.prepare(`
    INSERT INTO session_features
      (session_id, avg_reaction_sec, success_rate, highest_sequence_length, final_score)
    VALUES (?, ?, ?, ?, ?)
  `);

  const touchDevice = db.prepare(
    "UPDATE devices SET last_seen_at = CURRENT_TIMESTAMP WHERE device_id = ?"
  );

  // Everything below runs inside one transaction: all rows or none.
  const runInsert = db.transaction((rec) => {
    const result = insertGameSession.run(
      rec.session_id,
      rec.device_id,
      rec.outcome,
      rec.final_score,
      rec.highest_level_completed,
      rec.final_sequence_length,
      rec.successful_rounds,
      rec.failed_attempts,
      rec.duration_seconds
    );

    // changes === 0 means the session_id already existed: nothing else to do.
    if (result.changes === 0) {
      return { duplicate: true };
    }

    // attempt_no starts at 1 and follows the order sent by the ESP32.
    rec.attempts.forEach((attempt, index) => {
      insertAttempt.run(
        rec.session_id,
        index + 1,
        attempt.level,
        attempt.result,
        attempt.response_ms
      );
    });

    const features = computeFeatures(rec);
    insertFeatures.run(
      rec.session_id,
      features.avgReactionSec,
      features.successRate,
      features.highestSequenceLength,
      features.finalScore
    );

    touchDevice.run(rec.device_id);

    // -----------------------------------------------------------------
    // ML predictions. Any failure here is logged and ignored: a missing
    // model file must never lose a finished game.
    // -----------------------------------------------------------------
    const modelFeatures = {
      final_score: features.finalScore,
      avg_reaction_sec: features.avgReactionSec,
      highest_sequence_length: features.highestSequenceLength,
      success_rate: features.successRate,
    };

    try {
      const skillRank = predictSkill(modelFeatures);

      // Exclude this session: its own features were just inserted, and a
      // game must never be matched against itself.
      const animalMatch = matchAnimal(db, modelFeatures, rec.session_id);

      db.prepare(`
        INSERT INTO ml_predictions
          (session_id, skill_rank, animal, animal_iq, matched_session_id, model_versions)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        rec.session_id,
        skillRank,
        animalMatch.animal,
        animalMatch.iq,
        animalMatch.matchedSessionId,
        JSON.stringify(modelVersions())
      );

      return {
        duplicate: false,
        skillRank,
        animal: animalMatch.animal,
        animalIq: animalMatch.iq,
      };
    } catch (err) {
      console.error(
        `ML prediction failed for session ${rec.session_id}: ${err.message}`
      );

      return {
        duplicate: false,
        skillRank: null,
        animal: null,
        animalIq: null,
      };
    }
  });

  const saved = runInsert(record);

  if (saved.duplicate) {
    // A retry returns whatever was stored the first time.
    return { duplicate: true, ...readPrediction(db, record.session_id) };
  }

  return saved;
}

module.exports = { insertSession, computeFeatures };
