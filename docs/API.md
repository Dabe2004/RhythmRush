# Rhythm Rush HTTP API

Base URL in development: `http://localhost:3000`

All bodies are JSON (`Content-Type: application/json`). All errors are JSON of
the shape `{"error":"code"}` unless noted otherwise.

Device auth is the header `X-API-Key: <device key>`. The database stores only
the SHA-256 hash of the key, in `devices.api_key_hash`. Admin auth is the
header `X-Admin-Password: <ADMIN_PASSWORD>` (see "Admin API" below).

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
| `GET` | `/api/leaderboard` | none | top scores |
| `GET` | `/api/game-sessions/:id` | none | one session with attempts, features, prediction |
| `PATCH` | `/api/game-sessions/:id/nickname` | none | set the nickname once |
| `POST` | `/api/difficulty/next` | device key | ask the model how many steps to add |
| `GET` | `/api/stats/summary` | none | aggregate numbers for the dashboard |
| `POST` | `/api/admin/login` | admin password | check the password |
| `GET` | `/api/admin/overview` | admin password | stats + devices + recent games |
| `GET` | `/api/admin/models` | admin password | metadata of the 3 model files |
| `PATCH` | `/api/admin/game-sessions/:id/nickname` | admin password | overwrite or clear a nickname |
| `DELETE` | `/api/admin/game-sessions/:id` | admin password | delete one game |
| `DELETE` | `/api/admin/game-sessions?device=ID` | admin password | delete every game of one device |

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
dashes and underscores (`^[A-Za-z0-9 _-]+$`). A nickname can be set **once**;
later edits belong to the admin (a later phase).

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

## Admin API

All admin routes live under `/api/admin` and need the header
`X-Admin-Password`. It is compared with `ADMIN_PASSWORD` from `backend/.env`
in constant time (both values are SHA-256 hashed, then
`crypto.timingSafeEqual`). Every admin answer, errors included, has
`Cache-Control: no-store`.

Checks, in this order:

| Status | Body | When |
|---|---|---|
| `503` | `{"error":"admin_disabled"}` | `ADMIN_PASSWORD` is empty, or still `change-me` while `NODE_ENV=production` |
| `429` | `{"error":"too_many_requests"}` | more than 10 **wrong** passwords from one IP in 15 minutes |
| `401` | `{"error":"unauthorized"}` | missing or wrong `X-Admin-Password` |

Only wrong passwords count toward the rate limit, so a dashboard that
refreshes every 15 seconds is never blocked. Once the limit is reached, even
the right password gets `429` until the window ends. The numbers can be
changed with `createApp({adminRateLimit:{limit,windowMs}})` (the tests do
this). The public routes keep working when the admin API is disabled.

The examples assume the password is in a PowerShell variable, so it is not
typed into the command history twice:

```powershell
$pw = Read-Host "Admin password"
```

### POST /api/admin/login

No body. Lets the UI check a password before it stores it.

Response `200`:

```json
{ "ok": true }
```

```powershell
curl.exe -s -X POST http://localhost:3000/api/admin/login -H "X-Admin-Password: $pw"
```

### GET /api/admin/overview

Everything from `GET /api/stats/summary` (same keys, same values) plus:

```json
{
  "total_games": 31,
  "average_score": 6128.4,
  "...": "every other /api/stats/summary key",
  "devices": [
    {
      "device_id": "RR01",
      "name": "Rhythm Rush test device",
      "last_seen_at": "2026-11-21 09:14:02",
      "games_count": 1,
      "is_online": false
    },
    {
      "device_id": "SIM01",
      "name": "Simulated device",
      "last_seen_at": "2026-11-21 09:30:45",
      "games_count": 30,
      "is_online": true
    }
  ],
  "game_counts": { "real": 1, "synthetic": 30 },
  "recent_sessions": [
    {
      "session_id": "SIM01-301245001",
      "device_id": "SIM01",
      "final_score": 8120,
      "nickname": null,
      "received_at": "2026-11-21 09:30:45"
    }
  ]
}
```

* `devices[].is_online` is `true` when `last_seen_at` is within the last
  **10 minutes**. `last_seen_at` is updated by a new upload and by
  `POST /api/difficulty/next` (the ESP32 calls it between levels). A device
  that sits idle for 10 minutes shows as offline. Times are UTC
  (SQLite `CURRENT_TIMESTAMP`).
* `devices` never contains the API key hash.
* `game_counts.synthetic` counts games from device `SIM01` (the fake
  uploader) or with `is_synthetic = 1`; everything else is `real`.
* `recent_sessions` is the newest 20 games, newest first.

```powershell
curl.exe -s http://localhost:3000/api/admin/overview -H "X-Admin-Password: $pw"
```

### GET /api/admin/models

Metadata of the three files in `backend/artifacts`. The animal reference rows
are **never** returned, only how many there are.

```json
{
  "models": [
    {
      "name": "difficulty",
      "file": "difficulty.json",
      "size_bytes": 193,
      "modified_at": "2026-11-19T13:26:00.000Z",
      "version": 1,
      "intercept": -0.665421,
      "weights": { "accuracy": 1.25104, "reactionRatio": -0.939677, "level": 0.121498 }
    },
    {
      "name": "skill",
      "file": "skill.json",
      "size_bytes": 1510,
      "modified_at": "2026-11-19T13:26:00.000Z",
      "version": 1,
      "features": ["final_score", "avg_reaction_sec", "highest_sequence_length", "success_rate"],
      "node_count": 15
    },
    {
      "name": "animal",
      "file": "animal.json",
      "size_bytes": 339504,
      "modified_at": "2026-11-19T13:26:00.000Z",
      "version": 1,
      "features": ["final_score", "avg_reaction_sec", "highest_sequence_length", "success_rate"],
      "reference_rows": 2000,
      "tiers": [
        { "percentile_min": 0.9, "animal": "Chimpanzee", "iq_range": "90-100" }
      ]
    }
  ]
}
```

A missing file becomes `{"name":"skill","file":"skill.json","error":"missing"}`
and unreadable JSON `{"...","error":"invalid_json"}`; the request still
answers `200`. The server loads the models **once** on first use, so after
retraining, restart the server to use the new files.

```powershell
curl.exe -s http://localhost:3000/api/admin/models -H "X-Admin-Password: $pw"
```

### PATCH /api/admin/game-sessions/:id/nickname

Moderator version of the nickname route: it can **overwrite** an existing
nickname or **clear** it with `null`. A string must follow the public rule
(trimmed, 1-16 characters, letters, numbers, spaces, `-`, `_`).

```json
{ "nickname": "Polite Name" }
```

```json
{ "nickname": null }
```

Response `200`: `{"saved":true,"nickname":"Polite Name"}` or
`{"saved":true,"nickname":null}`. After clearing, the player can set a new
nickname on the public route again.

Errors: `400 {"error":"invalid_nickname"}`, `404 {"error":"not_found"}`.

```powershell
Set-Content -Path clear.json -Value '{"nickname":null}' -Encoding ascii
curl.exe -s -X PATCH http://localhost:3000/api/admin/game-sessions/RR01-000127/nickname `
  -H "X-Admin-Password: $pw" -H "Content-Type: application/json" `
  --data-binary "@clear.json"
```

### DELETE /api/admin/game-sessions/:id

Deletes one game. `ON DELETE CASCADE` also removes its attempts, features and
prediction.

Response `200`: `{"deleted":1,"session_id":"RR01-000127"}`.
Errors: `404 {"error":"not_found"}` (also for a second delete).

```powershell
curl.exe -s -X DELETE http://localhost:3000/api/admin/game-sessions/SIM01-301245001 `
  -H "X-Admin-Password: $pw"
```

### DELETE /api/admin/game-sessions?device=ID

Deletes every game of one device (with cascade) and resets that device's
`last_seen_at`, in one transaction. The device must be named explicitly.
`SIM01` (the fake uploader) needs nothing else; **any other device, such as
the real `RR01`, also needs `confirm=<same id>`**, so real games are never
removed by a slip.

| Request | Result |
|---|---|
| `?device=SIM01` | `200 {"deleted":30,"device_id":"SIM01"}` |
| `?device=RR01` | `400 {"error":"confirm_required"}`, nothing deleted |
| `?device=RR01&confirm=RR01` | `200 {"deleted":1,"device_id":"RR01"}` |
| no `device`, empty, or repeated | `400 {"error":"device_required"}` |
| unknown device | `404 {"error":"device_not_found"}` |

```powershell
curl.exe -s -X DELETE "http://localhost:3000/api/admin/game-sessions?device=SIM01" `
  -H "X-Admin-Password: $pw"
```

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
| `429` | `{"error":"too_many_requests"}` | nickname route, or too many wrong admin passwords |
| `503` | `{"error":"admin_disabled"}` | admin routes only: unsafe `ADMIN_PASSWORD` |
| `400` | `{"error":"bad_request"}` | a malformed URL, e.g. a broken `%` escape in a session id |
| `500` | `{"error":"server_error"}` | unexpected server error (details are logged, never returned) |
