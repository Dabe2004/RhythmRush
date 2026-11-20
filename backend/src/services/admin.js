// backend/src/services/admin.js
// SQL and file reads for the admin API (/api/admin/*).
//
// Same rules as queries.js: the database is the FIRST argument (tests pass
// ":memory:"), and every value - including LIMIT and the time window - is a
// bound ? parameter. Nothing is ever pasted into an SQL string.

const fs = require("fs");
const path = require("path");

const { getStatsSummary } = require("./queries");

// The fake uploader (/tools/fake_esp32.js) uses this device. Its games count
// as synthetic, together with any row that has is_synthetic = 1.
const SIMULATED_DEVICE_ID = "SIM01";

// "Online" means the device uploaded a game or asked for difficulty within
// this window. SQLite understands the modifier text "-10 minutes".
const ONLINE_WINDOW = "-10 minutes";

const RECENT_SESSIONS_LIMIT = 20;

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
function getDevices(db) {
  // api_key_hash is deliberately NOT selected.
  const rows = db
    .prepare(`
      SELECT
        d.device_id,
        d.name,
        d.last_seen_at,
        (SELECT COUNT(*) FROM game_sessions g WHERE g.device_id = d.device_id) AS games_count,
        CASE
          WHEN d.last_seen_at IS NOT NULL AND d.last_seen_at >= datetime('now', ?)
          THEN 1 ELSE 0
        END AS is_online
      FROM devices AS d
      ORDER BY d.device_id ASC
    `)
    .all(ONLINE_WINDOW);

  // SQLite has no booleans: turn 0/1 into false/true for the API.
  return rows.map((row) => ({ ...row, is_online: row.is_online === 1 }));
}

function getGameCounts(db) {
  const row = db
    .prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN is_synthetic = 1 OR device_id = ? THEN 1 ELSE 0 END), 0) AS synthetic,
        COUNT(*) AS total
      FROM game_sessions
    `)
    .get(SIMULATED_DEVICE_ID);

  return { real: row.total - row.synthetic, synthetic: row.synthetic };
}

function getRecentSessions(db, limit = RECENT_SESSIONS_LIMIT) {
  // rowid breaks ties inside the same second (same rule as /latest).
  return db
    .prepare(`
      SELECT session_id, device_id, final_score, nickname, received_at
      FROM game_sessions
      ORDER BY received_at DESC, rowid DESC
      LIMIT ?
    `)
    .all(limit);
}

function getAdminOverview(db) {
  return {
    ...getStatsSummary(db),
    devices: getDevices(db),
    game_counts: getGameCounts(db),
    recent_sessions: getRecentSessions(db),
  };
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------
// nickname: a validated string, or null to clear it.
// Returns false when the session does not exist.
function overwriteNickname(db, sessionId, nickname) {
  const result = db
    .prepare("UPDATE game_sessions SET nickname = ? WHERE session_id = ?")
    .run(nickname, sessionId);

  return result.changes === 1;
}

// One game. ON DELETE CASCADE removes its attempts, features and prediction
// (db.js switches foreign_keys on for every connection).
function deleteSession(db, sessionId) {
  return db.prepare("DELETE FROM game_sessions WHERE session_id = ?").run(sessionId).changes;
}

function deviceExists(db, deviceId) {
  return Boolean(db.prepare("SELECT 1 FROM devices WHERE device_id = ?").get(deviceId));
}

// Every game of one device, in one transaction. last_seen_at is reset, the
// same as tools/clear_fake.js does, so the device looks unused afterwards.
function deleteSessionsOfDevice(db, deviceId) {
  const run = db.transaction(() => {
    const deleted = db
      .prepare("DELETE FROM game_sessions WHERE device_id = ?")
      .run(deviceId).changes;

    db.prepare("UPDATE devices SET last_seen_at = NULL WHERE device_id = ?").run(deviceId);

    return deleted;
  });

  return run();
}

// ---------------------------------------------------------------------------
// Model files (backend/artifacts)
// ---------------------------------------------------------------------------
const MODEL_FILES = [
  { name: "difficulty", file: "difficulty.json" },
  { name: "skill", file: "skill.json" },
  { name: "animal", file: "animal.json" },
];

// animal.json is ~340 kB. Parsing it on every dashboard refresh is wasteful,
// so the summary is cached until the file's size or modification time changes.
const summaryCache = new Map();

// Only small, safe metadata. The animal reference rows are NEVER returned.
function summarize(name, data) {
  if (name === "difficulty") {
    return { intercept: data.intercept ?? null, weights: data.weights ?? null };
  }
  if (name === "skill") {
    return {
      features: Array.isArray(data.features) ? data.features : null,
      node_count: Array.isArray(data.nodes) ? data.nodes.length : null,
    };
  }
  // animal
  return {
    features: Array.isArray(data.features) ? data.features : null,
    reference_rows: Array.isArray(data.rows) ? data.rows.length : null,
    tiers: Array.isArray(data.tiers) ? data.tiers : null,
  };
}

function describeModel(dir, { name, file }) {
  const fullPath = path.join(dir, file);

  let stat;
  try {
    stat = fs.statSync(fullPath);
  } catch {
    return { name, file, error: "missing" };
  }

  const base = {
    name,
    file,
    size_bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
  };

  const cacheKey = `${fullPath}|${stat.size}|${stat.mtimeMs}`;
  if (summaryCache.has(cacheKey)) {
    return { ...base, ...summaryCache.get(cacheKey) };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch {
    return { ...base, error: "invalid_json" };
  }

  if (data === null || typeof data !== "object") {
    return { ...base, error: "invalid_json" };
  }

  const summary = { version: data.version ?? null, ...summarize(name, data) };
  summaryCache.set(cacheKey, summary);

  return { ...base, ...summary };
}

function getModelsInfo(dir) {
  return { models: MODEL_FILES.map((model) => describeModel(dir, model)) };
}

module.exports = {
  SIMULATED_DEVICE_ID,
  getAdminOverview,
  getDevices,
  getGameCounts,
  getRecentSessions,
  overwriteNickname,
  deleteSession,
  deviceExists,
  deleteSessionsOfDevice,
  getModelsInfo,
};
