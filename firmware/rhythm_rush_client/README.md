# Rhythm Rush ESP32 client: network layer

This sketch is the **network part** of the Rhythm Rush game for the ESP32.
It has **no button pins and no game logic**: you add the game, this code
takes care of Wi-Fi, saving finished games, uploading them, and asking for
the next difficulty.

| File | What it is |
|---|---|
| `rhythm_rush_client.ino` | the sketch: network layer + optional Serial test commands |
| `config.h.example` | settings template. Copy it to `config.h` (gitignored, never commit it) |
| `README.md` | this file |

## Status

Compiled successfully on 2026-11-21 with **arduino-cli 1.5.1**, board
**ESP32 Dev Module** (`esp32:esp32:esp32`), **esp32 core 3.3.12** and
**ArduinoJson 7.4.3**, with all compiler warnings on: **0 warnings** in this
sketch. Size: 988 kB flash (75 %), 48 kB RAM (14 %) with the Serial test
commands; 971 kB without them.

The exact JSON it builds for the example game was checked against
`docs/session.schema.json` and accepted by the real server (201, then 200 on
a resend, 401 with a wrong key). It has **not yet run on a real board**: see
"What you must check on the hardware" below.

## Setup in the Arduino IDE (no PlatformIO)

1. Install **Arduino IDE 2.x** from arduino.cc.
2. **Board package:** File > Preferences > "Additional boards manager URLs":
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
   Then Tools > Board > Boards Manager: install **esp32 by Espressif
   Systems**, version **3.x**.
3. **Library:** Tools > Manage Libraries: install **ArduinoJson** by Benoit
   Blanchon, version **7.x**. (WiFi, HTTPClient, Preferences and LittleFS come
   with the board package.)
4. Open `rhythm_rush_client.ino` (the folder name must stay
   `rhythm_rush_client`).
5. Copy `config.h.example` to **`config.h`** in the same folder and fill in:
   - `WIFI_SSID` / `WIFI_PASSWORD`: the exhibition Wi-Fi (**2.4 GHz**)
   - `SERVER_URL`: the address printed by `npm start` on the laptop under "on
     this network", e.g. `http://192.168.1.5:3000` (no slash at the end)
   - `API_KEY`: exactly the `DEVICE_API_KEY` from the laptop's `backend/.env`
   - `DEVICE_ID`: `RR01`
6. Tools > Board: **ESP32 Dev Module** (or your exact board). Tools >
   Partition Scheme: keep a scheme **with a SPIFFS/FS partition** (the
   default "4MB with spiffs" works; LittleFS uses that partition). Do not pick
   "No FS" or "Huge APP (no OTA/no FS)".
7. Upload, then open the Serial Monitor at **115200** baud.

Without `config.h` the compiler stops with: *config.h is missing: copy
config.h.example to config.h...*

## Try it without buttons (Serial Monitor)

With `RR_DEMO_SERIAL_COMMANDS 1` in `config.h`, type a letter and press Enter:

| Key | What happens |
|---|---|
| `p` | print the JSON of the example game (compare with `docs/session.schema.json`) |
| `f` | queue the example game: it gets the next id, is saved to flash, then uploaded |
| `d` | call `getNextSteps(0.8, 0.6, 5, 7)` and print the answer and how long it took |
| `q` | list the queued files |
| `a` | toggle "game active" (uploads pause while active) |
| `w` | Wi-Fi status and IP |
| `h` | help |

Set `RR_DEMO_SERIAL_COMMANDS 0` in the final game.

## Using it from the game code

```cpp
void setup() {
  rrNetBegin();                     // flash queue + Wi-Fi start
  // ... your pins, sound, display ...
}

void loop() {
  rrNetLoop();                      // every pass; returns quickly
  // ... your game state machine (never a long delay()) ...
}

// when a level's sequence starts playing:
rrNetSetGameActive(true);           // no uploads while the player is busy

// between two levels:
int add = getNextSteps(accuracy, reactionRatio, level, currentLength);   // 0, 1 or 2
// accuracy      = successful rounds / (successful rounds + failed attempts), 0..1
// reactionRatio = average seconds per press / deadline per press of this level
// it returns 1 (the fixed +1 rule) if the server is slow or unreachable

// at game over or win:
rrNetSetGameActive(false);
RRSession s = {};
s.win = false;                      // true only after clearing level 15
s.finalScore = score;
s.highestLevelCompleted = levelsCleared;
s.finalSequenceLength = lastLevel + 2;
s.successfulRounds = passes;
s.failedAttempts = fails;
s.durationSeconds = (millis() - gameStartMs) / 1000;
s.attemptCount = n;                 // fill s.attempts[0..n-1]:
s.attempts[0] = {1, RR_PASS, 4100};      // level, result, response ms
s.attempts[1] = {2, RR_WRONG, 2100};     // ms until the wrong press
s.attempts[2] = {2, RR_TIMEOUT, 0};      // timeout: 0
rrQueueSession(s);                  // saved to flash, uploaded when possible
```

The session fields and rules are the same as in `AGENTS.md` and
`docs/session.schema.json`. `rrQueuedCount()` tells how many games are
waiting (useful for a status LED); `rrLastSessionId()` returns the id of the
last queued game.

## How it behaves

- **Wi-Fi.** `WiFi.begin()` is started in the background (it returns at
  once). If the connection is lost, it tries again after 5 s, then 10, 20,
  40, max 60 s between tries. The core's own auto-reconnect is switched off
  so the two cannot fight.
- **Session ids.** `"<DEVICE_ID>-<counter>"`, e.g. `RR01-000127`. The counter
  is stored in flash (Preferences, namespace `rrnet`) and saved **before**
  the id is used, so a reboot can skip a number but never repeat one.
- **Queue.** Each finished game is one file in LittleFS (`/rrq/q<counter>.json`),
  written to a `.tmp` file first and renamed, so a power cut never leaves half
  a game. At most **20** games are kept; when full, the **oldest** is dropped
  (logged) so the newest result is not lost. The queue survives reboots.
- **Upload.** The **oldest** file is sent to `POST /api/game-sessions` with
  `X-API-Key`. It is deleted **only on HTTP 200 or 201** (201 = saved, 200 =
  the server already had it, e.g. after a lost answer; the server never
  stores the same `session_id` twice). Any other result (no Wi-Fi, timeout,
  401, 500, ...) keeps the file and retries after 3 s, 6 s, 12 s ... up to
  2 min. Uploads only happen while the game is **not** active.
- **Difficulty.** `getNextSteps()` posts to `/api/difficulty/next` with a
  total budget of about 800 ms (400 ms to connect + 400 ms for the answer)
  and returns the server's `steps` (0-2). No Wi-Fi, a timeout, a non-200
  answer or a strange reply all return **1**. It is safe to call between
  levels; do not call it while the player is pressing buttons.
- **Blocking.** Nothing calls a long `delay()`. When the laptop is completely
  unreachable, one upload attempt can hold the idle loop for up to about
  1.5 s (connection timeout); after that the attempts get rarer and rarer.
  If even that is too much, run `rrNetLoop()` in its own FreeRTOS task on
  core 0 (and protect the queue with a mutex).
- **Serial log.** Every event is printed with the prefix `[rr]`, including
  hints: 401 = API key mismatch, 403 = wrong DEVICE_ID, 400 = JSON bug.

## HTTPS note

The sketch uses **plain HTTP** (`WiFiClient`). That is acceptable **only on
the isolated classroom/exhibition network**: anyone sniffing that Wi-Fi could
read the API key. For a server on the internet, use HTTPS: `WiFiClientSecure`
with `setCACert()` and the server's root certificate, so the ESP32 checks who
it is talking to. **Never** use `setInsecure()` in a real deployment.

## What you must check on the hardware

The code compiles, but it has not run on a real board yet. Please test and
tick:

- [ ] **Boot log.** `[rr] Queue: 0 game(s) waiting from before`, then
      `Wi-Fi connected, IP ...`. If LittleFS fails, check the partition scheme.
- [ ] **Upload.** `f` → `Queued RR01-000001`, then `Uploaded ... -> HTTP 201`;
      the game appears on the laptop's `/result` screen and admin page.
- [ ] **Ids after reboot.** Press `f`, reset the board, press `f` again: the
      second id is higher (`RR01-000002`), never a repeat.
- [ ] **Offline queue.** Stop the server (or unplug the router), press `f`
      three times: the uploads fail and the files stay (`q`). Start the
      server again: all three arrive **once each** (check the admin page).
- [ ] **Reboot while offline.** Queue a game offline, reset the board, bring
      the server back: the game is still uploaded.
- [ ] **Wrong key.** Change `API_KEY`, upload: `HTTP 401 (kept in the
      queue)` and the hint. Fix the key: the file is sent and deleted.
- [ ] **Wi-Fi drop.** Turn the router off and on: `Wi-Fi lost`, retries with
      growing pauses, `Wi-Fi connected` again without a reset.
- [ ] **Difficulty.** `d` with the server running prints 0, 1 or 2 in well
      under 800 ms; with the laptop off it prints 1 after about 800 ms or
      less.
- [ ] **No gameplay stalls.** With the laptop switched off, play several
      games: button timing must never stutter during a level (uploads are
      paused while `rrNetSetGameActive(true)`).
- [ ] **Queue limit.** With the server off, queue 22 games: only 20 files
      remain, the two oldest were dropped (logged).
- [ ] **Real game data.** After the first real game, compare the score on
      the device, on `/result` and on the leaderboard: all the same.
- [ ] **Full flash erase.** If you ever erase the whole flash, set
      `SESSION_COUNTER_START` above the highest id already on the server,
      otherwise new games are ignored as duplicates.
