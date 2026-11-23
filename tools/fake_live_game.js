// tools/fake_live_game.js
// Acts like the ESP32 in real time: sends live events (docs/LIVE_PROTOCOL.md)
// while it "plays", then uploads the finished game with the SAME session_id.
// Rules and timing come from docs/game_rules.json (python ml/export_rules.py),
// so no game formula is copied here. Uses device SIM01, so
// tools/clear_fake.js removes its games.
//
//   node tools/fake_live_game.js --skill average --speed 2
//   node tools/fake_live_game.js --help

const fs = require("fs");
const path = require("path");

const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "game_rules.json"), "utf8"));
const T = RULES.timing_ms;

const USAGE = `Usage: node tools/fake_live_game.js [options]

  --url URL                 server (default http://localhost:3000)
  --device ID               default SIM01
  --key KEY                 device key (default: SIM_API_KEY or the dev SIM01 key)
  --skill fast|average|sloppy   default average
  --games N                 games in a row (default 1)
  --seed N                  random seed (default 42)
  --speed X                 time multiplier, 2 = twice as fast (default 1)
  --reset-at N              hold START during attempt N: back to idle (no upload), then START again
  --latency-ms N            delay every batch by N ms (+-30 %)
  --spike                   sometimes delay a batch by 2-4 s
  --help
`;

// Per-press time (ms) and mistake chances per press.
const SKILLS = {
  fast: { minMs: 300, maxMs: 650, wrong: 0.008, timeout: 0.002 },
  average: { minMs: 550, maxMs: 1300, wrong: 0.035, timeout: 0.01 },
  sloppy: { minMs: 800, maxMs: 2100, wrong: 0.1, timeout: 0.04 },
};
const IMMEDIATE = new Set(["control_pressed", "countdown_started", "playback_started", "game_finished"]);

function parseArgs(argv) {
  const o = {
    url: "http://localhost:3000",
    device: "SIM01",
    key: process.env.SIM_API_KEY || "dev-sim01-key",
    skill: "average",
    games: 1,
    seed: 42,
    speed: 1,
    resetAt: null,
    latencyMs: 0,
    spike: false,
  };
  const value = (i) => {
    if (argv[i + 1] === undefined) throw new Error(`${argv[i]} needs a value`);
    return argv[i + 1];
  };
  const number = (i, min) => {
    const n = Number(value(i));
    if (!Number.isFinite(n) || n < min) throw new Error(`${argv[i]} must be a number >= ${min}`);
    return n;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--spike") o.spike = true;
    else if (a === "--url") o.url = value(i++).replace(/\/+$/, "");
    else if (a === "--device") o.device = value(i++);
    else if (a === "--key") o.key = value(i++);
    else if (a === "--skill") {
      o.skill = value(i++);
      if (!SKILLS[o.skill]) throw new Error("--skill must be fast, average or sloppy");
    } else if (a === "--games") o.games = Math.floor(number(i++, 1));
    else if (a === "--seed") o.seed = Math.floor(number(i++, 0));
    else if (a === "--speed") o.speed = number(i++, 0.1);
    else if (a === "--reset-at") o.resetAt = Math.floor(number(i++, 1));
    else if (a === "--latency-ms") o.latencyMs = number(i++, 0);
    else throw new Error(`Unknown option ${a}`);
  }
  return o;
}

// Same tiny seeded generator as fake_esp32.js (mulberry32).
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speedBonus(level, responseMs) {
  const steps = RULES.levels[level - 1].speed_bonus_steps;
  let bonus = 0;
  for (const [fromMs, value] of steps) if (fromMs <= responseMs) bonus = value;
  return bonus;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class FriendlyError extends Error {}

function createDevice(o) {
  const random = createRandom(o.seed);
  const skill = SKILLS[o.skill];
  const stamp = Date.now().toString(36);
  let gameCounter = 0;
  let deviceStart = Date.now();
  let outbox = [];
  let sending = Promise.resolve();
  const stats = { batches: 0, events: 0, dropped: 0, unreachable: 0 };

  const wait = (deviceMs) => sleep(deviceMs / o.speed);
  const tMs = () => Math.round((Date.now() - deviceStart) * o.speed);
  const between = (min, max) => Math.round(min + random() * (max - min));
  const newGameId = () => `${o.device}-L-${stamp}-${++gameCounter}`;

  function latency() {
    let ms = o.latencyMs * (0.7 + 0.6 * random());
    if (o.spike && random() < 0.08) ms += between(2000, 4000);
    return ms;
  }

  async function post(route, body) {
    try {
      const res = await fetch(`${o.url}${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": o.key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    } catch (err) {
      throw new FriendlyError(`Cannot reach the server at ${o.url} (${err.cause?.code || err.message}). Is "npm start" running?`);
    }
  }

  // Like the firmware task: one POST at a time, batches of up to 20, never retried.
  function flush() {
    while (outbox.length > 0) {
      const gameId = outbox[0].gameId;
      const events = [];
      while (outbox.length > 0 && outbox[0].gameId === gameId && events.length < 20) events.push(outbox.shift().event);
      sending = sending.then(async () => {
        await sleep(latency());
        stats.batches += 1;
        stats.events += events.length;
        try {
          const res = await post("/api/live/events", { device_id: o.device, game_id: gameId, events });
          if (res.status !== 202) {
            stats.dropped += events.length;
            console.warn(`  live batch -> HTTP ${res.status} ${JSON.stringify(res.body)}`);
          }
        } catch {
          // Server unreachable: the batch is lost, the game goes on (like the firmware).
          if (stats.unreachable++ === 0) console.warn("  live batch dropped: server unreachable");
          stats.dropped += events.length;
        }
      });
    }
  }
  const timer = setInterval(flush, Math.max(20, 250 / o.speed));

  function emit(gameId, type, fields = {}) {
    outbox.push({ gameId, event: { type, t_ms: tMs(), ...fields } });
    if (IMMEDIATE.has(type)) flush();
  }

  // START held during a game: back to idle (the box has no RESET button).
  async function reset(gameId, label) {
    emit(gameId, "control_pressed", { control: "reset" });
    emit(gameId, "game_reset");
    console.log(`  RESET (${label})`);
    await wait(T.restart);
  }

  // 1 2 3 GO! before a sequence (then "watch"), 1 2 3 BEGIN! before the turn (then "input").
  async function countdown(gameId, then, level) {
    emit(gameId, "countdown_started", { seconds: T.countdown_seconds, step_ms: T.countdown_step, then, level });
    await wait(T.countdown_seconds * T.countdown_step + T.go);
  }

  // One game. Returns "reset" when START held abandoned it, else the uploaded record.
  async function playGame({ resetAt }) {
    deviceStart = Date.now();
    const gameId = newGameId();
    const sessionId = `${o.device}-L${Date.now()}`;
    emit(gameId, "control_pressed", { control: "start" });
    emit(gameId, "game_started", { lives: RULES.start_lives, level: 1 });
    console.log(`game ${gameId}`);

    const attempts = [];
    let level = 1;
    let lives = RULES.start_lives;
    let score = 0;
    let attempt = 1;
    let passed = 0;
    const newSequence = (lvl) => Array.from({ length: RULES.levels[lvl - 1].sequence_length }, () => between(1, 6));
    let sequence = newSequence(level);
    let outcome = null;

    while (outcome === null) {
      const rule = RULES.levels[level - 1];
      await countdown(gameId, "watch", level);
      emit(gameId, "playback_started", { level, attempt, sequence, cue_ms: T.cue, gap_ms: T.gap });
      await wait(sequence.length * (T.cue + T.gap));
      await countdown(gameId, "input", level);
      emit(gameId, "input_started", { level, deadline_ms: rule.deadline_ms, expected_length: sequence.length });

      let result = "pass";
      let elapsed = 0;
      for (let index = 0; index < sequence.length; index += 1) {
        if (resetAt !== null && attempts.length + 1 === resetAt && index === 1) {
          await reset(gameId, `held mid-game at attempt ${resetAt}, not uploaded`);
          return "reset";
        }
        const delay = random() < skill.timeout ? rule.deadline_ms + 1 : between(skill.minMs, skill.maxMs);
        if (delay > rule.deadline_ms) {
          await wait(rule.deadline_ms);
          result = "timeout";
          break;
        }
        await wait(delay);
        elapsed += delay;
        const expected = sequence[index];
        if (random() < skill.wrong) {
          emit(gameId, "press", { index, button: (expected % 6) + 1, expected, ok: false });
          result = "wrong";
          break;
        }
        emit(gameId, "press", { index, button: expected, expected, ok: true });
      }

      const responseMs = result === "timeout" ? 0 : elapsed;
      attempts.push({ level, result, response_ms: responseMs });
      if (result === "pass") {
        const bonus = speedBonus(level, responseMs);
        const points = rule.base_points + bonus;
        score += points;
        passed = level;
        emit(gameId, "attempt_result", { level, result, lives, score, points_awarded: points, speed_bonus: bonus });
        console.log(`  level ${level} pass +${points} (score ${score})`);
        if (level === RULES.max_level) outcome = "win";
        else {
          await wait(T.next_level_pause);
          level += 1;
          attempt = 1;
          sequence = newSequence(level);
        }
      } else {
        lives -= 1;
        emit(gameId, "attempt_result", { level, result, lives, score, points_awarded: 0, speed_bonus: 0 });
        console.log(`  level ${level} ${result}, lives ${lives}`);
        if (lives === 0) outcome = "game_over";
        else {
          await wait(T.retry_pause);
          attempt += 1;
          sequence = newSequence(level); // a fail brings a NEW pattern at the same level
        }
      }
    }

    emit(gameId, "game_finished", { outcome, final_score: score, highest_level_completed: passed, session_id: sessionId });
    flush();
    await sending;

    const record = {
      session_id: sessionId,
      device_id: o.device,
      outcome,
      final_score: score,
      highest_level_completed: passed,
      final_sequence_length: RULES.levels[level - 1].sequence_length,
      successful_rounds: attempts.filter((a) => a.result === "pass").length,
      failed_attempts: attempts.filter((a) => a.result !== "pass").length,
      duration_seconds: Math.round(tMs() / 1000),
      attempts,
    };
    const upload = await post("/api/game-sessions", record);
    console.log(`  ${outcome} ${score} -> upload ${sessionId} HTTP ${upload.status}`);
    return { gameId, record };
  }

  async function finish() {
    flush();
    await sending;
    clearInterval(timer);
  }

  return { playGame, finish, stats, post };
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n\n${USAGE}`);
    process.exit(1);
  }
  if (o.help) {
    console.log(USAGE);
    return;
  }

  try {
    await fetch(`${o.url}/api/health`, { signal: AbortSignal.timeout(3000) });
  } catch (err) {
    console.error(`Cannot reach the server at ${o.url}. Start it first: npm start (in backend/).`);
    process.exit(1);
  }

  const device = createDevice(o);
  let resetAt = o.resetAt;
  try {
    for (let game = 1; game <= o.games; game += 1) {
      let played = await device.playGame({ resetAt });
      if (played === "reset") {
        // Back to idle; the visitor presses START again for a fresh game.
        resetAt = null;
        await sleep(2000 / o.speed);
        played = await device.playGame({ resetAt: null });
      }
      if (game < o.games) await sleep(2500 / o.speed);
    }
    await device.finish();
    const { batches, events, dropped } = device.stats;
    console.log(`done: ${events} live events in ${batches} batches (${dropped} refused)`);
  } catch (err) {
    console.error(err instanceof FriendlyError ? err.message : `Unexpected error: ${err.message}`);
    process.exit(1);
  }
}

main();
