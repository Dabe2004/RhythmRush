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
  frontend/src/content (wording rules tested); the site opens on /live, leaderboard at /leaderboard
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
/db (migrations/001_init.sql, migrate.js, seed.js), /frontend, /tools (fake_esp32.js)
/firmware (later, not yours), /docs (NOTES.md, API.md, session.schema.json)

## Game rules
- 6 buttons: 1 Red, 2 Orange, 3 Yellow, 4 Green, 5 Blue, 6 Purple
- Start: 3 lives, Level 1. Sequence length = level + 2. Max Level 15 (17 steps).
- Deadline per press (sec) = max(1.5, 3.0 - 0.2 * (level - 1))
- Attempt result: "pass", "wrong", or "timeout". A fail loses 1 life and retries the level.
- 3 lives lost = game over. Clear Level 15 = win.
- Points for a passed level = 100 * level + speed_bonus
- speed_bonus = round(50 * (1 - response_time / (sequence_length * deadline))), clamped 0..50
- Max total score is about 12,750, so score tiers MUST use percentiles, not fixed numbers.
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
