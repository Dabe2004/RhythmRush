// tools/moderate.js
// Laptop-only moderation for the exhibition (replaces the old back-office page).
// It opens the database directly, like db/seed.js: nothing is exposed on the
// network, so only someone at the laptop can use it.
//
// Usage (from /backend):  npm run moderate -- <command> [args]
//   list                         latest 20 games
//   clear-nickname <session_id>  [--yes]
//   delete-game <session_id>     [--yes] [--confirm <session_id>]  (real devices need --confirm)
//   block-add <word>             add a word to backend/blocklist.txt
//   block-list                   show the blocklist

const fs = require("fs");

const USAGE = `Usage: node tools/moderate.js <command> [args]

Commands:
  list                          latest 20 games (id, nickname, score, device)
  clear-nickname <session_id>   remove a nickname (the player can set a new one)
  delete-game <session_id>      delete one game with its attempts and predictions
  block-add <word>              refuse nicknames containing <word> from now on
  block-list                    show the blocked words

Options:
  --yes                 actually change the database (without it: dry run)
  --confirm <session_id> required by delete-game for a real device (not SIM01):
                        type the session id a second time, exactly
`;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readArg(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

const argv = process.argv.slice(2);
const positional = argv.filter((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--confirm");
const [command, target] = positional;
const confirmed = argv.includes("--yes");

if (!command || argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(command ? 0 : 1);
}

// Blocklist commands need no database.
if (command === "block-list" || command === "block-add") {
  const { BLOCKLIST_FILE } = require("../backend/src/services/nickname");
  const text = fs.existsSync(BLOCKLIST_FILE) ? fs.readFileSync(BLOCKLIST_FILE, "utf8") : "";
  const words = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

  if (command === "block-list") {
    console.log(`${words.length} blocked word(s) in ${BLOCKLIST_FILE}:`);
    console.log(words.join(", "));
    process.exit(0);
  }

  const word = String(target ?? "").trim().toLowerCase();
  if (!/^[a-z]{2,16}$/.test(word)) fail("block-add needs one word of 2-16 letters a-z, e.g. block-add pangit");
  if (words.includes(word)) {
    console.log(`"${word}" is already blocked.`);
    process.exit(0);
  }
  fs.appendFileSync(BLOCKLIST_FILE, `${text === "" || text.endsWith("\n") ? "" : "\n"}${word}\n`);
  console.log(`Added "${word}". The running server picks it up on the next nickname (no restart).`);
  console.log("Existing nicknames are not checked again: use list and clear-nickname for those.");
  process.exit(0);
}

let db;
try {
  db = require("../backend/src/db");
  db.prepare("SELECT 1 FROM game_sessions LIMIT 1").get();
} catch (err) {
  fail(`Cannot open the game database (${err.message}). Run "npm run migrate" in /backend first.`);
}

function findGame(sessionId) {
  if (!sessionId) fail(`${command} needs a session id. Run "list" to see them.`);
  const game = db
    .prepare("SELECT session_id, device_id, nickname, final_score FROM game_sessions WHERE session_id = ?")
    .get(sessionId);
  if (!game) fail(`No game with session id "${sessionId}". Run "list" to see the latest ids.`);
  return game;
}

function describe(game) {
  return `${game.session_id} (device ${game.device_id ?? "-"}, score ${game.final_score}, nickname ${game.nickname ?? "-"})`;
}

if (command === "list") {
  const rows = db
    .prepare(
      `SELECT session_id, nickname, final_score, device_id FROM game_sessions
       ORDER BY received_at DESC, rowid DESC LIMIT 20`
    )
    .all();
  if (rows.length === 0) console.log("No games yet.");
  for (const row of rows) {
    console.log(
      `${row.session_id.padEnd(16)} ${(row.nickname ?? "-").padEnd(17)} ${String(row.final_score).padStart(6)}  ${row.device_id ?? "-"}`
    );
  }
} else if (command === "clear-nickname") {
  const game = findGame(target);
  if (game.nickname === null) {
    console.log(`${game.session_id} has no nickname. Nothing to do.`);
  } else if (!confirmed) {
    console.log(`WOULD clear the nickname "${game.nickname}" of ${describe(game)}.`);
    console.log("Nothing was changed. Re-run with --yes to clear it.");
  } else {
    db.prepare("UPDATE game_sessions SET nickname = NULL WHERE session_id = ?").run(game.session_id);
    console.log(`Cleared the nickname of ${game.session_id}. The player can set a new one.`);
  }
} else if (command === "delete-game") {
  const game = findGame(target);
  const realDevice = game.device_id !== "SIM01";
  if (!confirmed) {
    console.log(`WOULD delete ${describe(game)} with its attempts, features and prediction.`);
    console.log(
      realDevice
        ? `This is a real game. Re-run with --yes --confirm ${game.session_id} to delete it.`
        : "Nothing was changed. Re-run with --yes to delete it."
    );
  } else if (realDevice && readArg(argv, "--confirm") !== game.session_id) {
    fail(`${game.session_id} is a real game: add --confirm ${game.session_id} (typed exactly) to delete it.`);
  } else {
    // ON DELETE CASCADE removes the attempts, features and prediction.
    db.prepare("DELETE FROM game_sessions WHERE session_id = ?").run(game.session_id);
    console.log(`Deleted ${describe(game)}.`);
  }
} else {
  fail(`Unknown command "${command}".\n\n${USAGE}`);
}
