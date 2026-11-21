# Rhythm Rush - Project Notes

## Overview

Rhythm Rush is a 6-button musical memory game. This document is the report for the offline ML phase: synthetic data generation, three trained models, exported JSON artifacts, all metrics, retraining instructions, and limitations. All results use synthetic data and the fixed project seed **42**.

### Current status

- **Phases A, A2, B, B2, C, D, E, F, G, H, I, J1, J2, K, L and M are complete. All model data is synthetic.**
- Phase A2 adds `ml/data/players_hidden.csv` for hidden player labels. It is **never a model input**.
- Phase B trained the **Skill Classifier** and the **Animal IQ Matcher**. Phase B2 aligned both exports with the required JSON formats.
- Phase C trained the **Adaptive Difficulty** model. All three ML models now exist.
- Phase D added `docs/session.schema.json` and reorganized this report.
- Phase E created the **SQLite database layer**: schema, migration runner, seed script, and `backend/src/db.js`.
- Phase F added the **Express upload endpoint** `POST /api/game-sessions` (plus `GET /api/health`) and its vitest/supertest tests.
- Phase G runs all three **ML models inside Express** (no Python) and stores the prediction with each upload.
- Phase H adds the **read and gameplay endpoints**: leaderboard, session detail, nickname, difficulty, and stats (see `docs/API.md`).
- Phase I adds the **fake ESP32 uploader** (device SIM01) and a cleanup script, so the backend can be exercised without hardware.
- Phase J1 adds the **React frontend** (Vite + Tailwind v4) with the public leaderboard; see `docs/FRONTEND.md`.
- Phase J2 adds the **live result / kiosk screen** (`/result`, `/result/:sessionId`); see the Phase J2 section below.
- Phase K adds the **session detail page** with a chart (its back-office page was later removed, see "Admin removed").
- Phase L makes **one `npm start` serve API + website**, hardens CORS/headers/seed, adds root scripts, `README.md` and `docs/DEMO.md`, and verifies everything with a fresh-clone test and an end-to-end run.
- Phase M adds the **ESP32 network client** (`firmware/rhythm_rush_client`): Wi-Fi, offline queue, uploads, difficulty call. It compiles for the ESP32; it has not run on hardware yet.
- Later: a visitor **"How to play" brochure** (`/how-to-play`, prints with a QR code) and plain visitor wording; the site opens on the live game. See "How to play brochure and visitor wording".
- Later: the **admin side was removed** (one-day event; `tools/moderate.js` + a nickname blocklist instead) and the **live game mirror** was added (`/live`, live events over SSE, `tools/fake_live_game.js`); see "Admin removed" and "Live game mirror".
- The ESP32 hardware/firmware is **not finished**, so there is no real gameplay data yet.
- Python is used **only for offline training**. Production will have no Python. Express will read exported JSON from `/backend/artifacts`.
- The later database is **SQLite** via the `better-sqlite3` package. It uses a local database file, not a database server.
- `ml/data/` is gitignored because it is generated data.

Build order for the whole project:

1. ML models on synthetic data
2. SQLite database
3. Express backend
4. Fake ESP32 uploader
5. React frontend

### Model summary

| Model | Algorithm | Inputs | Output / labels |
|---|---|---|---|
| Adaptive Difficulty | `LinearRegression` | `accuracy` (0-1), `reaction_ratio`, `level` | Steps to add next level, rounded and clamped to 0, 1, 2. Optional: if the server is slow/down, the ESP32 adds +1. |
| Skill Classifier | `DecisionTreeClassifier(max_depth=3)` | the 4 features below | `Beginner`, `Intermediate`, `Pro`. Labels come from the simulator's **hidden player skill**, not from score percentiles. |
| Animal IQ Matcher | `NearestNeighbors(k=1)` on standardized 4 features | the 4 features below | Animal chosen from the matched game's score percentile. UI must say **"just for fun, not a real IQ test"**. |

### Files

| File | Purpose |
|---|---|
| `ml/game_rules.py` | Single source of truth for all game constants and formulas. |
| `ml/simulate_games.py` | Creates fake-but-realistic finished games using `game_rules.py`. |
| `ml/train_difficulty.py` | Trains the Adaptive Difficulty regression and writes `backend/artifacts/difficulty.json`. |
| `ml/train_skill.py` | Trains the Skill Classifier and writes `backend/artifacts/skill.json`. |
| `ml/train_animal.py` | Builds the standardized nearest-neighbor lookup and writes `backend/artifacts/animal.json`. |
| `ml/check_exports.py` | Applies all three JSON exports in plain Python and compares them with sklearn on 100 random games. |
| `ml/data/games.csv` | One row per finished game: the 4 model features plus labels and audit fields. Gitignored. |
| `ml/data/attempts.csv` | One row per level attempt, useful for checking the simulation. Gitignored. |
| `ml/data/players_hidden.csv` | One row per game with hidden labels. **Labels only, never a model input.** Gitignored. |
| `backend/artifacts/difficulty.json` | Production artifact for the difficulty endpoint later. |
| `backend/artifacts/skill.json` | Production artifact for `/api/skill` later. |
| `backend/artifacts/animal.json` | Production artifact for `/api/animal` later. |
| `docs/NOTES.md` | This report: assumptions, data dictionary, results, limitations. |
| `docs/session.schema.json` | JSON Schema (draft 2020-12) for the ESP32 session record. |
| `.gitignore` | Keeps generated ML data, Python caches, and `.env` out of git. |

### Phase E files (SQLite layer)

| File | Purpose |
|---|---|
| `db/migrations/001_init.sql` | Creates `devices`, `game_sessions`, `level_attempts`, `session_features`, `ml_predictions`, `app_config` plus two indexes. |
| `db/migrate.js` | Applies every `.sql` file in `db/migrations` in filename order, one transaction per file, tracked in `schema_migrations`. |
| `db/seed.js` | Inserts device `RR01` (SHA-256 of `DEVICE_API_KEY`) and the animal tiers in `app_config`. |
| `backend/src/db.js` | Opens SQLite, loads `backend/.env`, creates `backend/data/` if missing, sets `foreign_keys` and `journal_mode`. |
| `backend/.env.example` | Template for `backend/.env`. The real `.env` is gitignored. |
| `backend/package.json` | Scripts: `migrate`, `seed`, `start`, `test`. |

### Commands

Run the rules self-check:

```bash
python ml/game_rules.py
```

Regenerate the default synthetic data (2,000 games, seed 42):

```bash
python ml/simulate_games.py
```

This writes `games.csv`, `attempts.csv`, and `players_hidden.csv`.

Other sizes/seeds are allowed for experiments, but **42 is the project seed**:

```bash
python ml/simulate_games.py --games 5000 --seed 42
```

Train all three models and verify the exports:

```bash
python ml/train_skill.py
python ml/train_animal.py
python ml/train_difficulty.py
python ml/check_exports.py
```

### Game rules implemented

- 6 buttons: 1 Red, 2 Orange, 3 Yellow, 4 Green, 5 Blue, 6 Purple.
- Start with 3 lives at Level 1.
- Sequence length = `level + 2`.
- Per-press deadline = `max(1.5, 3.0 - 0.2 * (level - 1))` seconds.
- An attempt result is `pass`, `wrong`, or `timeout`.
- A failed attempt loses 1 life and retries the **same** level.
- 3 lives lost = game over. Clearing Level 15 = win.
- Points for a passed level = `100 * level + speed_bonus`.
- `speed_bonus = round(50 * (1 - response_time / (sequence_length * deadline)))`, clamped to `0..50`.
- `response_time` = time from the end of playback to the last correct press.
- The theoretical maximum score is `100 * (1 + 2 + ... + 15) + 15 * 50 = 12,750`.

### Where the rules live

All constants and formulas are in `ml/game_rules.py`. `simulate_games.py` imports them and never copies them. Training scripts do the same.

Important helpers:

- `sequence_length(level)`
- `deadline_seconds(level)`
- `speed_bonus(response_seconds, seq_len, deadline)`
- `points_for_pass(level, bonus)`
- `success_rate(successful_rounds, failed_attempts)`
- `reaction_ratio(avg_reaction_sec, level)`

### The 4 model features

| Feature | Definition |
|---|---|
| `final_score` | Total points at the end of the game. |
| `avg_reaction_sec` | Average over **pass** attempts of `(response_ms / 1000) / sequence_length`. If there were no pass attempts, use `3.0`. |
| `success_rate` | `successful_rounds / (successful_rounds + failed_attempts)`. If both are zero, use `0.0`. |
| `highest_sequence_length` | The final sequence length reached (`final_level_attempted + 2`), even if the final attempt failed. |

### Session record

The ESP32 will later send a session like this:

```json
{
  "session_id": "RR01-000127",
  "device_id": "RR01",
  "outcome": "game_over",
  "final_score": 127,
  "highest_level_completed": 1,
  "final_sequence_length": 4,
  "successful_rounds": 1,
  "failed_attempts": 3,
  "duration_seconds": 42,
  "attempts": [
    {"level": 1, "result": "pass", "response_ms": 4100},
    {"level": 2, "result": "wrong", "response_ms": 2100},
    {"level": 2, "result": "timeout", "response_ms": 0}
  ]
}
```

This exact record is also stored as an `examples` entry in `docs/session.schema.json`.

Mapping to the training table:

| Session field | `games.csv` column |
|---|---|
| `session_id` | `session_id` |
| `final_score` | `final_score` |
| `highest_level_completed` | `successful_rounds` (equal under these rules) |
| `final_sequence_length` | `highest_sequence_length` |
| `successful_rounds` | `successful_rounds` |
| `failed_attempts` | `failed_attempts` |
| `attempts` | `attempts.csv` rows |
| `device_id` | Not in the Phase 1 training table. Session metadata, not a model feature. |
| `duration_seconds` | Not in the Phase 1 training table. Session metadata, not a model feature. |

The Phase 1 synthetic CSV intentionally keeps only the fields needed for training, feature auditing, and label auditing. The later backend can export extra session metadata if needed.

### Security and configuration

- No secrets belong in code.
- The later backend must use `.env` and keep `.env.example` updated.
- `.gitignore` excludes `ml/data/`, `backend/data/`, `*.db`, `.env`, `node_modules/`, `__pycache__/`, and `.venv/`.

## Database (Phase E)

SQLite via `better-sqlite3` (synchronous API, no database server). File: `backend/data/rhythm.db`, path from `DB_PATH` in `backend/.env`.

### Commands

From `/backend`:

```bash
npm run migrate   # apply db/migrations/*.sql, safe to repeat
npm run seed      # insert device RR01 + animal tiers, safe to repeat
```

### Schema

| Table | Purpose |
|---|---|
| `devices` | One row per ESP32. `api_key_hash` holds the SHA-256 of the API key, never the raw key. |
| `game_sessions` | One row per finished game. `is_synthetic` = 0 for real uploads, 1 for fake data. |
| `level_attempts` | One row per attempt, cascades on session delete. |
| `session_features` | The 4 model features per session. |
| `ml_predictions` | Skill rank, animal, IQ, matched session, and model versions (JSON text). |
| `app_config` | Key/value settings, values stored as TEXT (JSON via `JSON.stringify`). |
| `schema_migrations` | Created by `db/migrate.js`; lists applied migration files. |

Indexes: `game_sessions(final_score DESC)` for leaderboards, `level_attempts(session_id)` for loading one game.

### Assumptions and limitations

1. **Seeds store a hash, not a key.** `db/seed.js` hashes `DEVICE_API_KEY` with SHA-256. The login check later must hash the incoming key and compare hashes.
2. **Seeding is insert-only.** Both writes use `INSERT OR IGNORE`, so changing `DEVICE_API_KEY` and re-running `npm run seed` does **not** update the stored hash. Delete the `devices` row first if you rotate the key.
3. **`animal_tiers` is duplicated on purpose.** The same percentiles exist in `backend/artifacts/animal.json`. The DB copy is for queries; the artifact stays the source for model inference. If the tiers change, update both.
4. **`avg_reaction_sec` and `success_rate` are computed, not uploaded.** The ESP32 only sends raw counts, so these values are derived server-side in Phase F using `ml/game_rules.py` formulas. Until then `session_features` stays empty.
5. **`/db` has no `node_modules`.** `migrate.js` and `seed.js` require `../backend/src/db`, so packages resolve from `/backend`. Success depends on `backend/.env` existing.
6. **WAL mode is per file, not per connection.** `:memory:` databases report `journal_mode = memory`; this is expected and harmless. `foreign_keys` is per connection and is always switched on.
7. **The database is empty except for one device and one config row.** No sessions, attempts, features, or predictions exist. `npm test` currently finds no test files and exits non-zero; tests arrive with the backend phases.

## Backend upload endpoint (Phase F)

Files: `backend/src/app.js` (Express app, no `listen`), `backend/src/server.js` (starts it), `backend/src/routes/gameSessions.js` (auth + validation), `backend/src/services/sessions.js` (`insertSession(db, record)`).

### Endpoints

| Method | Path | Result |
|---|---|---|
| `GET` | `/api/health` | `200 {"ok":true}` |
| `POST` | `/api/game-sessions` | uploads one finished game, needs header `X-API-Key` |

### POST /api/game-sessions

Checks run in this order:

1. **Auth.** SHA-256 the `X-API-Key` header and compare it with `devices.api_key_hash` using `crypto.timingSafeEqual`. Missing or wrong key → `401 {"error":"unauthorized"}`.
2. **Validation.** zod follows `docs/session.schema.json`: all 10 fields required, integers `>= 0`, `outcome` in `game_over|win`, `attempts[].level` 1-15, `result` in `pass|wrong|timeout`, `response_ms >= 0`, at most 200 attempts. Invalid → `400 {"error":"invalid_body","details":[...]}`.
3. **Device match.** `body.device_id` must equal the device that owns the key → else `403 {"error":"device_mismatch"}`.
4. **Save, in one transaction.** `INSERT OR IGNORE` the session; if nothing was inserted the answer is `200 {"duplicate":true,...}` and no other table is touched. Otherwise insert the attempts (`attempt_no` starts at 1), insert `session_features`, run the ML models (Phase G), and set `devices.last_seen_at = CURRENT_TIMESTAMP`. Success → `201 {"saved":true,...}`. The exact response bodies are in the Phase G section.

Other responses: unreadable JSON body → `400 {"error":"invalid_json"}`, unknown route → `404 {"error":"not_found"}`, unexpected error → `500 {"error":"server_error"}` with no internal details.

### Feature values written

- `avg_reaction_sec` = mean over **pass** attempts of `(response_ms / 1000) / (level + 2)`; `3.0` when there is no pass attempt.
- `success_rate` = `successful_rounds / (successful_rounds + failed_attempts)`; `0` when both are 0.
- `highest_sequence_length` = `final_sequence_length`; `final_score` copied unchanged.

For the AGENTS.md example record: one pass at level 1 with 4100 ms gives `(4.1 s) / 3 = 1.3667`, `success_rate = 1/4 = 0.25`, `highest_sequence_length = 4`, `final_score = 127`.

### Assumptions and limitations

1. **`insertSession` takes the db as a parameter** so tests can pass a separate `:memory:` database; the route passes the shared connection from `backend/src/db.js`.
2. **Duplicate means "same `session_id`".** A retried upload with a corrected payload is still ignored; the first stored version wins.
3. **Attempt rows are not validated against the session totals.** The server trusts `successful_rounds` / `failed_attempts` as sent, per AGENTS.md, and does not recount them from `attempts`.
4. **No ML ran in Phase F.** `ml_predictions` was added in Phase G, inside the same transaction.
5. **Auth compares against every device row** (there are only a handful). This keeps the comparison constant-time per device without relying on SQL string equality.
6. **Tests use `:memory:`** and load the app with Node's own `require` so the test and the route share one db instance.

## ML inside the backend (Phase G)

`backend/src/services/ml.js` applies the three exported models in plain JavaScript. No Python runs in production: the JSON in `backend/artifacts` is the only model source, and each file is read once on first use, then cached. `ml/check_exports.py` is the Python twin of this code, and `ml/export_test_vectors.py` writes fixed cases so the two can be compared.

| Function | Input | Output |
|---|---|---|
| `predictSteps` | `{accuracy, reactionRatio, level}` | integer `0..2` |
| `predictSkill` | the 4 features | `Beginner` / `Intermediate` / `Pro` |
| `matchAnimal(db, features, excludeSessionId)` | the 4 features + a database | `{animal, iq, percentile, matchedSessionId, distance}` |
| `modelVersions` | - | `{"skill":1,"animal":1,"difficulty":1}` |

### How each model is applied

- **Difficulty.** `raw = intercept + w.accuracy*accuracy + w.reactionRatio*reactionRatio + w.level*level`, then `Math.floor(raw + 0.5)` (the same as Python `np.floor(raw + 0.5)`) and clamp to `0..2`. Cases below 0 or above 2 are clamped, not rejected.
- **Skill.** The feature array is built in the order of `skill.json` `"features"`. Starting at node 0, go **left when the value is `<=` the threshold**, otherwise right, and stop at a node that has `"leaf"`.
- **Animal.** Standardize with the saved mean/std (`(x - mean) / std`), then compare against (a) every reference row in `animal.json` and (b) every row of `session_features` except the current session, ordered by `session_id`. The smallest Euclidean distance wins, and an exact tie keeps the **first** candidate, so reference rows win.
- **Percentiles.** A reference row uses its stored `score_percentile`. A database row has no stored value, so it is computed from `final_score` against the reference scores with the same formula `ml/train_animal.py` used: pandas `rank(pct=True, method="average")`, that is `(countLess + (countEqual + 1) / 2) / n`. The JS reproduces all 2,000 stored percentiles exactly.
- **Animal and IQ.** The first tier whose `percentile_min` is `<=` the percentile wins: Chimpanzee `>= 0.90`, Bottlenose Dolphin `>= 0.75`, Elephant `>= 0.55`, Orangutan `>= 0.30`, Pig `>= 0.00`. The IQ is `round(lo + (hi - lo) * position)`, where `position` is `(percentile - tier_min) / (next_tier_min - tier_min)` clamped to `0..1`; the top tier ends at `1.0`. Ranges come from AGENTS.md (Chimpanzee 90-100, Bottlenose Dolphin 80-90, Elephant 70-80, Orangutan 60-70, Pig 50-60).

### Response bodies

| Case | Body |
|---|---|
| New session | `201 {"saved":true,"skill_rank":"Beginner","animal":"Pig","animal_iq":56}` |
| Repeated `session_id` | `200 {"duplicate":true,"skill_rank":...,"animal":...,"animal_iq":...}` |
| ML failed | `201 {"saved":true,"skill_rank":null,"animal":null,"animal_iq":null}` |

A duplicate repeats the prediction stored on the first upload (nulls when that row does not exist, which is the case for sessions uploaded before Phase G).

### Failure behaviour

The ML calls happen inside the save transaction but in their own `try/catch`. A missing or broken artifact is logged with `console.error` and the session is still committed, just without an `ml_predictions` row. An ML problem never loses a finished game.

### Assumptions and limitations

1. **Predictions are a best-effort side effect.** If the artifacts are missing the upload still succeeds with `null` predictions, so a broken deploy degrades instead of dropping data.
2. **`matched_session_id` is stored as sent by the matcher.** It can be a synthetic id (`SYN-...`) or a real one; there is no foreign key because synthetic rows do not exist in `game_sessions`.
3. **A session can match itself only if the exclusion is bypassed.** `insertSession` always passes the current `session_id`, and a test proves the excluded row is never returned.
4. **Database rows are matched on features only.** Their percentile is derived from `final_score`, so a real session can land in any animal tier just like a synthetic one.
5. **Model versions are stored per prediction** as JSON text, so rows created by different artifact versions can be told apart later.
6. **The artifacts are cached after the first successful load.** Changing the files on disk needs a server restart (the tests call `resetCache()`).
7. **`predictSteps` had no endpoint in Phase G.** Phase H adds it as `POST /api/difficulty/next` (below).

## Other endpoints (Phase H)

Phase H adds the endpoints the kiosk, dashboard, and ESP32 need beyond the upload. Full request/response examples and PowerShell curl commands are in **`docs/API.md`**. The SQL lives in `backend/src/services/queries.js`, and every function takes `db` as its first argument so tests can pass `:memory:`.

| Method | Path | Auth | What |
|---|---|---|---|
| `GET` | `/api/leaderboard?limit=20` | none | top scores with prediction columns |
| `GET` | `/api/game-sessions/:id` | none | session + attempts + features + prediction |
| `PATCH` | `/api/game-sessions/:id/nickname` | none | set the nickname once |
| `POST` | `/api/difficulty/next` | device key | `predictSteps` for the next level |
| `GET` | `/api/stats/summary` | none | totals, histogram, skill/animal counts |

### Decisions

- **One auth helper.** `backend/src/services/auth.js` now holds the SHA-256 + `timingSafeEqual` check that used to sit inside the upload route. `requireDeviceApiKey(db)` is a middleware used by both upload and difficulty. The check did not change, only its location.
- **Ranking.** `RANK() OVER (ORDER BY final_score DESC)` gives shared ranks (`1, 2, 2, 4`). `ORDER BY` then breaks ties by `highest_level_completed DESC`, `received_at ASC`, `session_id ASC` so the page order is stable. `LIMIT ?` is a bound parameter, never a string-built clause.
- **Leaderboard joins.** `LEFT JOIN ml_predictions` keeps games without a prediction; those columns come back `null`. The existing `RR01-000127` upload (made before Phase G) is the real example.
- **Nicknames.** Trim, then 1-16 characters from `A-Z a-z 0-9 space - _`. Checked with zod; anything else is `400 invalid_nickname`. A nickname can be set once: a second attempt is `409 nickname_already_set` and the stored name is kept. The UPDATE runs in a transaction together with the read, so two simultaneous requests cannot both win.
- **Nickname rate limit.** `express-rate-limit` is applied to that one route only: 30 requests/minute per IP by default. `createApp({nicknameRateLimit:{limit, windowMs}})` changes it; the default export of `app.js` is the app with defaults.
- **Difficulty fallback.** On success the route returns `{steps, nextLength, model_version}`. If `predictSteps` throws, it logs and answers `200 {steps:1, nextLength:min(17,currentLength+1), fallback:true}` - the same fixed `+1` rule the ESP32 uses when the server is slow or down. A model problem never blocks gameplay.
- **Stats.** 13 fixed histogram bins of 1000 points (`0-999` ... `12000-12999`), empty bins included. `skill_counts` and `animal_counts` always contain every label with `0` when missing. With no games, `average_score`, `max_score`, and `win_rate` are `null`, while `outcomes` is `{game_over:0,win:0}`.
- **SQL safety.** All values, including `LIMIT`, the session id, and the nickname, are bound with `?`. A test PATCHes `'; DROP TABLE game_sessions;--` and then checks that the table still exists.

### Assumptions and limitations

1. **Public read endpoints have no auth.** Leaderboard, session detail, nickname, and stats are meant for the kiosk/dashboard on the local network. The nickname route is only protected by its rate limit and the set-once rule.
2. **`RANK()` is computed over all rows.** `LIMIT` only cuts the returned page, so ranks near the top are always global ranks.
3. **Nickname character rules are ASCII-only** (`A-Z`, `a-z`, `0-9`, space, `-`, `_`). Accented or emoji names are rejected for now.
4. **The rate limiter keeps its counters in memory.** A restart clears them, and multiple server processes would each have their own. That is fine for one kiosk server.
5. **Session detail returns raw column names** (`is_synthetic` `0/1`, timestamps as SQLite text), because the frontend will consume the same shape as the database.
6. **Stats read every score into Node** to fill the histogram instead of using SQL `CASE` buckets. Simple and fast enough for this project; revisit only if the table grows very large.

## Fake ESP32 (Phase I)

`tools/fake_esp32.js` replays synthetic games through the real upload endpoint, pretending to be a second device called **SIM01**. The firmware is not involved, and Python is not needed at runtime: the script reads `ml/data/games.csv` and `ml/data/attempts.csv`, builds a valid session record, and POSTs it to `/api/game-sessions`.

### Setup

`db/seed.js` now seeds two devices:

| Device | Name | Key in `.env` |
|---|---|---|
| `RR01` | Rhythm Rush test device | `DEVICE_API_KEY` |
| `SIM01` | Simulated device | `SIM_API_KEY` (development value: `dev-sim01-key`) |

Run once (safe to run again; `INSERT OR IGNORE`):

```powershell
cd backend
npm run seed
```

Only the SHA-256 hash of each key is stored, and `SIM_API_KEY` must be different from `DEVICE_API_KEY` so fake uploads are easy to tell apart.

### How to run

From `/backend` (start the server in another terminal with `npm start`):

```powershell
# 20 different synthetic games, then one duplicate resend
node ../tools/fake_esp32.js --count 20 --duplicate

# only 5 games, slower, against a different port
node ../tools/fake_esp32.js --count 5 --delay 300 --url http://localhost:3100

# all options
node ../tools/fake_esp32.js --help
```

The npm aliases are `npm run fake` and `npm run fake:clear`. Windows PowerShell 5.1 removes a bare `--` before native commands, so the direct `node` form above is the reliable PowerShell choice; from `cmd.exe` the npm form `npm run fake -- --count 20 --duplicate` works as usual.

Options: `--count` (default 20), `--url` (default `http://localhost:3000`), `--key` (default `SIM_API_KEY` or `dev-sim01-key`), `--device` (default `SIM01`), `--delay` ms (default 0), `--seed` (default 42), `--duplicate`, `--help`. The key is only put in the `X-API-Key` header and is never printed.

### What an upload contains

- A new `session_id` of the form `SIM01-<9 digits>` for every game, unique per run (based on the current time, so another run creates new rows).
- The game fields copied from `games.csv`: outcome, final score, level, sequence length, successful rounds, failed attempts.
- The attempts from `attempts.csv` in file order. For `pass` and `wrong`, `response_ms` is jittered by +-5 percent; `timeout` attempts stay at `0`.
- `duration_seconds` is an estimate: total press time + 8 seconds per attempt + 5 seconds, rounded to an integer.
- `--seed` controls the game selection and the jitter (same seed = same games and timings). The ids still differ, so repeated runs save new games instead of duplicates.
- `--duplicate` resends the first record once and checks for `200 {"duplicate":true}`; it exits with code 1 if that check fails.

### Animal result is only a plumbing test

A replayed game has almost the same features as the synthetic game it came from. The 5 percent timing jitter moves `avg_reaction_sec` only a little, so the nearest neighbor is **usually the original `SYN-...` row**, and the animal/IQ comes from that synthetic game's score percentile. As more fake games are uploaded they can also become each other's nearest neighbor. Use the animal result to check that the endpoint and matcher work, not as a real assessment of a player.

### Removing fake data

From `/backend`:

```powershell
node ../tools/clear_fake.js          # dry run: shows how many WOULD be deleted
node ../tools/clear_fake.js --yes    # actually deletes them
```

The script deletes only `game_sessions` rows with `device_id = 'SIM01'`; `ON DELETE CASCADE` removes their attempts, features, and predictions, and `devices.last_seen_at` is reset for SIM01. It refuses any `--device` other than `SIM01`, so real `RR01` games cannot be deleted by mistake.

### Assumptions and limitations

1. **Fake games are synthetic replays.** They exercise the HTTP, database, and ML plumbing, but they do not add new player behaviour; the distribution is exactly the simulator's.
2. **The ML output is recomputed on the server**, not copied from the CSV. That is the point of the test, but it also means the fake predictions reflect the synthetic population.
3. **The animal result is not a player evaluation** (see above). The UI must still say "just for fun, not a real IQ test".
4. **Session ids are time-based.** Two runs in the same millisecond would collide; in practice `--count` ids on one run differ by index, and a later run gets a new base.
5. **`--key` reads `process.env.SIM_API_KEY` only.** `.env` is not loaded by the tool itself; the built-in development fallback (`dev-sim01-key`) matches the seeded development device.
6. **The clear script needs the same `DB_PATH` as the server.** It gets its connection by requiring `backend/src/db.js`, so run it from `/backend` (or with the same environment) as the server.
7. **PowerShell 5.1 drops one bare `--`.** Use the direct `node` commands above or `cmd /c "npm run fake -- ..."`.

## Kiosk result page (Phase J2)

The ESP32 cannot open a web page, so the result screen finds new games by itself. `/result` polls `GET /api/game-sessions/latest` every 2 seconds and shows each **new** game for 30 seconds, then returns to an idle screen. `/result/:sessionId` shows one specific game with no countdown. The page itself is described in `docs/FRONTEND.md` (behaviour and the "Result page checklist").

### Review of the earlier, unfinished J2 attempt

An earlier attempt at J2 left `kioskState.js`, `nickname.js` and their tests, but no page. Every file was re-checked against the J2 spec:

| File | Decision | Why |
|---|---|---|
| `kioskState.js` + test | **rewritten, tests first** | Bug: when the page opened on an **empty** database, the first `latest` was `null` and was ignored, so the baseline stayed unset and the **first real game was swallowed** (never shown). That is exactly the demo-day flow (fresh DB, open `/result`). The tests also missed several rules. |
| `nickname.js` + test | **kept**, extended | Matches the API rule exactly (trim, 1-16, `^[A-Za-z0-9 _-]+$`) and the tests covered every required case. Added `nicknameErrorMessage(status)` and a test for non-string input. |

### Decisions

1. **Baseline flag.** The state has an explicit `hasBaseline`. The first `latest` answer always sets the baseline, **including `null`** (empty database). After that a `null` id is ignored. This differs from the literal spec ("null id ignored") only for the very first answer, and it is what makes the first game of the day appear. Unit tested.
2. **Older games are never shown.** `latest` events also carry `received_at`. If an id is older than the baseline (the newest game was deleted with `tools/moderate.js`), it quietly becomes the new baseline instead of popping up as a "new" result. SQLite `YYYY-MM-DD HH:MM:SS` text compares correctly as a string.
3. **"Level N reached"** is the level of the **last attempt** (`final_sequence_length - 2`), not `highest_level_completed`: a player who cleared level 1 and died on level 2 reached level 2. A game that failed level 1 three times shows "Level 1 reached". The leaderboard column keeps showing `highest_level_completed`.
4. **Article.** The animal sentence uses "an" before Elephant and Orangutan ("You played like an 🐘 Elephant, IQ 74!"); the spec wrote "a" everywhere.
5. **Pause rules.** Focusing or typing in the nickname box pauses; leaving the box, saving, or **15 seconds without a key press** resumes. Without the 15-second rule, a player who walks away with the box focused would freeze the kiosk on their result. `pause` is ignored on the idle screen; a new game always starts unpaused.
6. **Countdown on top.** The bar, "Back to the leaderboard in Ns" and Close sit above the result, because with the nickname form open the page is taller than a 1080p screen.
7. **Hidden tab.** Polling (`usePolling`) and the 1-second tick both skip while `document.hidden`, so a hidden tab neither uses up the player's 30 seconds nor sends requests.
8. **Rank** comes from `GET /api/leaderboard?limit=100`, fetched once per shown game. If that request fails the rank is simply hidden.
9. **Text only through React.** No `dangerouslySetInnerHTML` anywhere; nicknames are plain text.

### Verification (real runs)

- `npm test` (frontend): 3 files, 52 tests passed (kiosk reducer 28, nickname 12, format 12). `npm run build` and `npm run lint` pass.
- Through the Vite proxy (`5173 -> 3000`), against a throwaway database: `/api/health`, `/api/game-sessions/latest` and `/api/leaderboard` answered, and `/result`, `/result/<id>` returned the app shell.
- Headless Chrome, driven over the DevTools protocol against that database, passed 34/34 checks: idle screen on an empty DB, the first game of the day is shown, score with separators, level, "Rank #1", animal sentence, countdown ticking, client validation of `<script>`, countdown frozen while typing, "Saved! You are Ana_Maria-2" and the name stored in SQLite, countdown resumed without reset, Close and Skip return to idle, a dismissed game does not return, a newer game replaces the active one and restarts at 30, `/result/:id` without countdown, a real 409 mapped to "This game already has a nickname.", "Game not found", header highlighting, no sideways scroll at 390 px, and no browser console errors.

### Assumptions and limitations

1. **Offline-queue uploads appear as new results.** `received_at` is the server's receive time. When the ESP32 comes back online and sends queued games, the newest of them is shown as if it were just played.
2. **Two games inside one poll interval show only the newest.** The kiosk polls every 2 seconds and asks only for the latest game; the other one is on the leaderboard but never gets its own result screen.
3. **Session ids are guessable.** Ids look like `RR01-000127`, and the nickname route has no auth (by design, the kiosk has no key). Anyone on the network can set a nickname on any game that has none yet. The set-once rule, the blocklist, the rate limit, and `tools/moderate.js clear-nickname` limit the damage. Run the exhibition on a trusted network.
4. **Several kiosk screens** each show the same result independently; that is fine, but whoever types first sets the nickname.
5. **Clock.** The countdown is driven by `setInterval`, so it can drift by a fraction of a second; that is acceptable for a 30-second screen.
6. **Git Bash and a lowercase drive letter.** When the current directory is `c:\...` (lowercase), vitest 5 loads itself twice and every frontend test file fails with `Cannot read properties of undefined (reading 'config')`. PowerShell and cmd always use `C:\...`, where the tests pass. If you see that error, `cd` into the folder with a capital `C:`.

## Session detail (Phase K)

Frontend: `/session/:id` with a Recharts chart (details and a manual checklist in `docs/FRONTEND.md`).

### Decisions

1. **Chart colours were validated, not guessed.** The first choice (green/red/amber status colours) failed the colour-blind check (deutan ΔE 4.1, minimum 6). The chart uses three palette slots that pass every check on the app's dark surfaces: pass `#199e70`, wrong `#d95926`, timeout `#3987e5`, plus text labels everywhere and a hollow style for timeouts.
2. **Game rule mirror in the frontend.** AGENTS.md says the formulas live in `ml/game_rules.py` and must be imported, not copied. The browser cannot import Python, so `chartData.js` mirrors `sequence_length` and `deadline_seconds` (needed to draw a timeout at its time limit). The unit test pins the values printed by `game_rules.py` for all 15 levels, so a change in the Python rules makes the test fail.
3. **Bundle size.** The session page is a `React.lazy` chunk with Recharts inside (≈425 kB, 121 kB gzipped), so the main bundle stays small.

### Admin removed (one-day event)

Phase K also built a password-protected admin page and API. The exhibition lasts **one day**, so they were removed completely: the routes, the password check and its rate limiter, `ADMIN_PASSWORD`, the page and its tests (backend 146 -> 100 tests: `admin.test.js`, 46; frontend 90 -> 77: `adminAuth.test.js` 5 and 8 tests of admin-only chart/format helpers). What replaced it:

- **`tools/moderate.js`**, a command line tool that only works **on the laptop** (it opens the database file directly, nothing is exposed on the network): `list`, `clear-nickname`, `delete-game` (a real game needs `--yes` and `--confirm <id>`), `block-add`, `block-list`. Destructive commands are dry runs without `--yes`.
- **A nickname blocklist** (`backend/blocklist.txt`) checked by the nickname route itself, so rude names are refused before they reach the screen.
- `tools/clear_fake.js` (wipe SIM01 games) and "delete the database file, then migrate + seed" (reset before the event), documented in README and DEMO.

The production guard for public example API keys in `db/seed.js` stays.

### Nickname blocklist

1. **Normalization.** Lowercase; `0`->`o`, `3`->`e`, `4`->`a`, `5`->`s`, `@`->`a`, and `1` is tried as both `i` and `l`; spaces, `-` and `_` split words. Every letter of a blocked word may repeat (`fuuuck`). The nickname character rule (`A-Z a-z 0-9 space - _`) runs first, so `@` never actually arrives.
2. **Word boundaries.** Words of 5+ letters match anywhere (`MotherFucker` hits `fucker`). Words of 4 letters or fewer only match a whole word or the whole nickname with separators removed (`f-u-c-k`), so `Class`, `Bass`, `Peacock`, `Scunthorpe`, `Petite` pass. **Tradeoff:** a short word glued to another (`fuckboy`) passes unless its longer form is on the list, and a short word used as a real name (`Dick`) is refused. List longer forms when needed.
3. **Same answer as before.** A blocked nickname gets the existing `400 invalid_nickname`, so the kiosk message is unchanged (and it does not tell people which word was caught).
4. **Live reload.** The file is read at startup and again when its modification time changes, so `moderate.js block-add` works without a restart. Earlier nicknames are not re-checked.
5. **The starting list is short** (common English and Filipino profanity). It is meant to be extended by the team before the event.

## Integration, hardening, README (Phase L)

### What changed

| Change | Files |
|---|---|
| Express serves the built website (`frontend/dist`) with an SPA fallback, so one `npm start` runs everything | `backend/src/app.js` (`staticDir` option), `backend/src/server.js` |
| `server.js` prints the LAN addresses (`on this network: http://192.168.x.y:3000`) and whether the website is built | `backend/src/server.js` |
| CORS limited by `ALLOWED_ORIGINS` (default: same origin + Vite dev/preview) | `backend/src/app.js`, `backend/.env.example` |
| Helmet defaults kept, except `upgrade-insecure-requests` (see below) | `backend/src/app.js` |
| 4xx errors (e.g. a malformed `%` in an id) answer `{"error":"bad_request"}`, never error text | `backend/src/app.js` |
| `npm run seed` refuses the public example keys when `NODE_ENV=production` | `db/seed.js` |
| `npm install` works without a C++ compiler | `backend/.npmrc` (new) |
| dotenv's start-up banner silenced (it printed a count, never values) | `backend/src/db.js`, `server.js` |
| Root convenience scripts | `package.json` (new): `install-all`, `migrate`, `seed`, `build`, `start`, `dev:frontend`, `test-all`, `simulate`, `retrain`, `fake` |
| 20 new tests: static serving, SPA fallback, cache headers, CORS, headers, error bodies | `backend/tests/security.test.js` (new) |
| Docs | `README.md` (new), `docs/DEMO.md` (new), `docs/API.md`, `docs/FRONTEND.md` |

### Findings that changed the code (proved, not assumed)

1. **Helmet's default CSP broke the site on the LAN.** Its `upgrade-insecure-requests` directive makes the browser fetch every script over https. An experiment served the same `frontend/dist` twice and opened both in headless Chrome through `http://192.168.1.5`: with `helmet()` defaults the React app **did not render** (`#root` empty); with the directive removed it rendered. Everything else in helmet's defaults (CSP `default-src 'self'`, `script-src 'self'`, nosniff, frame options, no `X-Powered-By`, ...) stays on, and a test asserts the directive stays off.
2. **A fresh clone could not `npm install` the backend.** The fresh-clone test failed at step 1: npm runs `node-gyp rebuild` for `better-sqlite3@13.2.0` because the package contains a `binding.gyp`, even though it ships ready-made binaries in `prebuilds/` and needs no compiler. On a PC without Visual Studio Build Tools that is a hard error (the developer machine's `node_modules` had been installed earlier some other way). Fix: `backend/.npmrc` with `ignore-scripts=true`. The only other backend package with an install script is `fsevents` (macOS only, ships its binary). `npm start`, `npm test` and `npm run ...` still work with this setting. After the fix the fresh install passed and `better-sqlite3` loaded its prebuilt binary (`sqlite 3.54.1`).
3. **Same-origin vs CORS.** The website served by Express itself is the same origin and always works. Through the Vite proxy the backend sees `Origin: http://localhost:5173`, which is in the default list. A phone using the Vite dev server over the LAN also works: the browser talks only to Vite (same origin for the browser), and the backend simply adds no CORS header. A disallowed origin is not rejected with an error; it just gets no CORS permission, so its browser can neither read answers nor send JSON/PATCH/DELETE or custom headers (the preflight fails). The ESP32 and curl send no `Origin` and are unaffected.
4. **Example keys are public.** `change-me` and `dev-sim01-key` are in `.env.example` on GitHub; a database seeded with them would let anyone on the Wi-Fi upload scores as SIM01. The seed now refuses them with `NODE_ENV=production` and only warns in development.

### Security pass (checked)

- Helmet on (see above); `X-Powered-By` absent; JSON bodies capped at 100 kb (`413`).
- No stack traces or error text reach clients: body-parser errors, 4xx errors and 500s all answer short JSON codes; details only go to the server log.
- No secret is printed: `grep` over `backend/src`, `db`, `tools` finds no printed key or password value. `fake_esp32.js` never prints its key.
- `.gitignore` checked with `git check-ignore`: `backend/.env`, `frontend/.env`, `backend/data/*.db*`, `ml/data/`, all `node_modules/`, `frontend/dist/`, `__pycache__/` are ignored; `backend/artifacts/*.json`, both `.env.example` files, `backend/.npmrc` and `package.json` are tracked.
- `.env.example` now lists every variable the code reads: `NODE_ENV`, `PORT`, `DB_PATH`, `DEVICE_API_KEY`, `SIM_API_KEY`, `ALLOWED_ORIGINS` (plus `ARTIFACTS_DIR`, a test-only override that is documented in `ml.js`, not in the example).

### Fresh-clone test (real run)

A copy of the project without `node_modules`, `backend/data`, `ml/data`, `frontend/dist`, `.env` files, caches and `.git` was made in a temporary folder, and only the README was followed:

| README step | Result |
|---|---|
| `npm run install-all` | **failed** first (finding 2 above); after adding `backend/.npmrc`: OK, 0 vulnerabilities |
| `python -m pip install ...` | OK (already satisfied) |
| `Copy-Item backend/.env.example backend/.env` | OK |
| `npm run migrate`, `npm run seed` | OK (`apply 001_init.sql`; RR01, SIM01, animal_tiers inserted; the development warning about example keys printed) |
| `npm run build` | OK |
| `npm start` | OK: listening on 3000, LAN address printed, "website: served from frontend/dist", change-me warning |
| `/api/health`, `/`, `/result`, `/session/X`, `http://192.168.1.5:3000/result` | all 200 (HTML for pages) |
| `npm run simulate` | OK; the 3 CSVs are byte-identical to the originals and match the SHA-256 values above |
| Kiosk scenario in headless Chrome against the production build over the LAN IP | 34/34 |
| `npm run test-all` | backend 146 passed, frontend 80 passed, lint clean, game_rules self-check passed, `ALL CHECKS PASSED` |

### End-to-end run (real outputs)

Run inside that copy, so that the real `ml/data`, `backend/artifacts` and test fixtures were never touched (see "Conflicts"). Database `./data/e2e.db`, port 3100; the file was deleted afterwards.

| Step | Output |
|---|---|
| simulate | 2,000 games; CSVs byte-identical to the originals |
| `npm run retrain` | skill accuracy 0.6650, difficulty R² 0.7883 / MAE 0.2542; **all three artifacts byte-identical** to the committed ones |
| `check_exports.py` | ALL CHECKS PASSED |
| `export_test_vectors.py` + `tests/ml.test.js` | fixture byte-identical; 15/15 JS-vs-Python tests passed |
| migrate + seed + start | OK |
| `fake_esp32.js --count 30 --duplicate` | `Sent 31, saved 30, duplicates 1, failed 0` |
| rows | 30 sessions, 390 attempts, 30 predictions; the duplicated id has 1 row |
| leaderboard | 30 entries, ranks equal `1 + number of higher scores` for every row (top: 12,479 / 12,474 / 12,450) |
| `POST /api/difficulty/next` | `{"steps":1,"nextLength":11,"model_version":1}`; without key `401` |
| nickname | first `200 {"saved":true,"nickname":"E2E Player"}`, second `409 nickname_already_set`, stored name unchanged |
| offline upload | send while the server is unreachable: not delivered (curl exit 7); retry: `201 saved`; retry again (lost reply): `200 duplicate`; **1 row** |
| wrong/timeout stored | `3:L3:wrong:1800 ... 6:L5:timeout:0 7:L5:wrong:2600` |
| scores consistent | uploaded 1290 = stored 1290 = leaderboard 1290; stats `31 / 12479` = SQL `31 / 12479` |
| website | `/`, `/result` served as HTML by the same process |

### Conflicts and resolutions

1. **"Do not modify `ml/data`, `backend/artifacts`, or the backend tests" vs. "simulate -> train all 3 -> export vectors" in the E2E run.** Those scripts write exactly into those folders. Resolution: the whole E2E pipeline ran in the fresh-clone copy, and its outputs were compared byte for byte with the real files (all identical). The real repository was never written by the ML scripts.
2. **AGENTS.md "Create exactly the files named"** vs. the install failure. `backend/.npmrc` was not in the plan, but without it the README's first step fails on any PC without a C++ compiler. It is a 1-line config file, documented here.
3. **`npm run test-all` includes the ML export check, which needs `ml/data`** (gitignored). The README says to run `npm run simulate` once first.

### Assumptions and limitations

1. **Plain HTTP on the LAN** is a deliberate choice for an isolated classroom network (no certificates on a laptop/ESP32). For internet use put an HTTPS reverse proxy in front and turn certificate checking on in the firmware.
2. **`ignore-scripts=true`** also skips install scripts of future backend dependencies. If a new dependency really needs one, run `npm rebuild <package>` once, or remove the setting.
3. **The SPA fallback treats any non-`/api` path without a file extension as a page** (`/whatever` returns the app, which shows its own "Page not found").
4. **Root scripts call `python`.** On macOS/Linux that is often `python3`; run the Python commands directly there.
5. **CORS is not authentication.** It only limits what *browsers* on other origins can read; anything that is not a browser ignores it. Device keys are the real access control.

## ESP32 network client (Phase M)

`firmware/rhythm_rush_client/` holds an Arduino sketch with **only the network layer** for the teammate who builds the game: Wi-Fi with reconnect backoff, `buildSessionJson()` (ArduinoJson 7), unique ids `"<DEVICE_ID>-<counter>"` with the counter in flash (Preferences), a LittleFS queue of max 20 games, an uploader that deletes a file only on 200/201, and `getNextSteps()` with an 800 ms budget and a +1 fallback. Details and the hardware checklist are in `firmware/rhythm_rush_client/README.md`.

| File | Purpose |
|---|---|
| `firmware/rhythm_rush_client/rhythm_rush_client.ino` | network layer + optional Serial test commands (`p f d q a w h`) |
| `firmware/rhythm_rush_client/config.h.example` | Wi-Fi, `SERVER_URL`, `API_KEY`, `DEVICE_ID` template; `config.h` is gitignored (`firmware/**/config.h`) |
| `firmware/rhythm_rush_client/README.md` | Arduino IDE setup (no PlatformIO), usage from game code, behaviour, HTTPS note, hardware checklist |

### Decisions

1. **Conflict: AGENTS.md says `/firmware` is "later, not yours".** The user explicitly asked for this deliverable for the teammate. Resolution: only the network layer was written (no pins, no game logic), as a separate sketch the teammate can merge into the game.
2. **Uploads pause during gameplay.** `rrNetSetGameActive(true)` stops the uploader so an HTTP timeout can never delay a button press. Wi-Fi reconnects run in the background (`WiFi.begin()` returns at once); the core's own auto-reconnect is off so the two cannot fight.
3. **Delete only on 200/201**, keep on everything else (as specified), with backoff 3 s → 2 min. A 200 means the server already had the game (lost answer), so it counts as delivered.
4. **Two small safety additions.** (a) A game whose attempt levels are outside 1..15 is refused *before* queueing with a clear log line, because the server would answer 400 forever and block every newer game behind it. (b) An empty/unreadable queue file is **renamed** to `.bad` (kept, not deleted) for the same reason.
5. **Queue full → drop the oldest** (logged), so the newest result, the one the player is waiting for, is kept.
6. **Atomic writes.** A game is written to `.tmp` and renamed to `.json`; stray `.tmp` files are removed at boot, so a power cut never uploads half a game.
7. **Counter saved before use**: a reboot can skip a number, never repeat one. `SESSION_COUNTER_START` lets the teammate jump past old ids after a full flash erase (otherwise the server would treat new games as duplicates of old ones).
8. **Difficulty budget:** 400 ms connect + 400 ms answer ≈ 800 ms worst case; inputs are range-checked like the server so a bad value costs no request.
9. **Plain HTTP**, documented in the sketch and README as acceptable only on the isolated classroom LAN; for the internet: `WiFiClientSecure` + `setCACert()`, never `setInsecure()`.

### Verification (real runs)

- **Compiled** with the Arduino IDE's bundled `arduino-cli` 1.5.1, `esp32:esp32:esp32` (ESP32 Dev Module), esp32 core **3.3.12**, ArduinoJson **7.4.3**, `--warnings all`: exit 0, **0 warnings in the sketch** (one `-Wtype-limits` warning was found and fixed). 988,448 bytes flash (75 %), 48,496 bytes RAM (14 %); 971,412 bytes with the Serial commands off.
- Without `config.h` the build stops with the intended `#error` message.
- The JSON the sketch builds for the example game (`{"session_id":"RR01-000001","device_id":"RR01",...,"attempts":[...]}`, keys in schema order) **validates against `docs/session.schema.json`** (Python `jsonschema`) and equals the schema's example except for the id. Posted to a real server: first `201`, resend `200 {"duplicate":true}`, wrong key `401`; attempts stored as `pass:4100 wrong:2100 timeout:0`. The difficulty request body the sketch sends got `200 {"steps":0,...}` in 4.6 ms.

### Limitations / not verified

1. **Not run on a real ESP32.** Compiling proves the APIs and types are right for core 3.3.12; Wi-Fi behaviour, LittleFS on the chosen partition scheme, Preferences persistence across resets, and timing on the real network must be checked on the board (checklist in the firmware README).
2. The JSON check used the deterministic ArduinoJson output for the example game, written out by hand; the ESP32 itself did not produce it here.
3. When the laptop is completely unreachable, one upload attempt can hold the **idle** loop for up to ~1.5 s (connect timeout), never during an active level. A FreeRTOS task would remove even that, at the cost of a mutex around the queue.
4. A game rejected with 400/401/403 stays at the head of the queue and blocks newer ones until the cause is fixed (as specified: keep on any non-200/201). The Serial log names the cause.

### Process note

AGENTS.md says "do ONE phase at a time". In this session the user explicitly asked for J2, K, L and M in order, each finished and tested before the next. That instruction wins; each phase still ends with passing tests, this report, and an AGENTS.md status update before the next one starts.

## Live game mirror

While a game runs on the ESP32, the web page `/live` mirrors the control panel
in real time. Contract: `docs/LIVE_PROTOCOL.md` (PROPOSED, needs agreement
with the firmware owner). API: `docs/API.md`, "Live game". Frontend:
`docs/FRONTEND.md`, "Live game mirror".

### Files

| File | Purpose |
|---|---|
| `ml/game_rules.py` | + hardware timing constants (cue 500 / gap 200 ms, countdown 3 x 1000 ms, GO 600, pauses, RESET hold) |
| `ml/export_rules.py` -> `docs/game_rules.json` | rules for JavaScript tools, incl. the speed bonus as a step table per level |
| `backend/src/services/liveState.js` | pure `reduceLive` + in-memory store (per device, ring buffer of 200) |
| `backend/src/routes/live.js` | `POST /api/live/events`, `GET /api/live/state`, `GET /api/live/stream` (SSE) |
| `backend/src/routes/sessions.js` | + `GET /api/game-sessions/recent` (Last results) |
| `backend/tests/live.test.js` | 20 tests |
| `tools/fake_live_game.js` | simulated device in real time, then the normal upload |
| `frontend/src/live/*`, `LivePanel.jsx`, `LiveIndicator.jsx` | reducer, timelines, stream, panel, header sign |
| `firmware/rhythm_rush_client` | + LiveEvents module (compiled, not run) |

### Decisions

1. **Server-Sent Events, not WebSockets.** Data flows one way (server to
   browser); `EventSource` is built into every browser, reconnects by itself
   and sends `Last-Event-ID`; no new dependency on either side.
2. **Memory only, no tables.** Live data is best-effort and ephemeral; the
   upload stays the source of truth. A server restart loses the live state:
   the mirror comes back at the next `playback_started` (accepted even from
   idle), and score/lives show as dashes until the next attempt result.
3. **One playback event with the whole sequence** (not one per cue). The
   browser replays it on its own clock, so network jitter never makes the
   cues uneven. Late (arrived after the whole playback) = WATCH only; never
   sped up; a duplicate (same game, level, attempt) never replays.
4. **No clock sync.** The server stamps `receivedAt`; snapshots carry `now`,
   so the browser works with ages, never with the server's clock. `t_ms`
   from the device is informational only.
5. **Stale and new games.** A new `game_id` switches the device's game; ids
   seen before (last 50) are ignored, so a late batch from an abandoned game
   cannot overwrite the new one.
6. **RESET timing in the protocol.** After RESET the device shows
   "RESTARTING..." / "PLAY AGAIN!" for 500 ms and only then sends
   `countdown_started`, so the web's reverse flash and the device stay in
   step. If both arrive together, the countdown wins.
7. **No formula copied into JavaScript.** `fake_live_game.js` reads deadlines,
   sequence lengths and base points from `docs/game_rules.json`, and the speed
   bonus from a per-level step table that `export_rules.py` computes with
   `game_rules.speed_bonus` (and self-checks). This also keeps Python's
   round-half-to-even exactly.
8. **LCD is 20 x 4.** "PRESS RESET TO PLAY AGAIN" has 25 characters, so it is
   split over lines 3 and 4 ("PRESS RESET TO" / "PLAY AGAIN").
9. **"Last results" needed a newest-first list**, so `GET
   /api/game-sessions/recent?limit=5` was added (the leaderboard is by
   score). It replaces the kiosk's old "Hall of Fame" top 5 on `/live`.
10. **"Device offline"** (connection chip) means this screen lost the server:
    the stream AND the polling fallback fail. The ESP32 sends nothing between
    games, so the server cannot tell "device idle" from "device off".
11. **Per-device rate limit** 600 requests/minute (express-rate-limit keyed by
    the authenticated device; batching every 250 ms needs about 240).
12. **Panel colours** come from the written description in the task (the
    reference image was not visible to the assistant): red `#d9434d`, orange
    `#ef8a2f`, yellow `#e0b932`, green `#4aab72`, blue `#3b78c4`, purple
    `#8e55b8`, panel `#f1f4f5`, border `#3e5a6e`, LCD `#172d3b`. A lit button
    gets a lighter fill, a thicker ring, scale 1.06 AND a hard outer ring in
    its own colour (the first version only got lighter and read as "faded").

### Verification (real runs, copy database `backend/data/live_test.db`, port 3100, deleted afterwards)

- Backend `npm test`: 9 files, **123 passed** (100 kept + 3 blocklist + 20 live).
  Frontend `npm test`: 8 files, **114 passed** (77 kept + 37 live). Build and
  lint clean.
- `fake_live_game.js` scenarios, 3 SSE "tabs" open the whole time: fast
  (win, 12,558), sloppy, `--reset-at 3`, `--reset-during-countdown`,
  `--play-again` (2 games), `--latency-ms 300 --spike`. **8 games, 508
  events, every tab received all 508.** Checked per game from the captured
  stream: no `countdown_started` after `game_started` (retries and level-ups
  never count down), every `game_finished` has exactly one DB row with the
  same score, the abandoned game (RESET mid-game) has none, RESET during the
  countdown gives one restart (`CD RESET CD`), 7 new rows for 7 finished games.
- **Abandon:** a game left silent for 95 s was broadcast as `abandoned`.
- **Reconnect:** the server was killed mid-game: the chip showed
  "Reconnecting...", the stream reconnected after the restart, and the
  mirror continued with the right level and score. (Chrome's offline
  emulation does not cut an open stream, so a real kill was used.) This test
  found a bug in the fake device: a failed batch stopped all later ones; it
  now drops the batch and goes on, like the firmware.
- **Latency (server only, localhost):** POST to SSE delivery over 200
  events: **median 3.07 ms, p95 5.27 ms, max 70.18 ms**. Real Wi-Fi latency is
  unmeasured until the hardware test (film the panel and the TV).
- **Screens:** headless Chrome at 360x740, 768x1024, 1280x720 and 1920x1080,
  live and demo mode, 22 states each; 0 console errors, no sideways scroll.
  Final: LCD text 32.2 px and labels 34.4 px on 1920; the panel ends at 716
  px on 1280x720; the panel never moves between states. Screenshots (local,
  gitignored): `docs/screenshots/live/before-revision/` and
  `docs/screenshots/live/final/` (with `report.json`).
- **moderate.js** on the copy database: list, clear-nickname (dry run, then
  `--yes`), block-add (the running server refused "Pangit Ako" right away),
  delete-game on a real RR01 game refused without and with a wrong
  `--confirm`, deleted with the exact id; friendly errors with exit 1. The
  blocklist missed "B1g F-u-c-k" (single letters inside a longer name); fixed
  by joining runs of single letters, and tested.
- **Firmware** compiled (arduino-cli 1.5.1, esp32 core 3.3.12) with live
  events on (990,908 bytes flash) and off (988,688), 0 warnings. Not run.

### Assumptions and limitations

1. **Not run on hardware.** The ESP32 live module, the real Wi-Fi latency and
   the real TV were not tested (checklist in the firmware README).
2. **One mirror.** With several devices sending at once, `/live` follows the
   device that sent the newest event.
3. **Browsers allow about 6 connections per host over HTTP/1.1**; every open
   `/live`-capable tab of the site holds one for the stream. One kiosk tab is
   fine; dozens of tabs in ONE browser would stall that browser.
4. **Rate limiter and live state are per server process** (memory).
5. **Demo mode is a script**: its numbers are what a device would send, not
   computed rules.
6. **Sound** plays only after a click on the page (browser autoplay rules) and
   is off by default; the hardware plays its own sound.

## How to play brochure and visitor wording

`/how-to-play` explains the game, the rank and the animal for event visitors;
every visitor string now lives in `frontend/src/content/visitorText.js` or
`howToPlay.js` and follows plain-language rules (docs/FRONTEND.md "Visitor
text"). Frontend only; no backend, API or model change.

### Facts verified against the code (the brochure reads them at build time)

| Fact in the brochure | Value | Source |
|---|---|---|
| Lives | 3 | `ml/game_rules.py` START_LIVES -> `docs/game_rules.json` |
| Levels | 15 | MAX_LEVEL |
| Points per cleared level | 100 x level | POINTS_PER_LEVEL, `points_for_pass` |
| Bonus maximum | 50 | MAX_SPEED_BONUS (and the exported bonus table) |
| Time per button | 3 seconds at level 1, 1.5 seconds from level 9 | `deadline_seconds` = max(1.5, 3.0 - 0.2 x (level - 1)) |
| Pattern grows one step per level | level + 2 | `sequence_length` |
| Worked example | level 1, 3 lights, 4.5 seconds: 25 bonus, 125 points | `speed_bonus_steps` of level 1 in `game_rules.json` |
| Animal groups | top 10% Chimpanzee 90-100, next 15% Dolphin 80-90, next 20% Elephant 70-80, next 25% Orangutan 60-70, rest Pig 50-60 | `backend/artifacts/animal.json` "tiers" (same as `IQ_RANGES` in `ml.js`) |
| How the animal is found | the closest earlier game (2,000 practice games + real games); that game's score compared with the practice games picks the group | `matchAnimal` in `backend/src/services/ml.js` |
| What decides the rank | **only how fast you press** right now | `skill.json`: every split that changes the answer is on `avg_reaction_sec`; the one `final_score` split has "Pro" on both sides |
| Rank speed ranges | Pro: about 0.67 seconds or less per button; Intermediate: about 0.67 to 0.84; Beginner: slower | thresholds 0.6645 / 0.8375 s in `skill.json`, derived by `frontend/gameFacts.mjs` |
| RESET during a game: hold about one second | proposed | `docs/LIVE_PROTOCOL.md` (PROPOSED, needs the firmware owner) |

**Where the code disagrees with the task text:** the task suggested "we check
how fast you press, how long a pattern you remembered and how many you got
right". The trained model (`skill.json`) uses only speed, so the brochure says
"Right now, how fast you press matters most" and gives the speed ranges. If
the model is retrained, `gameFacts.mjs` re-derives the ranges, or gives no
numbers when speed alone no longer decides.

### Decisions

1. **Numbers come from a Vite virtual module** (`virtual:game-facts`, built by
   `frontend/gameFacts.mjs` from the JSON files), so the 340 kB `animal.json`
   never reaches the browser and nothing is typed twice. A content test
   compares the brochure with the files.
2. **"prize" was removed** from every visitor text, component, class and doc
   (there is no real prize at this event): "Your prize" -> "Your animal", "No
   prize" -> "No animal yet", `PrizeTicket` -> `MysteryTicket`, `.prize-tag`
   -> `.animal-tag`, "prize ribbon" -> "ribbon". The word stays only in the
   banned list of `wordingRules.js`.
3. **Rank vs place:** Beginner / Intermediate / Pro is the "rank" (stamp, with
   a "?" link); the leaderboard position is now "Place #N" / "Place".
4. **Leaderboard "?" links once, in the title row**, not on every ticket:
   each ticket is a link (a link inside a link is invalid HTML), and 20 extra
   44 px targets would break the Top 10 fit on 1920x1080.
5. **The site opens on the live game** (`/` redirects to `/live`); the
   leaderboard moved to `/leaderboard`. Nav: Live game, Leaderboard, How to play.
6. **Philippine time, 12-hour clock** for "Updated" and the game page date
   (`Asia/Manila`, e.g. "8:27:05 PM").
7. **Panel and footer buttons show colours only** (no C4 ... A4 notes).
8. **A stall found and fixed:** after full page loads, each old page kept its
   live stream open for a while (back/forward cache), so every ~5th page load
   waited about 4 seconds for a free connection. The stream now closes on
   `pagehide` (and reopens on `pageshow`): no stall in 12 timed loads.
9. **QR only on paper**, encoded in the browser by `lean-qr/nano` (about 4 kB,
   error correction H, no network). Address: `VITE_PUBLIC_URL`, else the
   page's own origin unless it is localhost.

### Verification (copy database, port 3100, deleted afterwards)

- Frontend `npm test`: **138 passed** (114 before + 24: brochure facts,
  wording, QR rule, nav, anchors, "?" links, print-only QR, Manila clock, one
  print button, the A4 `@page` rule, black print dots, Wi-Fi lines);
  build and lint clean. Backend unchanged: 123 passed.
- Headless Chrome at 360, 768, 1280x720, 1920x1080: no sideways scroll, body
  text 18 px, tap targets 44 px, sticky contents at the top and focus moved to
  the panel, both "?" links on the result and game pages, only the LAN host
  requested, 0 console errors. Print to PDF (portrait A4, the only layout):
  **1 page** (LAN and localhost); the printed QR decodes to
  `http://192.168.1.5:3100/how-to-play`.
- Bundle: main JS 322.52 -> 328.89 kB (103.48 kB gzip) (visitor text module, "?" links, Manila
  clock); the brochure is a lazy 20 kB chunk (8 kB gzip) including the QR
  encoder.

### Limitations

1. The Filipino text **needs review by a native speaker**.
2. The panel's 20 x 4 display still uses the console's words ("WATCH
   SEQUENCE", "SAME SEQUENCE AGAIN"); changing them needs the firmware owner
   (`docs/LIVE_PROTOCOL.md`) and the live reducer.
3. Reading ease is a Flesch estimate with a simple syllable counter.
4. The QR depends on the laptop keeping its IP; phones on mobile data cannot
   open it.

## Synthetic data (how it was made)

`ml/simulate_games.py` creates fake-but-realistic finished games using only the constants and formulas imported from `ml/game_rules.py`. Defaults are **2,000 games with seed 42**, written to three gitignored CSVs:

- `games.csv`: one row per finished game.
- `attempts.csv`: one row per level attempt, in game order.
- `players_hidden.csv`: one row per game with hidden labels only.

Each fake player gets a hidden skill value in `0..1` and a hidden skill group: `Beginner`, `Intermediate`, or `Pro`. The group ranges overlap on purpose. Press speed, correctness probability, lapse probability, and skill ranges are plausible for a rhythm game but are **not measured from humans**. A failed attempt loses a life and retries the same level; a game ends after 3 failed attempts or a win at Level 15.

### Timing interpretation

The rules give a **per-press** deadline, so the simulator checks each individual press against that deadline. A press that is too slow produces `timeout`.

The `response_time` for a whole attempt is the sum of the individual press times, which matches "time from end of playback to last correct press" for a sequential sequence.

Response values in `attempts.csv` follow the session-record convention:

- `pass`: total response time for the sequence, in milliseconds.
- `wrong`: time until the wrong press, in milliseconds.
- `timeout`: `0` (matching the example session record).

`avg_press_ms` is only filled for passes because the model feature only uses pass attempts.

### Hidden player labels (Phase A2)

`ml/data/players_hidden.csv` has one row per game:

| Column | Description |
|---|---|
| `session_id` | Links to `games.csv` and `attempts.csv`. |
| `player_type` | Hidden skill group: `Beginner`, `Intermediate`, or `Pro`. Same value as `games.csv` `skill_label`. |
| `hidden_skill` | The simulator's hidden skill value, 0-1. This is the value used to generate the player's performance. |
| `hidden_speed` | A 0-1 speed score derived from the simulator's existing `press_mean` (expected seconds per press). Higher = faster. |

Important rules for this file:

- It is **only for labels/analysis**. Never feed it to a model as an input.
- The models use the 4 gameplay features, not the hidden values.
- `hidden_speed` is not a new random draw. The simulator already uses `press_mean` to generate press times; the CSV stores a normalization of that same value:
  `clip((1.15 - press_mean) / (1.15 - 0.45), 0, 1)`.
- Adding this file did **not** change the RNG stream. `games.csv` and `attempts.csv` were byte-identical before and after:
  - `games.csv` SHA-256: `44824524BC650B8E39A9457AB4212FBDA0A77F2A729E536A8CA4EC2ED403CDAE`
  - `attempts.csv` SHA-256: `2542EFA84EBDB26001BF46D8790930A0D9343FAE66E36500C07E67953DB5AE75`
  - `players_hidden.csv` SHA-256: `B9CCAF42ADB090610B5BA482949B2363AE3F573D223475180E5D05A466C94A1E`

### Data dictionary: `ml/data/games.csv`

One row per finished game.

| Column | Type | Description |
|---|---|---|
| `session_id` | string | Unique synthetic session ID, e.g. `SYN-000001`. |
| `final_score` | integer | Total score. |
| `avg_reaction_sec` | real | Per-press average reaction time over passed attempts, or `3.0`. |
| `success_rate` | real | Passed attempts / all attempts. |
| `highest_sequence_length` | integer | Final sequence length reached. |
| `skill_label` | string | Hidden synthetic skill group: `Beginner`, `Intermediate`, `Pro`. Training label for the classifier. |
| `next_level_steps` | integer | Bootstrap difficulty target: 0, 1, or 2. |
| `outcome` | string | `win` or `game_over`. Audit field. |
| `final_level_attempted` | integer | Level of the last attempt. Difficulty-model `level` input. |
| `successful_rounds` | integer | Number of passed attempts. |
| `failed_attempts` | integer | Number of failed attempts. |
| `total_attempts` | integer | `successful_rounds + failed_attempts`. |

### Data dictionary: `ml/data/attempts.csv`

One row per level attempt, in game order.

| Column | Type | Description |
|---|---|---|
| `session_id` | string | Links to `games.csv`. |
| `level` | integer | Level attempted. |
| `attempt_number` | integer | Try number at this level (increments after a failure). |
| `sequence_length` | integer | `level + 2`. |
| `deadline_sec` | real | Per-press deadline for this level. |
| `result` | string | `pass`, `wrong`, or `timeout`. |
| `response_ms` | integer | Pass: total response time. Wrong: time until the wrong press. Timeout: `0`. |
| `avg_press_ms` | real or blank | `response_ms / sequence_length` for a pass; blank for a failure. |
| `presses_attempted` | integer | Presses attempted before the attempt ended. |
| `presses_correct` | integer | Correct presses before the attempt ended. |
| `fail_press` | integer or blank | 1-based press number where the attempt failed; blank for a pass. |
| `speed_bonus` | integer | 0..50 bonus for a pass; 0 for a failure. |
| `points` | integer | `100 * level + speed_bonus` for a pass; 0 for a failure. |
| `lives_after` | integer | Lives remaining after the attempt. |
| `score_after` | integer | Cumulative score after the attempt. |

### Snapshot of the default generated data

Defaults: 2,000 games, seed 42.

| Item | Value |
|---|---|
| Games | 2,000 |
| Level attempts | 24,003 |
| Hidden-player rows | 2,000 |
| `hidden_skill` range | 0.050065 - 0.984973 |
| Passes | 18,593 (77.5%) |
| Wrong presses | 4,824 (20.1%) |
| Timeouts | 586 (2.4%) |
| Wins | 329 (16.45%) |
| Game overs | 1,671 (83.55%) |
| Mean final score | 5,821.79 |
| Median final score | 4,775.50 |
| Score range | 0 - 12,532 (theoretical max 12,750) |
| Mean final level attempted | 10.13 |

Skill labels:

| Label | Games | Win rate | Mean score | Mean final level |
|---|---|---|---|---|
| Beginner | 659 | 0.9% | 3,215.65 | 7.73 |
| Intermediate | 813 | 11.4% | 5,805.19 | 10.29 |
| Pro | 528 | 43.6% | 9,100.11 | 12.88 |

Difficulty bootstrap target:

| `next_level_steps` | Games |
|---|---|
| 0 | 403 |
| 1 | 1,122 |
| 2 | 475 |

These numbers change if `--games` or `--seed` changes. Project results must use seed 42 unless there is a documented reason to change it.

### Assumptions about the synthetic data

1. **`accuracy` for the difficulty model means `success_rate`.** No separate accuracy field is defined in the feature list.
2. **`level` for the difficulty model means `final_level_attempted`.** It is the level of the last attempt and equals `highest_sequence_length - 2`.
3. **`reaction_ratio = avg_reaction_sec / deadline_seconds(level)`.** The model input is not clamped. The bootstrap target clamps the ratio at 1.0 when computing its performance score.
4. **The difficulty target is a bootstrap rule, not real truth.** It exists only because no real adaptive-difficulty decisions exist yet.
5. **Skill labels come from the hidden simulator skill, not score percentiles.** The generator chooses a hidden group and then generates performance from it. Ranges overlap on purpose.
6. **Failure response times follow the session example.** Wrong attempts record time until the wrong press; timeouts record `0`.
7. **Per-press deadline interpretation.** Each individual press is checked against the deadline, and the total response is the sum of press times.
8. **The fake player parameters are invented.** Press speed, correctness probability, lapse probability, and skill ranges are plausible for a rhythm game but are not measured from humans.
9. **Session metadata is intentionally omitted from the training table.** `device_id` and `duration_seconds` are not model features. Later backend exports can add them for audit.
10. **The animal matcher is a fun feature.** The UI must say "just for fun, not a real IQ test".
11. **`players_hidden.csv` is labels-only.** It exists so later phases can study or re-derive labels. It must never be an input feature at training or inference time.
12. **`hidden_speed` is a normalized existing value, not a new random draw.** It is derived from the simulator's `press_mean`, so the RNG stream and the other CSV files stay unchanged.

## Model 1 Adaptive Difficulty

Phase C trained the Adaptive Difficulty model and exported `backend/artifacts/difficulty.json`. The model is a `LinearRegression` that recommends how many levels to add next.

### Inputs and target

| Item | Value |
|---|---|
| Input 1 | `accuracy` = `success_rate` (0-1) |
| Input 2 | `reaction_ratio = avg_reaction_sec / deadline_seconds(final_level_attempted)` |
| Input 3 | `level` = `final_level_attempted` |
| Target | `next_level_steps` read directly from `games.csv` |
| Split | 80/20, seed 42: 1,600 train rows, 400 test rows |
| Model | `LinearRegression` |

- `reaction_ratio` is built with the helper in `ml/game_rules.py`; no game constants are copied.
- Forbidden inputs are asserted in code: `skill_label`, `player_type`, `hidden_skill`, `hidden_speed`.
- The model input `reaction_ratio` is not clamped. Only the bootstrap target clamps its ratio at 1.0.

### Bootstrap target

The difficulty target is **not real ground truth**. It is a bootstrap rule so the ML phase has a target to learn from. It should be replaced when real gameplay/difficulty decisions exist.

The rule uses the same inputs the model will see:

```text
ratio = min(avg_reaction_sec / deadline_seconds(level), 1.0)
performance = 0.75 * accuracy + 0.25 * (1 - ratio)

performance >= 0.74  -> 2
performance >= 0.62  -> 1
otherwise            -> 0
```

The thresholds were chosen so the synthetic data contains a mix of 0, 1, and 2 instead of almost always 1. They are a project choice, not a game rule.

Class split of `next_level_steps` in the full data:

| Steps | Games | % |
|---|---|---|
| 0 | 403 | 20.15% |
| 1 | 1,122 | 56.10% |
| 2 | 475 | 23.75% |

### Results

- **R2: 0.7883**
- **MAE: 0.2542**

Exported model:

| Field | Value |
|---|---|
| `intercept` | -0.665421 |
| weight `accuracy` | 1.251040 |
| weight `reactionRatio` | -0.939677 |
| weight `level` | 0.121498 |

**Important:** `next_level_steps` is a **bootstrap rule**, not real player behavior. The R2 above only shows how well `LinearRegression` reproduces that rule. It does **not** show that the model understands real players, and it is not evidence that the recommended progression is good game design.

`difficulty.json` shape:

```json
{
  "version": 1,
  "intercept": -0.665421,
  "weights": {
    "accuracy": 1.251040,
    "reactionRatio": -0.939677,
    "level": 0.121498
  }
}
```

### `predict_steps` examples

`predict_steps(accuracy, reaction_ratio, level)` rounds half up and clamps to `0..2`.

| Player | accuracy | reaction_ratio | level | steps |
|---|---:|---:|---:|---:|
| Fast and accurate | 0.95 | 0.40 | 12 | 2 |
| Average | 0.80 | 0.80 | 8 | 1 |
| Struggling | 0.40 | 1.30 | 4 | 0 |
| Slow but accurate | 0.95 | 1.20 | 12 | 1 |
| Fast but sloppy | 0.40 | 0.40 | 6 | 0 |

The brief also allows an optional ESP32 fallback: if the server is slow or down, the ESP32 adds +1. That fallback is not part of the Python export.

### Export verification

`ml/check_exports.py` rebuilds the same LinearRegression split and compares `difficulty.json` with sklearn on the same 100 random games:

- Intercept and weights: exact match.
- Raw predictions: **100/100** match (maximum difference `2.22e-16`).
- Rounded and clamped steps: **100/100** match.

## Model 2 Skill Classifier

Phase B trained the Skill Classifier and exported `backend/artifacts/skill.json`. Phase B2 confirmed that the export already matched the required JSON format.

### Inputs and labels

- Target: `player_type` from `players_hidden.csv`; this is the simulator's hidden skill class, **not** a score percentile.
- Inputs, in exact order: `final_score`, `avg_reaction_sec`, `highest_sequence_length`, `success_rate`.
- Forbidden inputs are asserted in code: `skill_label`, `player_type`, `hidden_skill`, `hidden_speed`, `next_level_steps`.
- Split: 80/20 stratified, seed 42: 1,600 train rows, 400 test rows.
- Model: `DecisionTreeClassifier(max_depth=3)`.

Class counts in the full data:

| Class | Games |
|---|---|
| Beginner | 659 |
| Intermediate | 813 |
| Pro | 528 |

### Results

**Accuracy: 0.6650 (66.50%)**, which is 266 correct out of 400 held-out games.

Confusion matrix (rows = true, columns = predicted):

| True \ Predicted | Beginner | Intermediate | Pro |
|---|---|---|---|
| Beginner | 111 | 21 | 0 |
| Intermediate | 43 | 102 | 18 |
| Pro | 0 | 52 | 53 |

What the confusion matrix shows:

- **Beginner recall is 84.1% (111/132).** All 21 Beginner errors are predicted Intermediate; none are predicted Pro.
- **Intermediate recall is 62.6% (102/163).** Its errors split between Beginner (43) and Pro (18).
- **Pro recall is 50.5% (53/105).** Half of the true Pro games are predicted Intermediate; none are predicted Beginner.
- **No Beginner/Pro cross-errors.** Mistakes stay between neighbouring classes, which is expected because the hidden skill ranges overlap on purpose.
- **Pro is under-detected.** The tree mostly splits on `avg_reaction_sec` (root threshold `0.78`), so slower but otherwise strong games can look Intermediate. A depth-3 tree has at most 8 leaves, which limits how finely it can separate the overlapping groups.
- The exported tree uses only `avg_reaction_sec` and one `final_score` split. `success_rate` and `highest_sequence_length` are allowed inputs but are not selected at depth 3. That is a model choice, not a data leak; the assert still guarantees forbidden columns are absent.

### Export shape

`skill.json` has 15 nodes. An internal node goes **left when `value <= threshold`**, otherwise right. Leaf nodes contain a class name.

```json
{
  "version": 1,
  "features": ["final_score", "avg_reaction_sec", "highest_sequence_length", "success_rate"],
  "nodes": [
    {"id": 0, "feature": 1, "threshold": 0.78, "left": 1, "right": 8},
    {"id": 1, "leaf": "Intermediate"}
  ]
}
```

Required fields are `version`, `features`, and `nodes`. Internal nodes use `id`, `feature`, `threshold`, `left`, and `right`; leaf nodes use `id` and `leaf`.

### Export verification

`ml/check_exports.py` walks the exported tree in plain Python (no sklearn prediction code) and checks 100 random games with seed 42:

- Skill tree: **100/100** predictions match sklearn.

## Model 3 Animal IQ Matcher

Phase B built the Animal IQ Matcher and exported `backend/artifacts/animal.json`. Phase B2 changed the export to the required top-level `mean`, `std`, and `rows` shape.

### Method

- Script: `ml/train_animal.py`.
- Fit on all 2,000 games. This is a lookup-style nearest-neighbor model, so there is no train/test split.
- The 4 features are standardized with `StandardScaler`; the full-data mean/std are saved in the JSON.
- `score_percentile` is computed with `pandas.rank(pct=True, method="average")`. The observed range is `0.001250` to `0.999750`, which is effectively 0-1.
- Express must standardize the request with the saved mean/std, find the nearest row by Euclidean distance, then map that row's percentile through `tiers`.
- The UI must clearly say **"just for fun, not a real IQ test"**.

### Animal score percentiles

The maximum score is about **12,750**, so the animal matcher **must use score percentiles, not fixed score numbers**. The percentile tiers are:

| Score percentile | Animal | IQ range |
|---|---|---|
| Top 10% | Chimpanzee | 90-100 |
| Next 15% | Bottlenose Dolphin | 80-90 |
| Next 20% | Elephant | 70-80 |
| Next 25% | Orangutan | 60-70 |
| Remaining 30% | Pig | 50-60 |

Animal tier counts from the 2,000 percentiles:

| Animal | Games |
|---|---|
| Chimpanzee | 198 |
| Bottlenose Dolphin | 303 |
| Elephant | 400 |
| Orangutan | 499 |
| Pig | 600 |

### Export shape

```json
{
  "version": 1,
  "mean": [5821.794, 0.792514, 12.132, 0.740551],
  "std": [3970.274996, 0.160570, 3.623614, 0.129603],
  "rows": [
    {
      "id": "SYN-000001",
      "features": [12459.0, 0.698, 17.0, 0.938],
      "score_percentile": 0.8775
    }
  ],
  "features": ["final_score", "avg_reaction_sec", "highest_sequence_length", "success_rate"],
  "tiers": [
    {"percentile_min": 0.90, "animal": "Chimpanzee", "iq_range": "90-100"},
    {"percentile_min": 0.75, "animal": "Bottlenose Dolphin", "iq_range": "80-90"},
    {"percentile_min": 0.55, "animal": "Elephant", "iq_range": "70-80"},
    {"percentile_min": 0.30, "animal": "Orangutan", "iq_range": "60-70"},
    {"percentile_min": 0.00, "animal": "Pig", "iq_range": "50-60"}
  ]
}
```

The required export fields are `version`, `mean`, `std`, and `rows`; `features` and `tiers` are extra metadata. `rows` is ordered by `session_id`, and each row contains the session id, the 4 raw features, and the score percentile.

### Export verification

`ml/check_exports.py` re-implements nearest-neighbor distance in plain Python and checks 100 random games with seed 42:

- Animal mean/std, row ids, row features, and percentiles: exact match with sklearn/pandas.
- Nearest neighbor: **100/100** distances match sklearn. 98 indices match exactly; 2 are equal-distance ties caused by duplicate feature rows, which produce the same percentile and animal.
- Jittered unseen-style queries: **100/100** distances match sklearn.
- Animal tier boundaries and all 2,000 percentile mappings are valid.

## Metrics (all numbers so far)

### Data metrics

| Metric | Value |
|---|---|
| Games | 2,000 |
| Level attempts | 24,003 |
| Hidden-player rows | 2,000 |
| Passes | 18,593 (77.5%) |
| Wrong presses | 4,824 (20.1%) |
| Timeouts | 586 (2.4%) |
| Wins | 329 (16.45%) |
| Game overs | 1,671 (83.55%) |
| Mean final score | 5,821.79 |
| Median final score | 4,775.50 |
| Minimum final score | 0 |
| Maximum final score | 12,532 |
| Theoretical maximum score | 12,750 |
| Mean final level attempted | 10.13 |
| `hidden_skill` minimum | 0.050065 |
| `hidden_skill` maximum | 0.984973 |

Skill-label metrics:

| Label | Games | Win rate | Mean score | Mean final level |
|---|---|---|---|---|
| Beginner | 659 | 0.9% | 3,215.65 | 7.73 |
| Intermediate | 813 | 11.4% | 5,805.19 | 10.29 |
| Pro | 528 | 43.6% | 9,100.11 | 12.88 |

### Model 1: Adaptive Difficulty metrics

| Metric | Value |
|---|---|
| Train rows | 1,600 |
| Test rows | 400 |
| R2 | 0.7883 |
| MAE | 0.2542 |
| Intercept | -0.665421 |
| Weight `accuracy` | 1.251040 |
| Weight `reactionRatio` | -0.939677 |
| Weight `level` | 0.121498 |
| `next_level_steps = 0` | 403 games (20.15%) |
| `next_level_steps = 1` | 1,122 games (56.10%) |
| `next_level_steps = 2` | 475 games (23.75%) |

### Model 2: Skill Classifier metrics

| Metric | Value |
|---|---|
| Train rows | 1,600 |
| Test rows | 400 |
| Accuracy | 0.6650 (66.50%) |
| Correct test games | 266 of 400 |
| Beginner recall | 84.1% (111/132) |
| Intermediate recall | 62.6% (102/163) |
| Pro recall | 50.5% (53/105) |
| Exported tree nodes | 15 |
| Tree depth | 3 (maximum 8 leaves) |
| Root split | `avg_reaction_sec <= 0.78` |

Skill confusion matrix:

| True \ Predicted | Beginner | Intermediate | Pro |
|---|---|---|---|
| Beginner | 111 | 21 | 0 |
| Intermediate | 43 | 102 | 18 |
| Pro | 0 | 52 | 53 |

### Model 3: Animal IQ Matcher metrics

| Metric | Value |
|---|---|
| Games in lookup | 2,000 |
| Mean (4 features) | [5821.794, 0.792514, 12.132, 0.740551] |
| Std (4 features) | [3970.274996, 0.160570, 3.623614, 0.129603] |
| Score percentile minimum | 0.001250 |
| Score percentile maximum | 0.999750 |
| Tier percentile minimums | 0.90, 0.75, 0.55, 0.30, 0.00 |
| Chimpanzee games | 198 |
| Bottlenose Dolphin games | 303 |
| Elephant games | 400 |
| Orangutan games | 499 |
| Pig games | 600 |

### Export verification metrics

All checks use 100 random games with seed 42.

| Check | Result |
|---|---|
| Skill tree predictions | 100/100 match sklearn |
| Difficulty intercept and weights | Exact match with sklearn |
| Difficulty raw predictions | 100/100 match; maximum difference 2.22e-16 |
| Difficulty rounded and clamped steps | 100/100 match |
| Animal mean/std | Exact match with sklearn |
| Animal rows | 2,000 ids and features match `games.csv` |
| Animal percentiles | Exact match with pandas |
| Nearest-neighbor distances | 100/100 match sklearn |
| Nearest-neighbor indices | 98 exact matches; 2 equal-distance ties |
| Jittered queries | 100/100 distances match sklearn |
| Animal tiers | 5 boundaries valid; all 2,000 percentiles map to an animal |

## How to retrain with real data

1. Export real finished sessions from the backend to the **same columns** as `games.csv`, `attempts.csv`, and `players_hidden.csv`.
2. Recompute `avg_reaction_sec`, `success_rate`, and `highest_sequence_length` from the session/attempt rows using `ml/game_rules.py`. Keep the documented definitions:
   - `avg_reaction_sec` = average over **pass** attempts of `(response_ms / 1000) / sequence_length`, or `3.0` if there are no passes.
   - `success_rate` = `successful_rounds / (successful_rounds + failed_attempts)`, or `0.0` if both are zero.
   - `highest_sequence_length` = `final_sequence_length`.
3. Provide real `skill_label` values through an agreed labeling process. Do not derive them from score percentiles. `players_hidden.csv` is labels-only; hidden labels exist only for synthetic data.
4. For `next_level_steps`, either keep the documented bootstrap rule or replace it with the game designer's real desired progression. The current target is a bootstrap rule, not ground truth.
5. Keep seed **42** for reproducible experiments unless a new seed is documented.
6. Rerun the three training scripts, then the export checker:

```bash
python ml/train_skill.py
python ml/train_animal.py
python ml/train_difficulty.py
python ml/check_exports.py
```

7. Write JSON only to `/backend/artifacts`. Never add a Python server to production; Express reads the exported JSON.

The game itself must still use `ml/game_rules.py` formulas when computing features, and real sessions must follow `docs/session.schema.json`.

## Limitations

- **Everything is trained on synthetic data.** Good model scores on this data do **not** prove the models work on real players.
- **The difficulty target is a bootstrap rule.** R2 and MAE only measure how well the model reproduces that rule, not real player behavior or good game design.
- **Difficulty is trained on whole-game aggregates but used mid-game.** The model learns from finished-game values such as final success rate and final level, but in play it must recommend the next step before the game is over. Its mid-game inputs may be noisier or differently distributed than training rows.
- **`success_rate` and `highest_sequence_length` overlap with score.** A game ends after 3 failed attempts, so these features are partly consequences of the same events that determine `final_score`; they are not independent measurements.
- **The skill classes overlap in the simulator.** This is why accuracy is only **66.5%** and Pro recall is about **50.5%** (53/105). Mistakes stay between neighbouring classes; no Beginner game is predicted Pro and no Pro game is predicted Beginner.
- **The skill classifier learns the simulator's hidden skill definition.** Real labels will need another source, such as a coach or a clearly documented rule.
- **The difficulty target is a heuristic.** It may recommend progression that the game designer does not agree with.
- **The synthetic data has cleaner patterns than real play.** Real hardware may add input latency, missed presses, and noisier timing.
- **Timeouts are less common than wrong presses** in the generated data because fake players are fairly accurate.
- **Score tiers must be computed as percentiles from the current dataset.** Fixed score cutoffs would break because the maximum score is about 12,750 and the distribution can change.
- **Hidden labels only exist for synthetic data.** Real sessions will not have `hidden_skill` or `hidden_speed` unless the game collects or estimates them separately.
- **The animal IQ matcher is for fun only.** It is **not a real IQ measurement**, and the UI must say so.
- **There is no real ESP32 gameplay data yet.** The database, backend and frontend exist, but every game in them so far is synthetic or a fake-uploader replay.
