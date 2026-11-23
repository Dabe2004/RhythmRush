# Rhythm Rush (Musical Button Game) - Project Context

## Status
- ESP32 hardware/firmware is NOT finished. No real gameplay data exists yet.
- Build order: ML on SYNTHETIC data -> SQLite database -> Express backend -> fake ESP32
  uploader -> React frontend. Everything must be easy to retrain with real data later.
- DONE so far: Phase A, A2, B, B2, C, D, E, F, G, H, I, J1, J2, K, L, M (all ML training scripts and exported
  artifacts, plus the SQLite database, the upload endpoint, ML predictions inside Express, the read/gameplay
  endpoints, the fake ESP32 uploader, the React leaderboard, the live result/kiosk page, the session detail
  page, production serving, hardening, README and demo checklist, the ESP32
  network client in /firmware (compiled, not yet run on hardware), the carnival-booth visual redesign of
  the frontend (docs/DESIGN.md; same routes, API calls, polling and kiosk logic), the Top 10 leaderboard
  (podium for ranks 1-3 + compact list for 4-10, getLeaderboard(10); ties kept; win confetti behind the text),
  the admin removal (one-day event: no admin API/page/password; laptop-only tools/moderate.js and the
  nickname blocklist backend/blocklist.txt instead; see "Admin removed" in docs/NOTES.md), and the live game
  mirror (docs/LIVE_PROTOCOL.md PROPOSED; POST /api/live/events + SSE /api/live/stream, in memory only; /live
  panel with demo mode; tools/fake_live_game.js; ml/export_rules.py -> docs/game_rules.json; firmware
  LiveEvents module compiled, not run), and the visitor "How to play" brochure (/how-to-play, numbers built
  from game_rules.json + artifacts, print-only QR, English/Filipino) with all visitor text in
  frontend/src/content (wording rules tested); the site opens on /live, leaderboard at /leaderboard;
  the /live panel redrawn from a photo of the real box top (pink START, blue LCD, buzzer, green LED over
  each button, no RESET button; button colours changed everywhere to match the box), and the game matched
  to the hardware sketch + gameplay spec (7 levels, 1 2 3 GO! / 1 2 3 BEGIN! before every sequence and turn,
  new pattern after a fail; models retrained; see "Hardware rules" in docs/NOTES.md), "Player #N" instead
  of "Mystery Player" (game_sessions.player_number, migration 002) with "Last results" + "Leaderboard (top 5)"
  on /live, and everything matched to the box's firmware RhythmRushGame.h (adaptive time per press, faster
  lights, START during a game = reset, the /live LCD and LEDs copy rr_render/rr_leds; see "Firmware rules")
- NEXT: a native speaker reviews the Filipino text; agree the live protocol and RESET/countdown behaviour with
  the firmware owner, hardware integration (game logic + pins, using the /firmware network and live layers)
  and its checklists, check /live and the printed QR on the real exhibition TV, tablet and booth Wi-Fi (and
  film the real delay), then retrain the models with real games.

## Rules for you (the AI)
- Do ONE phase at a time, exactly as written. Never start the next phase and never create
  files that belong to a later phase.
- Create exactly the files named. Never rename them. Never create a folder named "models".
- Simple, commented code (the developers are students).
- Run every script/test after writing it and fix errors before you stop.
- Write assumptions and limitations in docs/NOTES.md.
- Never put secrets in code. Use .env and keep .env.example updated.
- Use a fixed random seed (42) so ML results are reproducible.
- At the end of each phase, list the files you created and the command to run them.

## Tech (do not change)
- ML: Python 3 + scikit-learn + pandas + numpy, folder /ml, OFFLINE training only
- Backend: Node.js + Express (CommonJS), folder /backend
- Database: SQLite via the "better-sqlite3" package (synchronous API, no database server).
  DB file: /backend/data/rhythm.db (gitignored). Path comes from DB_PATH in .env.
  Always run: PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
  Use db.transaction(...) for multi-table writes. Tests use ":memory:".
- Frontend: React + Vite + Tailwind, folder /frontend
- Backend tests: vitest + supertest
- In production there is no Python. Express reads exported JSON from /backend/artifacts.
- NO Supabase, NO Postgres, NO "pg" package, NO DATABASE_URL.

## SQLite rules
- Types: TEXT, INTEGER, REAL only. Booleans are INTEGER 0/1. JSON is stored as TEXT
  (JSON.stringify / JSON.parse). Timestamps are TEXT with DEFAULT CURRENT_TIMESTAMP.
- Auto ids: INTEGER PRIMARY KEY AUTOINCREMENT.
- Idempotent upload: INSERT OR IGNORE and check result.changes (0 = duplicate).
- Always use prepared statements with ? placeholders. Never build SQL by string concatenation.

## Folder layout
/ml (game_rules.py, simulate_games.py, train_*.py, check_exports.py, data/ is gitignored)
/backend/artifacts (exported model JSON), /backend/src, /backend/tests, /backend/data (gitignored)
/db (migrations/001_init.sql, 002_player_number.sql, migrate.js, seed.js), /frontend, /tools (fake_esp32.js)
/firmware (later, not yours), /docs (NOTES.md, API.md, session.schema.json)

## Game rules
- 6 buttons, as on the real box: 1 Red, 2 Orange, 3 Blue (top row, left to right), 4 Blue, 5 Yellow,
  6 Red (bottom row). The buttons cannot light up: a green LED above each one shows the sequence.
  The box has one control, START (pink, pin 13); START during a game = RESET straight back to idle.
- Start: 3 lives, Level 1. Sequence length = level + 2. Max Level 7 (9 steps).
- Every attempt: "1 2 3 GO!" -> the random sequence -> "1 2 3 BEGIN!" -> the player's turn.
- Deadline per press: level 1 = 3.0 s. After each pass the box sets the next one (rr_next_deadline):
  max(1.0 s, min(level cap 3.0 - 0.2 * (level - 1), current, (3 * current + 2 * average press + 0.3 s) / 4)).
  A fail keeps it. The lights get faster: cue 500 - 45 ms per level (min 180), gap 200 - 15 ms (min 80).
- Two buttons at once = a mistake. Results show 2 s; "Go!"/"Begin!" 0.5 s.
- Attempt result: "pass", "wrong", or "timeout". A fail loses 1 life and retries the level with a NEW pattern.
- 3 lives lost = game over. Clear Level 7 = win.
- Points for a passed level = 100 * level + speed_bonus
- speed_bonus = round(50 * (1 - response_time / (sequence_length * deadline))), clamped 0..50,
  rounded half up in whole ms like the firmware: (50 * unused + available / 2) / available
- Max total score is about 3,150, so score tiers MUST use percentiles, not fixed numbers.
- All constants/formulas live in /ml/game_rules.py. Import them, never copy them.

## Features per finished game
final_score, avg_reaction_sec, success_rate, highest_sequence_length
- avg_reaction_sec = average over PASS attempts of (response_ms/1000)/sequence_length (3.0 if none)
- success_rate = successful_rounds / (successful_rounds + failed_attempts) (0 if both 0)
- highest_sequence_length = final_sequence_length

## Session record sent by the ESP32 (POST /api/game-sessions, header X-API-Key)
{"session_id":"RR01-000127","device_id":"RR01","outcome":"game_over","final_score":127,
 "highest_level_completed":1,"final_sequence_length":4,"successful_rounds":1,
 "failed_attempts":3,"duration_seconds":42,
 "attempts":[{"level":1,"result":"pass","response_ms":4100},
             {"level":2,"result":"wrong","response_ms":2100},
             {"level":2,"result":"timeout","response_ms":0}]}
Same session_id sent twice must be saved ONCE (return 200 {"duplicate":true}).

## The 3 ML models
1. Adaptive Difficulty - LinearRegression. Inputs: accuracy (0-1), reaction_ratio
   (= avg reaction seconds per press / deadline), level. Output: steps to add next level,
   rounded and clamped 0..2. OPTIONAL: if the server is slow/down the ESP32 adds +1.
   NOTE: the training target is a bootstrap RULE, not real truth. Document this.
2. Skill Classifier - DecisionTreeClassifier(max_depth=3). Inputs: the 4 features.
   Output: Beginner | Intermediate | Pro. Labels come from the simulator's HIDDEN player skill
   class (player_type), NOT from score percentiles. hidden_skill, hidden_speed, player_type and
   skill_label must NEVER be used as model inputs.
3. Animal IQ Matcher - NearestNeighbors(k=1) on the 4 standardized features. The matched
   game's score PERCENTILE picks the animal: top 10% Chimpanzee (IQ 90-100), next 15% Bottlenose
   Dolphin (80-90), next 20% Elephant (70-80), next 25% Orangutan (60-70), rest Pig (50-60).
   UI must say "just for fun, not a real IQ test".

## Export formats (/backend/artifacts)
difficulty.json: {"version":1,"intercept":0.0,"weights":{"accuracy":0.0,"reactionRatio":0.0,"level":0.0}}
skill.json: {"version":1,"features":["final_score","avg_reaction_sec","highest_sequence_length","success_rate"],
  "nodes":[{"id":0,"feature":0,"threshold":100.0,"left":1,"right":2},{"id":1,"leaf":"Beginner"}]}
  (go left when value <= threshold; leaf nodes have "leaf" instead of "feature")
animal.json: {"version":1,"mean":[0,0,0,0],"std":[1,1,1,1],
  "rows":[{"id":"SYN-000001","features":[0,0,0,0],"score_percentile":0.5}]}
  (extra fields such as "tiers" are allowed)
