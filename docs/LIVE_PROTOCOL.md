# Live game protocol (ESP32 -> server -> web mirror)

Status: **PROPOSED.** The control behaviour below must be agreed with the
firmware owner before it is final. The web side is built and tested against
`tools/fake_live_game.js`; nothing here has run on the real board yet.

While a game is played on the ESP32, the device also sends small **live
events**. The server keeps the current game in memory and pushes every event
to the web page `/live` (Server-Sent Events), which mirrors the panel:
attract animation, 3-2-1 countdown, the sequence, the presses, level, score
and lives.

**The web page is display-only.** It can NOT start, reset or control the
hardware in any way. (Demo mode, `/live?demo=1`, plays a scripted game in the
browser and never talks to a device.)

Live data is **best-effort and ephemeral**. It is never stored in the
database. The final upload (`POST /api/game-sessions`) stays the only source
of truth for scores, the leaderboard and the ML results.

---

## 1. Controls (PROPOSED, needs agreement)

The original guide had a 2 s hold on an "Admin Reset" button that returned to
idle. Proposal: the button is called **RESET** and means "restart / play
again". There is no admin function on the device.

| Control | When | Action |
|---|---|---|
| **START** | idle, or after a finished game | begins a game (countdown first) |
| START | game in progress or countdown running | ignored |
| **RESET** (hold ~1 s) | game in progress (watch or input phase) | abandons the game (**not uploaded**) and starts a fresh game with the countdown. A short tap does nothing, so a bump cannot end a game. |
| RESET (short tap) | idle, after game over, after a win | "play again": a fresh game with the countdown |
| RESET (short tap) | during the countdown | restarts the countdown from 3 (never two countdowns at once) |

The web page does not care how long RESET was held: it only reacts to
`control_pressed reset` and `game_reset`. There is **no** "reset held"
progress event.

During the countdown the six game buttons are **ignored** by the firmware (no
`press` events are sent).

## 2. Countdown (3-2-1, then GO!)

`COUNTDOWN_SECONDS` = 3 steps of `COUNTDOWN_STEP_MS` = 1000 ms, then "GO!"
for `GO_MS` = 600 ms, then the first sequence. It does not affect scoring:
the reaction timer starts when playback ends.

| Situation | Countdown? |
|---|---|
| START from idle | **yes** |
| RESET held mid-game | **yes** |
| RESET after game over / win (play again) | **yes** |
| RESET during the countdown | **yes**, restarts at 3 |
| retry after a failed attempt | no: "SAME SEQUENCE AGAIN" for `RETRY_PAUSE_MS` (1 s), then the same sequence |
| next level after a pass | no: "NICE!" for `NEXT_LEVEL_PAUSE_MS` (1 s), then the new sequence |

After RESET the device shows "RESTARTING..." (or "PLAY AGAIN!" after a
finished game) for `RESTART_MS` = 500 ms, then starts the countdown.

Optional: a short **"get ready" pause** of `GET_READY_MS` (300-400 ms, 350
proposed) before every playback, so the first cue is not missed.

All timing constants live in `ml/game_rules.py`; `python ml/export_rules.py`
writes them to `docs/game_rules.json` for JavaScript tools.

## 3. Device -> server

`POST /api/live/events`, header `X-API-Key` (the same device key as uploads).

```json
{
  "device_id": "RR01",
  "game_id": "RR01-L-000128",
  "events": [
    { "type": "control_pressed", "t_ms": 0, "control": "start" },
    { "type": "countdown_started", "t_ms": 5, "seconds": 3, "step_ms": 1000 }
  ]
}
```

- `game_id` is unique per game (e.g. `RR01-L-000128`, from a counter in
  flash). A RESET starts a **new** `game_id`. If a request carries a new
  `game_id`, the server switches the active game to it; events for an
  **older** `game_id` are ignored.
- `t_ms` = device milliseconds since the game started. Informational only:
  the server **never** uses it for ordering (it orders by arrival).
- Answer `202 {"accepted": n}` (`n` = events applied; ignored events, e.g.
  presses during the countdown, are not counted).

### Event types

| type | fields | when |
|---|---|---|
| `control_pressed` | `control`: `"start"` or `"reset"` | a START/RESET press that does something (press animation); sent immediately |
| `countdown_started` | `seconds` (1-5), `step_ms` (500-1500) | a countdown begins; sent **again** when RESET restarts it (the page restarts from 3) |
| `game_started` | `lives`, `level` | right after the countdown (GO!) |
| `playback_started` | `level`, `attempt`, `sequence` (buttons 1-6), `cue_ms`, `gap_ms` | one event per playback (not one per cue) |
| `input_started` | `level`, `deadline_ms`, `expected_length` | playback ended, the player's turn |
| `press` | `index`, `button`, `expected`, `ok` | each game-button press during input |
| `attempt_result` | `level`, `result` (`pass`/`wrong`/`timeout`), `lives`, `score`, `points_awarded`, `speed_bonus` | end of an attempt |
| `game_finished` | `outcome` (`game_over`/`win`), `final_score`, `highest_level_completed`, `session_id` | the game is over; `session_id` = the id the final upload uses |
| `game_reset` | none | RESET abandoned or restarted the game; always followed by a new `game_id` or a new `countdown_started` |

`attempt` counts the tries of the same level (1 = first try, 2 = first
retry, ...). `index` is 0-based within the sequence.

### Limits (the server answers 400 above them)

sequence length 1-17, buttons 1-6, level 1-15, lives 0-3, countdown seconds
1-5, step_ms 500-1500, at most **20 events per request**, body at most
**8 KB**. A per-device rate limit answers 429 (default 600 requests per
minute; far above 4 batches/s).

### One event per playback

`playback_started` carries the whole sequence plus `cue_ms`/`gap_ms`. The
page replays it **on its own clock** (cue i lights at `i * (cue_ms + gap_ms)`
for `cue_ms`). One small event instead of 2 x 17 makes the mirror smooth even
when the network jitters, and costs the game loop nothing.

If the event arrives later than the whole playback lasts
(`length x (cue_ms + gap_ms)`), the page skips the replay and just shows
WATCH. It never speeds up or "catches up" a replay, and a duplicate
playback event never replays twice.

### Batching

The device sends a batch about every **250 ms**. These are flushed
**immediately** (sent at once, together with anything already queued):
`control_pressed`, `countdown_started`, `playback_started`, `game_finished`.

### Latency

Expected LAN latency is a few tens of ms plus up to 250 ms of batching.
**Unmeasured until tested on the hardware.** The server side (POST in, SSE
out) was measured on localhost (see `docs/NOTES.md`, "Live game mirror").

## 4. Firmware rules (the game must never wait for the network)

1. The game loop only **enqueues** events into a bounded FreeRTOS queue
   (e.g. 32 items). Enqueue is O(1) and never blocks.
2. ONE separate task drains the queue and POSTs batches (up to 20 events,
   800 ms timeout).
3. Queue full: **drop the oldest** events.
4. A failed batch is **never retried** (old live data is worthless).
5. Wi-Fi down: send nothing (drop), keep playing.
6. `game_finished.session_id` must equal the `session_id` of the final
   upload. An abandoned game (RESET mid-game) is not uploaded.

## 5. Server -> browser

- `GET /api/live/state`: the current snapshot, or `{"active":false}`.
- `GET /api/live/stream`: Server-Sent Events. The snapshot comes first; then
  every accepted event as `event: live` with `data: {"event":..., "state":...}`.
  `Last-Event-ID` replays missed messages (last 200), or sends a fresh
  snapshot if they are too old. 90 s without events = abandoned, back to idle.

Full reference with examples: `docs/API.md`, "Live game".
