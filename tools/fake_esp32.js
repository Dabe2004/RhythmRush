// tools/fake_esp32.js
// Replays synthetic games from ml/data through POST /api/game-sessions,
// pretending to be a second ESP32 called SIM01.
//
// The games come from ml/data/games.csv and ml/data/attempts.csv. Each
// upload is a NEW session id, and pass/wrong response times are jittered
// by +-5 percent, so the backend sees fresh records instead of exact copies.
//
// Uses only Node built-ins and the global fetch of Node 22.
//
// Usage (from /backend):
//   npm run fake
//   npm run fake -- --count 20 --duplicate
//   node ../tools/fake_esp32.js --help

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

const USAGE = `Usage: node tools/fake_esp32.js [options]

Options:
  --count N      number of different games to upload   (default 20)
  --url URL      backend base URL                      (default http://localhost:3000)
  --key KEY      device API key                        (default SIM_API_KEY or dev-sim01-key)
  --device ID    device_id to send                     (default SIM01)
  --delay MS     wait between uploads in milliseconds  (default 0)
  --seed N       seed for selection and jitter         (default 42)
  --duplicate    resend the first record once to prove duplicates are ignored
  --help         show this help

Examples:
  npm run fake -- --count 20 --duplicate
  npm run fake -- --count 5 --url http://localhost:3100 --delay 200
`;

function parseNumber(name, value, { min = 0, integer = true } = {}) {
  const number = Number(value);

  if (!Number.isFinite(number) || (integer && !Number.isInteger(number)) || number < min) {
    throw new Error(`${name} must be an integer >= ${min} (got "${value}")`);
  }

  return number;
}

function parseArgs(argv) {
  const options = {
    count: 20,
    url: "http://localhost:3000",
    // The key is never printed. It only goes into the X-API-Key header.
    key: process.env.SIM_API_KEY || "dev-sim01-key",
    device: "SIM01",
    delay: 0,
    seed: 42,
    duplicate: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--duplicate") {
      options.duplicate = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`unknown argument "${arg}" (try --help)`);
    }

    // Support both "--count 5" and "--count=5".
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg : arg.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : arg.slice(equals + 1);
    const value = inlineValue !== undefined ? inlineValue : argv[++index];

    if (value === undefined) {
      throw new Error(`${name} needs a value (try --help)`);
    }

    switch (name) {
      case "--count":
        options.count = parseNumber("--count", value, { min: 1 });
        break;
      case "--url":
        options.url = value;
        break;
      case "--key":
        options.key = value;
        break;
      case "--device":
        options.device = value;
        break;
      case "--delay":
        options.delay = parseNumber("--delay", value, { min: 0 });
        break;
      case "--seed":
        options.seed = parseNumber("--seed", value, { min: 0 });
        break;
      default:
        throw new Error(`unknown option "${name}" (try --help)`);
    }
  }

  options.url = options.url.replace(/\/+$/, "");

  if (!options.url) throw new Error("--url must not be empty");
  if (!options.device) throw new Error("--device must not be empty");
  if (!options.key) throw new Error("--key must not be empty");

  return options;
}

// ---------------------------------------------------------------------------
// Small deterministic random generator (mulberry32)
// ---------------------------------------------------------------------------
// The same seed always picks the same games and produces the same jitter,
// so two runs with the same seed are reproducible (the session ids differ).
function createRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// CSV parsing (no package needed)
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  // Strip a UTF-8 BOM if the file has one.
  const input = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift();

  if (!header) return [];

  return rows
    // Skip an empty last line and any truncated row.
    .filter((cells) => cells.length === header.length && cells.some((cell) => cell !== ""))
    .map((cells) => {
      const record = {};
      header.forEach((name, index) => {
        record[name] = cells[index];
      });
      return record;
    });
}

function readCsvOrExit(fileName) {
  // __dirname is /tools, so this works from any working directory.
  const filePath = path.join(__dirname, "..", "ml", "data", fileName);

  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${fileName} at ${filePath}.`);
    console.error("Run this first: python ml/simulate_games.py");
    process.exit(1);
  }

  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

// ---------------------------------------------------------------------------
// Build one upload record from a games.csv row + its attempts.csv rows
// ---------------------------------------------------------------------------
function jitterResponseMs(responseMs, random) {
  // +-5 percent, still an integer. Timeouts are handled by the caller.
  const factor = 0.95 + random() * 0.10;
  return Math.max(0, Math.round(responseMs * factor));
}

function buildRecord({ device, sessionId, game, attempts, random }) {
  const requestAttempts = attempts.map((attempt) => {
    const result = attempt.result;
    const rawMs = Number(attempt.response_ms);

    // Timeouts always arrive as 0; only real presses are jittered.
    const responseMs =
      result === "timeout" ? 0 : jitterResponseMs(rawMs, random);

    return {
      level: Number(attempt.level),
      result,
      response_ms: responseMs,
    };
  });

  // Rough duration: real press time + 8 s of think/sequence time per attempt
  // + 5 s of menu/start time.
  const totalMs = requestAttempts.reduce((sum, attempt) => sum + attempt.response_ms, 0);
  const durationSeconds = Math.round(totalMs / 1000 + requestAttempts.length * 8 + 5);

  return {
    session_id: sessionId,
    device_id: device,
    outcome: game.outcome,
    final_score: Number(game.final_score),
    highest_level_completed: Number(game.successful_rounds),
    final_sequence_length: Number(game.highest_sequence_length),
    successful_rounds: Number(game.successful_rounds),
    failed_attempts: Number(game.failed_attempts),
    duration_seconds: durationSeconds,
    attempts: requestAttempts,
  };
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------
async function postSession(url, apiKey, record) {
  const response = await fetch(`${url}/api/game-sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(record),
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  let body = null;

  try {
    body = JSON.parse(text);
  } catch (err) {
    // Not JSON (for example a proxy error page). Keep the raw text short.
    body = { raw: text.slice(0, 120) };
  }

  return { status: response.status, body };
}

function formatPrediction(body) {
  const skill = body && body.skill_rank !== undefined ? String(body.skill_rank) : "null";
  const animal = body && body.animal !== undefined ? String(body.animal) : "null";
  const iq = body && body.animal_iq !== undefined ? String(body.animal_iq) : "null";
  return `${skill} / ${animal} / ${iq}`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let options;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  const games = readCsvOrExit("games.csv");
  const attemptRows = readCsvOrExit("attempts.csv");

  // Group attempts by session so each game gets its own list, in file order.
  const attemptsBySession = new Map();
  for (const attempt of attemptRows) {
    if (!attemptsBySession.has(attempt.session_id)) {
      attemptsBySession.set(attempt.session_id, []);
    }
    attemptsBySession.get(attempt.session_id).push(attempt);
  }

  if (options.count > games.length) {
    console.error(
      `Asked for ${options.count} games but ml/data/games.csv only has ${games.length}.`
    );
    process.exit(1);
  }

  const random = createRandom(options.seed);

  // Partial Fisher-Yates: N different games, same order for the same seed.
  const indices = games.map((unused, index) => index);
  for (let index = 0; index < options.count; index += 1) {
    const swapWith = index + Math.floor(random() * (indices.length - index));
    const temporary = indices[index];
    indices[index] = indices[swapWith];
    indices[swapWith] = temporary;
  }
  const chosen = indices.slice(0, options.count);

  // A time-based base keeps session ids unique between runs. The seed only
  // controls which games are replayed, not the ids.
  const idBase = (Date.now() + process.pid * 7919) % 1000000000;
  const sessionIds = chosen.map((unused, index) => {
    return `${options.device}-${String((idBase + index) % 1000000000).padStart(9, "0")}`;
  });

  let sent = 0;
  let saved = 0;
  let duplicates = 0;
  let failed = 0;
  let firstRecord = null;

  for (let index = 0; index < chosen.length; index += 1) {
    const game = games[chosen[index]];
    const attempts = attemptsBySession.get(game.session_id) || [];
    const record = buildRecord({
      device: options.device,
      sessionId: sessionIds[index],
      game,
      attempts,
      random,
    });

    if (firstRecord === null) firstRecord = record;

    let result;

    try {
      result = await postSession(options.url, options.key, record);
    } catch (err) {
      // Connection refused, DNS failure, timeout: never print a stack trace.
      console.error(`Server not reachable at ${options.url}. Start it with: cd backend; npm start`);
      process.exit(1);
    }

    sent += 1;

    if (result.status === 201) {
      saved += 1;
      console.log(
        `[${String(index + 1).padStart(2)}/${chosen.length}] ${record.session_id}  ${result.status}  ${formatPrediction(result.body)}`
      );
    } else if (result.status === 200 && result.body && result.body.duplicate === true) {
      duplicates += 1;
      console.log(
        `[${String(index + 1).padStart(2)}/${chosen.length}] ${record.session_id}  ${result.status} duplicate  ${formatPrediction(result.body)}`
      );
    } else {
      failed += 1;
      const reason =
        result.body && result.body.error
          ? result.body.error
          : JSON.stringify(result.body);
      console.log(
        `[${String(index + 1).padStart(2)}/${chosen.length}] ${record.session_id}  ${result.status}  FAILED (${reason})`
      );
    }

    // Pause only when another request follows.
    const moreUploads = index < chosen.length - 1 || options.duplicate;
    if (moreUploads && options.delay > 0) {
      await sleep(options.delay);
    }
  }

  let duplicateCheckFailed = false;

  if (options.duplicate && firstRecord) {
    let result;

    try {
      result = await postSession(options.url, options.key, firstRecord);
    } catch (err) {
      console.error(`Server not reachable at ${options.url}. Start it with: cd backend; npm start`);
      process.exit(1);
    }

    sent += 1;

    if (result.status === 200 && result.body && result.body.duplicate === true) {
      duplicates += 1;
      console.log(
        `Duplicate resend: ${firstRecord.session_id}  ${result.status}  answer was a duplicate (OK)`
      );
    } else {
      failed += 1;
      duplicateCheckFailed = true;
      console.error(
        `Duplicate resend: ${firstRecord.session_id}  ${result.status}  expected 200 {duplicate:true}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("");
  console.log(
    `Sent ${sent}, saved ${saved}, duplicates ${duplicates}, failed ${failed}.`
  );

  if (options.device === "SIM01") {
    console.log("Fake games use device SIM01.");
  } else {
    console.log(`Warning: this run used device ${options.device}, not SIM01.`);
  }
  console.log("Remove fake games with: npm run fake:clear -- --yes");

  if (failed > 0 || duplicateCheckFailed) {
    process.exit(1);
  }
}

main().catch((err) => {
  // Last resort: no stack trace for expected problems.
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
