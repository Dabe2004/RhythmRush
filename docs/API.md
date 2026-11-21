# Rhythm Rush HTTP API

Base URL in development: `http://localhost:3000`

All bodies are JSON (`Content-Type: application/json`). All errors are JSON of
the shape `{"error":"code"}` unless noted otherwise.

Device auth is the header `X-API-Key: <device key>`. The database stores only
the SHA-256 hash of the key, in `devices.api_key_hash`.

The same server also serves the built website (`frontend/dist`) on every
non-`/api` path, so `http://<laptop-ip>:3000/` is the leaderboard. Unknown
`/api/...` paths always answer `404 {"error":"not_found"}` as JSON.

**CORS:** browsers get CORS permission only for the same origin and for the
origins in `ALLOWED_ORIGINS` (default: the Vite dev server,
`http://localhost:5173` / `http://127.0.0.1:5173`, and preview on 4173).
Requests without an `Origin` header (the ESP32, curl) are not affected.

The curl examples are written for **Windows PowerShell**. PowerShell aliases
`curl` to `Invoke-WebRequest`, so every example calls `curl.exe`. Bodies are
sent from a file with `--data-binary "@file.json"`; inline JSON quoting is a
pain in PowerShell and is avoided on purpose.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | none | liveness check |
| `POST` | `/api/game-sessions` | device key | upload one finished game |
| `GET` | `/api/game-sessions/latest` | none | newest game (small summary) |
| `GET` | `/api/game-sessions/recent` | none | newest games (Last results) |
| `POST` | `/api/live/events` | device key | live events from the device |
| `GET` | `/api/live/state` | none | live snapshot |
| `GET` | `/api/live/stream` | none | live events (SSE) |
| `GET` | `/api/leaderboard` | none | top scores |
| `GET` | `/api/game-sessions/:id` | none | one session with attempts, features, prediction |
| `PATCH` | `/api/game-sessions/:id/nickname` | none | set the nickname once |
| `POST` | `/api/difficulty/next` | device key | ask the model how many steps to add |
| `GET` | `/api/stats/summary` | none | aggregate numbers (games, averages, histogram) |

---

## GET /api/health

Auth: none. No body.

Response `200`:

```json
{ "ok": true }
```

Errors: `500 {"error":"server_error"}`.

```powershell
curl.exe -s http://localhost:3000/api/health
```

---

## POST /api/game-sessions

Auth: `X-API-Key` of a known device.

Request body (all fields required, see `docs/session.schema.json`):

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
    { "level": 1, "result": "pass", "response_ms": 4100 },
    { "level": 2, "result": "wrong", "response_ms": 2100 },
    { "level": 2, "result": "timeout", "response_ms": 0 }
  ]
}
```

* `outcome`: `"game_over"` or `"win"`.
* `attempts[].level`: 1-15, `result`: `"pass" | "wrong" | "timeout"`,
  `response_ms >= 0`, at most 200 attempts.

Response `201` (new session; the ML fields are `null` when the models could
not run):

```json
{
  "saved": true,
  "skill_rank": "Beginner",
  "animal": "Pig",
  "animal_iq": 56
}
```

Response `200` (the same `session_id` was uploaded before; the prediction is
the one stored on the first upload):

```json
{
  "duplicate": true,
  "skill_rank": "Beginner",
  "animal": "Pig",
  "animal_iq": 56
}
```

Errors:

| Status | Body | When |
|---|---|---|
| `400` | `{"error":"invalid_body","details":[...]}` | a missing/invalid field |
| `400` | `{"error":"invalid_json"}` | body is not valid JSON |
| `401` | `{"error":"unauthorized"}` | missing or unknown key |
| `403` | `{"error":"device_mismatch"}` | `device_id` is not the key's device |
| `413` | `{"error":"payload_too_large"}` | body over 100 kb |
| `500` | `{"error":"server_error"}` | unexpected database error |

```powershell
curl.exe -s -X POST http://localhost:3000/api/game-sessions `
  -H "Content-Type: application/json" `
  -H "X-API-Key: dev-rr01-key" `
  --data-binary "@session.json"
```

---

## GET /api/leaderboard

Auth: none. Query parameter `limit` is an integer `1..100`, default `20`.
Anything else (including `0`, `101`, `abc`, `2.5`) is a `400`.

Ranking: `RANK() OVER (ORDER BY final_score DESC)`, so equal scores share a
rank and the next rank skips (`1, 2, 2, 4`). The page order breaks ties by
`highest_level_completed DESC`, then `received_at ASC`, then `session_id ASC`.

Response `200` (games without a prediction still appear, with `null` ML
fields):

```json
{
  "entries": [
    {
      "rank": 1,
      "session_id": "RR01-000999",
      "nickname": "Alice",
      "final_score": 2470,
      "highest_level_completed": 5,
      "outcome": "win",
      "skill_rank": "Intermediate",
      "animal": "Elephant",
      "animal_iq": 74,
      "received_at": "2026-11-20 13:07:42"
    }
  ]
}
```

Empty database: `200 {"entries":[]}`.

Errors: `400 {"error":"invalid_limit"}` for a bad `limit`;
`500 {"error":"server_error"}`.

```powershell
curl.exe -s "http://localhost:3000/api/leaderboard?limit=20"
```

---

## GET /api/game-sessions/latest

Auth: none. No body.

Returns the newest game, ordered by `received_at DESC, rowid DESC` (rowid breaks
ties because SQLite timestamps have one-second precision). This route is
registered **before** `/api/game-sessions/:id`, so `latest` is never treated as
a session id.

Response `200`:

```json
{
  "session": {
    "session_id": "SIM01-422019119",
    "nickname": null,
    "final_score": 12442,
    "highest_level_completed": 15,
    "outcome": "win",
    "received_at": "2026-11-20 05:22:51"
  }
}
```

Empty database:

```json
{ "session": null }
```

Errors: `500 {"error":"server_error"}`.

```powershell
curl.exe -s http://localhost:3000/api/game-sessions/latest
```

---

## GET /api/game-sessions/:id

Auth: none. No body.

Response `200`:

```json
{
  "session": {
    "session_id": "RR01-000127",
    "device_id": "RR01",
    "outcome": "game_over",
    "final_score": 127,
    "highest_level_completed": 1,
    "final_sequence_length": 4,
    "successful_rounds": 1,
    "failed_attempts": 3,
    "duration_seconds": 42,
    "nickname": null,
    "is_synthetic": 0,
    "received_at": "2026-11-20 13:05:11"
  },
  "attempts": [
    {
      "id": 1,
      "session_id": "RR01-000127",
      "attempt_no": 1,
      "level": 1,
      "result": "pass",
      "response_ms": 4100
    }
  ],
  "features": {
    "session_id": "RR01-000127",
    "avg_reaction_sec": 1.3666666666666667,
    "success_rate": 0.25,
    "highest_sequence_length": 4,
    "final_score": 127
  },
  "prediction": {
    "skill_rank": "Beginner",
    "animal": "Pig",
    "animal_iq": 56,
    "matched_session_id": "SYN-000991",
    "model_versions": { "skill": 1, "animal": 1, "difficulty": 1 }
  }
}
```

* `attempts` is ordered by `attempt_no` (`1..N`).
* `features` and `prediction` are `null` when the row does not exist (older
  uploads, or an upload whose ML step failed).
* `model_versions` is parsed back from JSON text into an object.
* `is_synthetic` is `0` for real uploads, `1` for fake data.

Errors: `404 {"error":"not_found"}` for an unknown id;
`500 {"error":"server_error"}`.

Session ids are never interpolated into SQL, so `'` and `--` in the path are
harmless (they simply produce a `404`).

```powershell
curl.exe -s http://localhost:3000/api/game-sessions/RR01-000127
```

---

## PATCH /api/game-sessions/:id/nickname

Auth: none (the kiosk page has no API key). No key header is needed.

Request body:

```json
{ "nickname": "Player_1 - Red" }
```

Rules: trimmed first, then 1-16 characters, only letters, numbers, spaces,
dashes and underscores (`^[A-Za-z0-9 _-]+$`), and no word from
`backend/blocklist.txt` (checked after undoing case, spaces, `-`, `_`, digit
swaps such as `0`->`o` and repeated letters; see docs/NOTES.md). A blocked
word gets the same `400 invalid_nickname`. A nickname can be set **once**;
only `tools/moderate.js clear-nickname` (run on the laptop) can clear it.

Response `200`:

```json
{ "saved": true, "nickname": "Player_1 - Red" }
```

Errors:

| Status | Body | When |
|---|---|---|
| `400` | `{"error":"invalid_nickname"}` | empty, > 16 chars, or a rejected character |
| `404` | `{"error":"not_found"}` | unknown session id |
| `409` | `{"error":"nickname_already_set"}` | the game already has a nickname |
| `429` | `{"error":"too_many_requests"}` | over 30 requests/minute from one IP |
| `500` | `{"error":"server_error"}` | unexpected database error |

The rate limit applies to this route only: 30 requests per minute per IP by
default, configurable through `createApp({nicknameRateLimit:{limit,windowMs}})`
(tests use a lower limit).

```powershell
curl.exe -s -X PATCH http://localhost:3000/api/game-sessions/RR01-000127/nickname `
  -H "Content-Type: application/json" `
  --data-binary "@nickname.json"
```

---

## POST /api/difficulty/next

Auth: `X-API-Key` of a known device.

Request body:

```json
{
  "accuracy": 0.8,
  "reactionRatio": 0.6,
  "level": 5,
  "currentLength": 7
}
```

* `accuracy`: number `0..1`.
* `reactionRatio`: number `>= 0`.
* `level`: integer `1..15`.
* `currentLength`: integer `3..17` (level + 2, so level 15 is 17).

Response `200`:

```json
{ "steps": 1, "nextLength": 8, "model_version": 1 }
```

`steps` comes from `predictSteps({accuracy, reactionRatio, level})` and is
always `0..2`; `nextLength = min(17, currentLength + steps)`.

If the model cannot run (missing/broken artifact) the answer is still `200`
with the fixed fallback the ESP32 uses, and the error is logged:

```json
{ "steps": 1, "nextLength": 8, "fallback": true }
```

Errors:

| Status | Body | When |
|---|---|---|
| `400` | `{"error":"invalid_body","details":[...]}` | missing/out-of-range field |
| `401` | `{"error":"unauthorized"}` | missing or unknown key |
| `500` | `{"error":"server_error"}` | unexpected error |

```powershell
curl.exe -s -X POST http://localhost:3000/api/difficulty/next `
  -H "Content-Type: application/json" `
  -H "X-API-Key: dev-rr01-key" `
  --data-binary "@difficulty.json"
```

---

## GET /api/stats/summary

Auth: none. No body.

Response `200`:

```json
{
  "total_games": 4,
  "average_score": 3687.3,
  "max_score": 12750,
  "win_rate": 0.5,
  "outcomes": { "game_over": 2, "win": 2 },
  "score_histogram": [
    { "min": 0, "max": 999, "count": 2 },
    { "min": 1000, "max": 1999, "count": 1 },
    { "min": 2000, "max": 2999, "count": 0 }
  ],
  "skill_counts": { "Beginner": 2, "Intermediate": 1, "Pro": 1 },
  "animal_counts": {
    "Chimpanzee": 1,
    "Bottlenose Dolphin": 0,
    "Elephant": 1,
    "Orangutan": 0,
    "Pig": 2
  }
}
```

* `average_score` is rounded to 1 decimal, `null` when there are no games.
* `max_score` is `null` when there are no games.
* `win_rate` is `win / total_games` in `0..1`, `null` when there are no games.
* `score_histogram` always has **13** bins of 1000 points, from `0-999` to
  `12000-12999`, empty bins included with `count: 0`.
* `skill_counts` always has all three labels, `animal_counts` all five; a
  missing category is `0`, never absent.

Errors: `500 {"error":"server_error"}`.

```powershell
curl.exe -s http://localhost:3000/api/stats/summary
```

---

## GET /api/game-sessions/recent

The newest games first (the "Last results" list on `/live`). Public.

Query: `limit` 1-20 (default 5); anything else is `400 {"error":"invalid_limit"}`.

Response `200`:

```json
{ "sessions": [
  { "session_id": "RR01-000128", "nickname": null, "final_score": 1290,
    "highest_level_completed": 5, "outcome": "game_over", "received_at": "2026-11-21 10:04:31" }
] }
```

```powershell
curl.exe -s "http://localhost:3000/api/game-sessions/recent?limit=5"
```

---

## Live game (mirror of the device)

Contract and rules: [`docs/LIVE_PROTOCOL.md`](LIVE_PROTOCOL.md). Live data is
kept **in memory only** (one state per device, the last 200 messages); the
final `POST /api/game-sessions` stays the source of truth. The web page is
display-only: nothing here can control the hardware.

### POST /api/live/events

Device auth (`X-API-Key`, like uploads). Body at most **8 KB**, 1-20 events:

```json
{
  "device_id": "RR01",
  "game_id": "RR01-L-000128",
  "events": [
    { "type": "control_pressed", "t_ms": 0, "control": "start" },
    { "type": "countdown_started", "t_ms": 4, "seconds": 3, "step_ms": 1000 }
  ]
}
```

Event types and fields: see LIVE_PROTOCOL.md. Limits: sequence 1-17 buttons
of 1-6, level 1-15, lives 0-3, countdown seconds 1-5, step_ms 500-1500.

| Status | Body | When |
|---|---|---|
| `202` | `{"accepted": 2}` | applied events (ignored ones, e.g. a press during the countdown or a batch for an **older** `game_id`, are not counted) |
| `400` | `{"error":"invalid_body"}` / `{"error":"invalid_json"}` | anything outside the contract |
| `401` | `{"error":"unauthorized"}` | missing or wrong key |
| `403` | `{"error":"device_mismatch"}` | `device_id` is not the key's device |
| `413` | `{"error":"payload_too_large"}` | body over 8 KB |
| `429` | `{"error":"too_many_requests"}` | per-device rate limit (default 600 requests/minute) |

A new `game_id` switches the device to the new game. 90 s without events: the
game is abandoned (state idle, an `abandoned` message is broadcast).

PowerShell (save the body as a file first, then send it as-is):

```powershell
@'
{"device_id":"SIM01","game_id":"SIM01-L-TEST1","events":[
 {"type":"control_pressed","t_ms":0,"control":"start"},
 {"type":"countdown_started","t_ms":5,"seconds":3,"step_ms":1000}]}
'@ | Set-Content -Encoding ascii live.json
curl.exe -s -X POST http://localhost:3000/api/live/events -H "Content-Type: application/json" -H "X-API-Key: dev-sim01-key" --data-binary "@live.json"
```

### GET /api/live/state

Public. `Cache-Control: no-store`. `{"active": false, "now": ...}` when no
device is in a game, else the newest device's state:

```json
{ "active": true, "now": 1795262029228, "state": {
  "device_id": "RR01", "game_id": "RR01-L-000128", "phase": "input",
  "level": 3, "attempt": 1, "lives": 2, "score": 420,
  "sequence": { "sequence": [5,1,6,3,4], "level": 3, "attempt": 1, "cue_ms": 500, "gap_ms": 200, "startedAt": 1795262020000 },
  "input": { "expected_length": 5, "deadline_ms": 2600, "done": 2, "startedAt": 1795262024000 },
  "lastPress": { "index": 1, "button": 1, "expected": 1, "ok": true, "at": 1795262028000 },
  "countdown": null, "lastControl": { "control": "start", "at": 1795262010000 },
  "lastResult": null, "final": null, "resetAt": null, "abandoned": false, "lastEventAt": 1795262028000 } }
```

`phase` is `countdown`, `watch` (also between attempts, with `lastResult`),
`input` or `result_pending` (after `game_finished`). Times are server clock
ms; compare them only with `now`.

```powershell
curl.exe -s http://localhost:3000/api/live/state
```

### GET /api/live/stream (Server-Sent Events)

Public. Headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
`Connection: keep-alive`, `X-Accel-Buffering: no`; no compression. The
stream starts with `retry: 2000`, then a snapshot, then every accepted event:

```
retry: 2000

id: 41
event: snapshot
data: {"active":true,"now":...,"state":{...}}

id: 42
event: live
data: {"event":{"type":"press","t_ms":6120,"index":1,"button":4,"expected":4,"ok":true,"device_id":"RR01","game_id":"RR01-L-000128","receivedAt":1795262028000},"state":{...},"now":1795262028001}

: ping
```

- `: ping` every 15 s keeps proxies from closing the connection.
- Reconnecting with `Last-Event-ID: 41` replays the missed messages from a
  ring buffer of 200; if they are too old (or the server restarted) it sends a
  fresh snapshot instead.
- At most `LIVE_MAX_CLIENTS` (default 100) streams; more get
  `503 {"error":"too_many_clients"}`.

```powershell
curl.exe -s -N http://localhost:3000/api/live/stream
```

Simulated device: `node tools/fake_live_game.js --help` (see "Testing without
hardware").

---

## Testing without hardware

The fake uploader replays synthetic games as device **SIM01**, so the real backend can be exercised before the ESP32 exists. Seed the fake device once:

```powershell
cd backend
npm run seed
```

With the server running (`npm start`), from `/backend`:

```powershell
# upload 20 games, then resend the first one to prove duplicates are ignored
node ../tools/fake_esp32.js --count 20 --duplicate

# a small, slower run against another port
node ../tools/fake_esp32.js --count 5 --delay 300 --url http://localhost:3100

# show all options (count, url, key, device, delay, seed, duplicate)
node ../tools/fake_esp32.js --help

# a live game in real time (watch /live): see all options with --help
node ../tools/fake_live_game.js --skill average --speed 2

# remove only the fake games: dry run first, then for real
node ../tools/clear_fake.js
node ../tools/clear_fake.js --yes

# this is always refused, so real games are safe
node ../tools/clear_fake.js --device RR01
```

`npm run fake` and `npm run fake:clear` are equivalent. Windows PowerShell 5.1 removes a bare `--` before native commands, so use the `node` form above there, or run the npm form from `cmd.exe`:

```powershell
cmd /c "npm run fake -- --count 20 --duplicate"
cmd /c "npm run fake:clear -- --yes"
```

A replayed game keeps almost the same features as its synthetic original, so its animal match is usually that original `SYN-...` row: treat the animal/IQ on fake games as a plumbing check, not a real player result. Fake games appear on the leaderboard and in the stats until `clear_fake.js --yes` removes them.

## Common error bodies

| Status | Body | Meaning |
|---|---|---|
| `400` | `{"error":"invalid_json"}` | the request body is not valid JSON |
| `401` | `{"error":"unauthorized"}` | missing or wrong `X-API-Key` |
| `404` | `{"error":"not_found"}` | unknown route or unknown session |
| `413` | `{"error":"payload_too_large"}` | body over 100 kb |
| `429` | `{"error":"too_many_requests"}` | rate limit of the nickname or live route |
| `503` | `{"error":"too_many_clients"}` | more live streams than `LIVE_MAX_CLIENTS` |
| `400` | `{"error":"bad_request"}` | a malformed URL, e.g. a broken `%` escape in a session id |
| `500` | `{"error":"server_error"}` | unexpected server error (details are logged, never returned) |
