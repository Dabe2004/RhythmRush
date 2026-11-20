// tools/clear_fake.js
// Deletes the fake games uploaded by /tools/fake_esp32.js (device SIM01).
//
// Children (attempts, features, predictions) are removed by ON DELETE CASCADE;
// backend/src/db.js sets PRAGMA foreign_keys = ON on every connection.
//
// Safety: the script refuses any --device value other than SIM01, so real
// RR01 games can never be deleted by accident. Without --yes it only counts.
//
// Usage (from /backend):
//   npm run fake:clear                  (dry run: shows how many WOULD be deleted)
//   npm run fake:clear -- --yes         (deletes them)
//   npm run fake:clear -- --device RR01 (refused)

const USAGE = `Usage: node tools/clear_fake.js [--yes] [--device SIM01]

Options:
  --yes        actually delete the fake sessions (without it: dry run)
  --device ID  must be SIM01; anything else is refused
  --help       show this help
`;

function readArg(argv, name) {
  // Supports "--device SIM01" and "--device=SIM01".
  const prefix = `${name}=`;

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) return argv[index + 1];
    if (argv[index].startsWith(prefix)) return argv[index].slice(prefix.length);
  }

  return undefined;
}

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const device = readArg(argv, "--device") ?? "SIM01";
const confirmed = argv.includes("--yes");

if (device !== "SIM01") {
  console.error(
    `Refusing to delete device "${device}": this script only clears fake games (SIM01).`
  );
  process.exit(1);
}

// Same pattern as /db/seed.js: the only database connection comes from the
// backend, which also loads backend/.env (including a DB_PATH override).
const db = require("../backend/src/db");

// ---------------------------------------------------------------------------
// Count first, so the dry run and the real run report the same number
// ---------------------------------------------------------------------------
const count = db
  .prepare("SELECT COUNT(*) AS count FROM game_sessions WHERE device_id = ?")
  .get(device).count;

if (!confirmed) {
  console.log(
    `${count} session(s) for device ${device} WOULD be deleted (plus their attempts, features, and predictions).`
  );
  console.log("Nothing was changed. Re-run with --yes to delete them.");
  process.exit(0);
}

// One transaction: either the games go and last_seen_at is reset, or nothing
// changes. The DELETE cascades to level_attempts, session_features, and
// ml_predictions.
const clear = db.transaction(() => {
  const result = db
    .prepare("DELETE FROM game_sessions WHERE device_id = ?")
    .run(device);

  db.prepare("UPDATE devices SET last_seen_at = NULL WHERE device_id = ?").run(
    device
  );

  return result.changes;
});

const deleted = clear();

console.log(`Deleted ${deleted} session(s) for device ${device}.`);
