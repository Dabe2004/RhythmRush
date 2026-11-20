-- 001_init.sql
-- Initial schema for Rhythm Rush (SQLite).
-- Rules (see AGENTS.md): only TEXT / INTEGER / REAL, booleans are 0/1,
-- JSON is stored as TEXT, timestamps are TEXT with a default.
-- The migration runner (/db/migrate.js) wraps this file in a transaction.

-- One row per physical ESP32 device.
-- We never store the raw API key, only its SHA-256 hash.
CREATE TABLE devices (
  device_id    TEXT PRIMARY KEY,               -- e.g. 'RR01'
  name         TEXT,                           -- human friendly name
  api_key_hash TEXT NOT NULL,                  -- sha256 hex of the device API key
  last_seen_at TEXT                            -- updated when the device uploads
);

-- One row per finished game uploaded by a device.
CREATE TABLE game_sessions (
  session_id               TEXT PRIMARY KEY,   -- e.g. 'RR01-000127'
  device_id                TEXT REFERENCES devices(device_id),
  outcome                  TEXT,               -- 'win' or 'game_over'
  final_score              INTEGER,
  highest_level_completed  INTEGER,
  final_sequence_length    INTEGER,
  successful_rounds        INTEGER,
  failed_attempts          INTEGER,
  duration_seconds         INTEGER,
  nickname                 TEXT,               -- optional player nickname
  is_synthetic             INTEGER DEFAULT 0,  -- 0 = real upload, 1 = fake/synthetic
  received_at              TEXT DEFAULT CURRENT_TIMESTAMP
);

-- One row per level attempt inside a session.
-- Deleting a session deletes its attempts (ON DELETE CASCADE).
CREATE TABLE level_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT REFERENCES game_sessions(session_id) ON DELETE CASCADE,
  attempt_no  INTEGER,                         -- 1-based order of the attempt in the session
  level       INTEGER,
  result      TEXT,                            -- 'pass', 'wrong' or 'timeout'
  response_ms INTEGER
);

-- The 4 model features for a finished session.
-- Values are computed once from the session + attempts and stored here.
CREATE TABLE session_features (
  session_id              TEXT PRIMARY KEY REFERENCES game_sessions(session_id) ON DELETE CASCADE,
  avg_reaction_sec        REAL,
  success_rate            REAL,
  highest_sequence_length INTEGER,
  final_score             INTEGER
);

-- Model output for a session (skill classifier + animal matcher).
-- model_versions is JSON text, e.g. {"skill":1,"animal":1,"difficulty":1}.
CREATE TABLE ml_predictions (
  session_id         TEXT PRIMARY KEY REFERENCES game_sessions(session_id) ON DELETE CASCADE,
  skill_rank         TEXT,                     -- 'Beginner' | 'Intermediate' | 'Pro'
  animal             TEXT,                     -- e.g. 'Chimpanzee'
  animal_iq          INTEGER,
  matched_session_id TEXT,                     -- nearest neighbor row id
  model_versions     TEXT                      -- JSON text
);

-- Simple key/value settings (animal tiers, feature flags, ...).
-- Values are TEXT; JSON is stored with JSON.stringify.
CREATE TABLE app_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Leaderboard queries sort by score, highest first.
CREATE INDEX idx_game_sessions_final_score ON game_sessions(final_score DESC);

-- Loading all attempts of one session is a common read.
CREATE INDEX idx_level_attempts_session_id ON level_attempts(session_id);
