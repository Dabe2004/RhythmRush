// backend/src/db.js
// Opens the SQLite database and exports the connection.
//
// The path comes from DB_PATH in backend/.env and is resolved relative to
// the /backend folder, so `node src/server.js` and `node ../db/migrate.js`
// both use the same file.
//
// DB_PATH=":memory:" is supported (the tests use it).

const fs = require("fs");
const path = require("path");

// Load backend/.env no matter which folder the command was started from.
// quiet: no "injected env" banner on every start (it never printed values,
// only a count, but it cluttered the logs).
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
  quiet: true,
});

const Database = require("better-sqlite3");

// The /backend folder (this file lives in /backend/src).
const BACKEND_DIR = path.join(__dirname, "..");

// Default matches .env.example: ./data/rhythm.db relative to /backend.
const rawPath = process.env.DB_PATH || "./data/rhythm.db";

let dbFile;

if (rawPath === ":memory:") {
  // In-memory database: nothing on disk, nothing to create.
  dbFile = ":memory:";
} else {
  // Make an absolute path, relative to /backend when DB_PATH is relative.
  dbFile = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(BACKEND_DIR, rawPath);

  // better-sqlite3 does not create folders, so do it here.
  const dir = path.dirname(dbFile);
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbFile);

// Required project settings (see AGENTS.md).
// foreign_keys must be set per connection, otherwise ON DELETE CASCADE is off.
db.pragma("foreign_keys = ON");
// WAL keeps reads fast while a write happens. ":memory:" ignores this safely.
db.pragma("journal_mode = WAL");

module.exports = db;
