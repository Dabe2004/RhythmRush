// backend/src/services/queries.js
// All read-mostly SQL for the public endpoints.
//
// Every function takes the database as its FIRST argument, so the tests can
// pass their own in-memory database.
//
// Rules (AGENTS.md): prepared statements with ? placeholders only. No value
// is ever pasted into the SQL string, including LIMIT.

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------
// RANK() only uses final_score, so equal scores share a rank (1, 2, 2, 4).
// The outer ORDER BY adds tie-breakers so the page order is stable, and
// limit is a bound parameter.
function getLeaderboard(db, limit) {
  return db
    .prepare(`
      SELECT
        RANK() OVER (ORDER BY g.final_score DESC) AS rank,
        g.session_id,
        g.nickname,
        g.final_score,
        g.highest_level_completed,
        g.outcome,
        p.skill_rank,
        p.animal,
        p.animal_iq,
        g.received_at
      FROM game_sessions AS g
      LEFT JOIN ml_predictions AS p ON p.session_id = g.session_id
      ORDER BY
        g.final_score DESC,
        g.highest_level_completed DESC,
        g.received_at ASC,
        g.session_id ASC
      LIMIT ?
    `)
    .all(limit);
}

// ---------------------------------------------------------------------------
// Latest finished games (newest first)
// ---------------------------------------------------------------------------
// rowid breaks ties when two rows share the same received_at (SQLite timestamps
// have one-second precision), so the most recently inserted row wins.
function getRecentSessions(db, limit) {
  return db
    .prepare(`
      SELECT session_id, nickname, final_score, highest_level_completed,
             outcome, received_at
      FROM game_sessions
      ORDER BY received_at DESC, rowid DESC
      LIMIT ?
    `)
    .all(limit);
}

function getLatestSession(db) {
  return getRecentSessions(db, 1)[0] ?? null;
}

// ---------------------------------------------------------------------------
// One session: row + attempts + features + prediction
// ---------------------------------------------------------------------------
function getSessionDetail(db, sessionId) {
  const session = db
    .prepare("SELECT * FROM game_sessions WHERE session_id = ?")
    .get(sessionId);

  if (!session) return null;

  const attempts = db
    .prepare(
      "SELECT * FROM level_attempts WHERE session_id = ? ORDER BY attempt_no ASC"
    )
    .all(sessionId);

  const features = db
    .prepare("SELECT * FROM session_features WHERE session_id = ?")
    .get(sessionId) || null;

  const predictionRow = db
    .prepare(`
      SELECT skill_rank, animal, animal_iq, matched_session_id, model_versions
      FROM ml_predictions
      WHERE session_id = ?
    `)
    .get(sessionId);

  let prediction = null;

  if (predictionRow) {
    prediction = {
      skill_rank: predictionRow.skill_rank,
      animal: predictionRow.animal,
      animal_iq: predictionRow.animal_iq,
      matched_session_id: predictionRow.matched_session_id,
      // model_versions is JSON text in SQLite; the API returns an object.
      model_versions: parseJsonColumn(predictionRow.model_versions),
    };
  }

  return { session, attempts, features, prediction };
}

// JSON columns are TEXT in SQLite. Broken text becomes null instead of
// crashing the endpoint.
function parseJsonColumn(text) {
  if (text === null || text === undefined) return null;

  try {
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Nickname (set once)
// ---------------------------------------------------------------------------
// Returns:
//   { status: "not_found" }
//   { status: "already_set", nickname }
//   { status: "ok", nickname }
function setNickname(db, sessionId, nickname) {
  const run = db.transaction(() => {
    const row = db
      .prepare("SELECT nickname FROM game_sessions WHERE session_id = ?")
      .get(sessionId);

    if (!row) {
      return { status: "not_found" };
    }

    // A nickname can only be set once; only tools/moderate.js (on the laptop)
    // can clear it.
    if (row.nickname !== null) {
      return { status: "already_set", nickname: row.nickname };
    }

    db.prepare("UPDATE game_sessions SET nickname = ? WHERE session_id = ?").run(
      nickname,
      sessionId
    );

    return { status: "ok", nickname };
  });

  return run();
}

// ---------------------------------------------------------------------------
// Stats summary
// ---------------------------------------------------------------------------
// 13 bins of 1000 points: 0-999, 1000-1999, ... 12000-12999.
const HISTOGRAM_WIDTH = 1000;
const HISTOGRAM_BINS = 13;

const SKILL_LABELS = ["Beginner", "Intermediate", "Pro"];
const ANIMAL_LABELS = [
  "Chimpanzee",
  "Bottlenose Dolphin",
  "Elephant",
  "Orangutan",
  "Pig",
];

function getStatsSummary(db) {
  const totals = db
    .prepare(`
      SELECT
        COUNT(*)            AS total_games,
        AVG(final_score)    AS average_score,
        MAX(final_score)    AS max_score
      FROM game_sessions
    `)
    .get();

  const total = Number(totals.total_games);

  // Outcomes, with both keys always present.
  const outcomes = { game_over: 0, win: 0 };
  for (const row of db
    .prepare("SELECT outcome, COUNT(*) AS c FROM game_sessions GROUP BY outcome")
    .all()) {
    if (row.outcome in outcomes) {
      outcomes[row.outcome] = Number(row.c);
    }
  }

  // Histogram, empty bins included.
  const histogram = [];
  for (let index = 0; index < HISTOGRAM_BINS; index += 1) {
    histogram.push({
      min: index * HISTOGRAM_WIDTH,
      max: index * HISTOGRAM_WIDTH + HISTOGRAM_WIDTH - 1,
      count: 0,
    });
  }

  for (const row of db.prepare("SELECT final_score FROM game_sessions").all()) {
    // Scores outside 0..12999 (should not happen) fall into the edge bins.
    const index = Math.min(
      HISTOGRAM_BINS - 1,
      Math.max(0, Math.floor(Number(row.final_score) / HISTOGRAM_WIDTH))
    );

    histogram[index].count += 1;
  }

  // Predictions, with every label present.
  const skillCounts = {};
  for (const label of SKILL_LABELS) skillCounts[label] = 0;

  for (const row of db
    .prepare("SELECT skill_rank, COUNT(*) AS c FROM ml_predictions GROUP BY skill_rank")
    .all()) {
    if (row.skill_rank in skillCounts) {
      skillCounts[row.skill_rank] = Number(row.c);
    }
  }

  const animalCounts = {};
  for (const label of ANIMAL_LABELS) animalCounts[label] = 0;

  for (const row of db
    .prepare("SELECT animal, COUNT(*) AS c FROM ml_predictions GROUP BY animal")
    .all()) {
    if (row.animal in animalCounts) {
      animalCounts[row.animal] = Number(row.c);
    }
  }

  return {
    total_games: total,
    // One decimal, or null when there is nothing to average.
    average_score:
      totals.average_score === null
        ? null
        : Math.round(Number(totals.average_score) * 10) / 10,
    max_score: totals.max_score === null ? null : Number(totals.max_score),
    win_rate: total === 0 ? null : outcomes.win / total,
    outcomes,
    score_histogram: histogram,
    skill_counts: skillCounts,
    animal_counts: animalCounts,
  };
}

module.exports = {
  getLeaderboard,
  getLatestSession,
  getRecentSessions,
  getSessionDetail,
  setNickname,
  getStatsSummary,
  SKILL_LABELS,
  ANIMAL_LABELS,
};
