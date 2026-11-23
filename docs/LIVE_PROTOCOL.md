# Live game protocol (ESP32 -> server -> web mirror)

Status: **PROPOSED.** The control behaviour below must be agreed with the
firmware owner before it is final. The web side is built and tested against
`tools/fake_live_game.js`; nothing here has run on the real board yet.

While a game is played on the ESP32, the device also sends small **live
events**. The server keeps the current game in memory and pushes every event
to the web page `/live` (Server-Sent Events), which mirrors the panel:
attract animation, the 1 2 3 GO! and 1 2 3 BEGIN! countdowns, the sequence,
the presses, level, score and lives.

**The web page is display-only.** It can NOT start, reset or control the
hardware in any way. (Demo mode, `/live?demo=1`, plays a scripted game in the
browser and never talks to a device.)

Live data is **best-effort and ephemeral**. It is never stored in the
database. The final upload (`POST /api/game-sessions`) stays the only source
of truth for scores, the leaderboard and the ML results.

---

## 1. Controls (PROPOSED, needs agreement)

The original guide had a 2 s hold on an "Admin Reset" button that returned to
idle. Proposal: the action is called **RESET** and means "restart / play
again". There is no admin function on the device.

**The real box has one control, the pink START button on pin 13** (photo
and hardware sketch, November 2026). The sketch's rule: RESET = **START held
2 s** during play, back to **idle**. The events stay `control_pressed reset`
+ `game_reset`; the web draws a RESET as a press of START.

| Control | When | Action |
|---|---|---|
| **START** (short press) | idle, after game over, after a win | a new game (`game_started`, then the first countdown) |
| START (short press) | during a game or a countdown | ignored |
| **START held 2 s** (`RESET_HOLD_MS`) | during a game or a countdown | abandons the game (**not uploaded**) and goes back to **idle**. Release before starting again. |

The web page does not care how long START was held: it only reacts to
`control_pressed reset` and `game_reset`. There is **no** "reset held"
progress event.

During both countdowns the six game buttons are **ignored** by the firmware
(no `press` events are sent).

## 2. Countdowns (1 2 3 GO! and 1 2 3 BEGIN!)

Every attempt (the first try, every retry and every new level) runs:

1. **1 2 3 GO!**: `countdown_started` with `"then": "watch"`. The LCD counts
   up 1, 2, 3 (`COUNTDOWN_STEP_MS` = 1000 ms each), then "GO!" for `GO_MS` =
   600 ms.
2. The random sequence plays (`playback_started`).
3. **1 2 3 BEGIN!**: `countdown_started` with `"then": "input"`, same timing.
4. The player's turn (`input_started`). The reaction timer starts here, so
   the countdowns never change scoring.
5. `attempt_result`. A pass shows the points gained ("NICE! +points") for
   `NEXT_LEVEL_PAUSE_MS` (1 s), then the next level starts at step 1. A fail
   costs a life and shows "NEW PATTERN NEXT" for `RETRY_PAUSE_MS` (1 s); the
   same level starts again at step 1 with a **new random pattern**. 3 lives
   lost = game over; clearing level 7 = win.

After RESET the device shows "GAME STOPPED" for `RESTART_MS` = 500 ms, then
idle ("PRESS START").

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
| `game_started` | `lives`, `level` | right after START, before the first countdown (a new game) |
| `countdown_started` | `seconds` (1-5), `step_ms` (500-1500), `then` (`"watch"` or `"input"`, default `"watch"`), `level` (optional) | 1 2 3 GO! before every playback (`watch`), 1 2 3 BEGIN! before every turn (`input`) |
| `playback_started` | `level`, `attempt`, `sequence` (buttons 1-6), `cue_ms`, `gap_ms` | one event per playback (not one per cue) |
| `input_started` | `level`, `deadline_ms`, `expected_length` | playback ended, the player's turn |
| `press` | `index`, `button`, `expected`, `ok` | each game-button press during input |
| `attempt_result` | `level`, `result` (`pass`/`wrong`/`timeout`), `lives`, `score`, `points_awarded`, `speed_bonus` | end of an attempt |
| `game_finished` | `outcome` (`game_over`/`win`), `final_score`, `highest_level_completed`, `session_id` | the game is over; `session_id` = the id the final upload uses |
| `game_reset` | none | START held: the game is abandoned and the device is idle; the next game has a new `game_id` |

`attempt` counts the tries of the same level (1 = first try, 2 = first
retry, ...). `index` is 0-based within the sequence.

### Limits (the server answers 400 above them)

sequence length 1-17, buttons 1-6, level 1-7, lives 0-3, countdown seconds
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
