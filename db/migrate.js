// db/migrate.js
// Applies every .sql file in /db/migrations in filename order.
//
// - Applied files are tracked in the schema_migrations table, so running this
//   twice does nothing the second time.
// - Each file runs inside its own transaction: either the whole file is
//   applied or nothing from it is.
//
// Two ways to use it:
//   1. CLI (from /backend):  npm run migrate
//   2. From code/tests:      const { runMigrations } = require("../../db/migrate");
//                            runMigrations(someDb);
//
// Exported so the tests can migrate their own ":memory:" database.

const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

/**
 * Apply all pending migrations to the given database.
 *
 * @param {import("better-sqlite3").Database} db an open better-sqlite3 database
 * @returns {{applied: string[], skipped: string[]}} which files ran and which were skipped
 */
function runMigrations(db) {
  // Bookkeeping table. Created once, safe to run every time.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 1. List all .sql files, sorted by filename (001_, 002_, ...).
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  // 2. Look up which files were already applied.
  const alreadyApplied = new Set(
    db.prepare("SELECT filename FROM schema_migrations").all().map((row) => row.filename)
  );

  // Prepared statement reused for every file.
  const recordMigration = db.prepare(
    "INSERT INTO schema_migrations (filename) VALUES (?)"
  );

  const applied = [];
  const skipped = [];

  // 3. Apply the new files.
  for (const filename of files) {
    if (alreadyApplied.has(filename)) {
      skipped.push(filename);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");

    // db.transaction() gives us BEGIN/COMMIT and rolls back on any error.
    const runFile = db.transaction(() => {
      db.exec(sql);
      recordMigration.run(filename);
    });

    runFile();
    applied.push(filename);
  }

  return { applied, skipped };
}

// ---------------------------------------------------------------------------
// CLI entry point: only runs when this file is executed directly
// (`node ../db/migrate.js`), not when a test requires it.
// ---------------------------------------------------------------------------
if (require.main === module) {
  // The connection comes from the backend folder, so npm packages
  // (better-sqlite3, dotenv) resolve from /backend/node_modules.
  // /db has no node_modules of its own.
  const db = require("../backend/src/db");

  const { applied, skipped } = runMigrations(db);

  for (const filename of applied) {
    console.log(`apply ${filename}`);
  }
  for (const filename of skipped) {
    console.log(`skip  ${filename} (already applied)`);
  }

  if (applied.length === 0 && skipped.length === 0) {
    console.log("No migration files found in", MIGRATIONS_DIR);
  }

  console.log(
    `\nDone. ${applied.length} file(s) applied, ${skipped.length} skipped.`
  );
}

module.exports = { runMigrations };
