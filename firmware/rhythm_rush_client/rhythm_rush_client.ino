/*
  rhythm_rush_client.ino  -  Rhythm Rush ESP32 NETWORK LAYER (Phase M)

  This sketch contains ONLY the networking part of the game. There are no
  button pins and no game logic here: copy the "NETWORK LAYER" section into
  the real game sketch (or add the game code to this one).

  What it does
    - connects to Wi-Fi and reconnects with a growing pause (backoff)
    - turns a finished game into the JSON of docs/session.schema.json
    - gives every game a unique id "<DEVICE_ID>-<counter>"; the counter is
      kept in flash (Preferences), so ids never repeat after a reboot
    - keeps finished games in a flash queue (LittleFS, max 20 files) and
      uploads the OLDEST one to POST /api/game-sessions with X-API-Key
    - deletes a queued game ONLY when the server answers 200 or 201;
      anything else keeps it and tries again later (backoff)
    - asks POST /api/difficulty/next how many steps to add (800 ms limit),
      and falls back to +1 on any problem

  How the game code uses it
      setup():            rrNetBegin();
      loop():             rrNetLoop();               // every pass, returns fast
      a level starts:     rrNetSetGameActive(true);  // no uploads while playing
      between levels:     int add = getNextSteps(accuracy, reactionRatio,
                                                 level, currentLength);
      game over / win:    rrNetSetGameActive(false);
                          String id = rrReserveSessionId();
                          liveGameFinished(win, score, highestLevel, id);
                          rrQueueSession(session);   // saved to flash first, uploaded as id

  Live mirror (optional, RR_LIVE_EVENTS): call liveNewGame() before the
  START control_pressed (and after RESET's game_reset), then live...() at
  each step. See README.md "Live events" and docs/LIVE_PROTOCOL.md.

  Blocking: nothing here calls a long delay(). Uploads only run while the
  game is NOT active. One upload attempt waits at most about 1.5 s for the
  laptop to answer the connection when it is unreachable (then it backs off
  for longer and longer). getNextSteps() waits at most about 800 ms.

  HTTPS NOTE
    This sketch uses plain HTTP (WiFiClient). That is acceptable ONLY on the
    isolated classroom/exhibition network: the API key travels unencrypted.
    For anything on the internet, use HTTPS with WiFiClientSecure and
    setCACert(<root certificate of the server>) so the ESP32 checks the
    server certificate. Never ship setInsecure() - it accepts any server.

  Needs (Arduino IDE 2.x, no PlatformIO): board package "esp32" by Espressif
  Systems 3.x, library "ArduinoJson" 7.x. See README.md in this folder.
*/

// ---------------------------------------------------------------------------
// Settings: config.h (copied from config.h.example, gitignored)
// ---------------------------------------------------------------------------
#if __has_include("config.h")
#include "config.h"
#else
#error "config.h is missing: copy config.h.example to config.h in this folder and fill in your settings."
#endif

#if !defined(WIFI_SSID) || !defined(WIFI_PASSWORD) || !defined(SERVER_URL) || !defined(API_KEY) || !defined(DEVICE_ID)
#error "config.h must define WIFI_SSID, WIFI_PASSWORD, SERVER_URL, API_KEY and DEVICE_ID."
#endif

#ifndef SESSION_COUNTER_START
#define SESSION_COUNTER_START 0
#endif

#ifndef RR_DEMO_SERIAL_COMMANDS
#define RR_DEMO_SERIAL_COMMANDS 0
#endif

// 1 = send live events for the web mirror (/live). 0 = off (to compare timing).
#ifndef RR_LIVE_EVENTS
#define RR_LIVE_EVENTS 1
#endif

#include <algorithm>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <LittleFS.h>
#include <ArduinoJson.h>

#if ARDUINOJSON_VERSION_MAJOR < 7
#error "This sketch needs ArduinoJson 7 or newer (Arduino IDE > Library Manager > ArduinoJson)."
#endif

// ===========================================================================
// NETWORK LAYER
// ===========================================================================

// ---------------------------------------------------------------------------
// Limits and timings (milliseconds)
// ---------------------------------------------------------------------------
constexpr uint8_t  RR_MAX_ATTEMPTS = 40;        // a real game has at most 17
constexpr uint8_t  RR_QUEUE_MAX = 20;           // finished games kept in flash
constexpr uint32_t RR_WIFI_RETRY_MIN_MS = 5000;
constexpr uint32_t RR_WIFI_RETRY_MAX_MS = 60000;
constexpr uint32_t RR_SEND_RETRY_MIN_MS = 3000;
constexpr uint32_t RR_SEND_RETRY_MAX_MS = 120000;
constexpr uint32_t RR_SEND_GAP_MS = 250;        // pause between two uploads
constexpr uint32_t RR_IDLE_CHECK_MS = 1000;     // queue check when it was empty
constexpr uint32_t RR_UPLOAD_CONNECT_TIMEOUT_MS = 1500;
constexpr uint16_t RR_UPLOAD_READ_TIMEOUT_MS = 3000;
constexpr uint32_t RR_DIFFICULTY_TIMEOUT_MS = 800;   // total budget
constexpr int      RR_FALLBACK_STEPS = 1;            // the fixed "+1" rule

static const char* RR_QUEUE_DIR = "/rrq";
static const char* RR_PREFS_NAMESPACE = "rrnet";
static const char* RR_PREFS_COUNTER_KEY = "sid";

// ---------------------------------------------------------------------------
// Game data handed over by the game code
// ---------------------------------------------------------------------------
enum RRResult : uint8_t { RR_PASS = 0, RR_WRONG = 1, RR_TIMEOUT = 2 };

struct RRAttempt {
  uint8_t  level;        // 1..15
  RRResult result;       // RR_PASS, RR_WRONG or RR_TIMEOUT
  uint32_t responseMs;   // pass: total time, wrong: time until the wrong press, timeout: 0
};

struct RRSession {
  bool     win;                    // true = cleared level 15, false = game over
  uint32_t finalScore;
  uint8_t  highestLevelCompleted;
  uint8_t  finalSequenceLength;    // level of the last attempt + 2
  uint16_t successfulRounds;
  uint16_t failedAttempts;
  uint32_t durationSeconds;
  uint8_t  attemptCount;           // how many entries of attempts[] are used
  RRAttempt attempts[RR_MAX_ATTEMPTS];
};

// ---------------------------------------------------------------------------
// Public functions (explicit prototypes, so the Arduino IDE does not have to
// guess them)
// ---------------------------------------------------------------------------
void rrNetBegin();
void rrNetLoop();
void rrNetSetGameActive(bool active);
bool rrQueueSession(const RRSession& session);
int getNextSteps(float accuracy, float reactionRatio, int level, int currentLength);
String buildSessionJson(const RRSession& session, const String& sessionId);
int rrQueuedCount();
String rrLastSessionId();
String rrReserveSessionId();
// Live events (docs/LIVE_PROTOCOL.md); all of them only enqueue, never block.
void liveNewGame();
void liveControlPressed(const char* control);
void liveCountdown(uint8_t seconds, uint16_t stepMs);
void liveGameStarted(uint8_t lives, uint8_t level);
void livePlayback(uint8_t level, uint8_t attempt, const uint8_t* sequence, uint8_t length, uint16_t cueMs, uint16_t gapMs);
void liveInputStarted(uint8_t level, uint32_t deadlineMs, uint8_t expectedLength);
void livePress(uint8_t index, uint8_t button, uint8_t expected, bool ok);
void liveAttemptResult(uint8_t level, RRResult result, uint8_t lives, uint32_t score, uint32_t points, uint8_t speedBonus);
void liveGameFinished(bool win, uint32_t finalScore, uint8_t highestLevel, const String& sessionId);
void liveReset();

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
#define RR_LOG(...)              \
  do {                           \
    Serial.print("[rr] ");       \
    Serial.printf(__VA_ARGS__);  \
    Serial.println();            \
  } while (0)

static Preferences gPrefs;
static bool gFsReady = false;
static bool gGameActive = false;
static bool gWifiWasConnected = false;
static uint32_t gWifiNextTryAt = 0;
static uint32_t gWifiRetryMs = RR_WIFI_RETRY_MIN_MS;
static uint32_t gSendNextTryAt = 0;
static uint32_t gSendRetryMs = RR_SEND_RETRY_MIN_MS;
static String gLastSessionId;

// millis() wraps after 49 days; this comparison stays correct across it.
static bool timeReached(uint32_t at) {
  return (int32_t)(millis() - at) >= 0;
}

static uint32_t doubled(uint32_t value, uint32_t maximum) {
  return (value >= maximum / 2) ? maximum : value * 2;
}

static const char* resultName(RRResult result) {
  switch (result) {
    case RR_PASS: return "pass";
    case RR_WRONG: return "wrong";
    default: return "timeout";
  }
}

// ---------------------------------------------------------------------------
// Session ids: "<DEVICE_ID>-<counter>", counter saved in flash BEFORE use
// ---------------------------------------------------------------------------
static uint32_t nextSessionCounter() {
  gPrefs.begin(RR_PREFS_NAMESPACE, false);
  // Never below SESSION_COUNTER_START (used after a full flash erase).
  uint32_t last = std::max<uint32_t>(gPrefs.getUInt(RR_PREFS_COUNTER_KEY, 0), (uint32_t)SESSION_COUNTER_START);

  uint32_t next = last + 1;
  // Saved first: if the power goes off right after, this number is skipped,
  // never reused.
  if (gPrefs.putUInt(RR_PREFS_COUNTER_KEY, next) == 0) {
    RR_LOG("WARNING: could not save the session counter in flash");
  }
  gPrefs.end();
  return next;
}

static String formatSessionId(uint32_t counter) {
  char buffer[48];
  snprintf(buffer, sizeof(buffer), "%s-%06lu", DEVICE_ID, (unsigned long)counter);
  return String(buffer);
}

// ---------------------------------------------------------------------------
// JSON exactly as docs/session.schema.json (same keys, same order)
// ---------------------------------------------------------------------------
String buildSessionJson(const RRSession& session, const String& sessionId) {
  JsonDocument doc;

  doc["session_id"] = sessionId;
  doc["device_id"] = DEVICE_ID;
  doc["outcome"] = session.win ? "win" : "game_over";
  doc["final_score"] = session.finalScore;
  doc["highest_level_completed"] = session.highestLevelCompleted;
  doc["final_sequence_length"] = session.finalSequenceLength;
  doc["successful_rounds"] = session.successfulRounds;
  doc["failed_attempts"] = session.failedAttempts;
  doc["duration_seconds"] = session.durationSeconds;

  JsonArray attempts = doc["attempts"].to<JsonArray>();
  uint8_t count = session.attemptCount > RR_MAX_ATTEMPTS ? RR_MAX_ATTEMPTS : session.attemptCount;

  for (uint8_t index = 0; index < count; index++) {
    const RRAttempt& attempt = session.attempts[index];
    JsonObject item = attempts.add<JsonObject>();
    item["level"] = attempt.level;
    item["result"] = resultName(attempt.result);
    // The server convention: a timeout has response_ms 0.
    item["response_ms"] = (attempt.result == RR_TIMEOUT) ? (uint32_t)0 : attempt.responseMs;
  }

  if (doc.overflowed()) {
    RR_LOG("ERROR: out of memory while building the JSON");
    return String();
  }

  String json;
  serializeJson(doc, json);
  return json;
}

// The server would answer 400 for these and the game would then block the
// queue forever, so they are refused here with a clear message instead.
static bool sessionLooksValid(const RRSession& session) {
  if (session.attemptCount > RR_MAX_ATTEMPTS) {
    RR_LOG("ERROR: attemptCount %u > %u, game NOT queued", session.attemptCount, RR_MAX_ATTEMPTS);
    return false;
  }
  for (uint8_t index = 0; index < session.attemptCount; index++) {
    uint8_t level = session.attempts[index].level;
    if (level < 1 || level > 15) {
      RR_LOG("ERROR: attempt %u has level %u (must be 1..15), game NOT queued", index + 1, level);
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Flash queue (LittleFS): one file per finished game, "/rrq/q<counter>.json"
// The counter has a fixed width, so sorting by name = sorting by age.
// ---------------------------------------------------------------------------
static String queuePath(uint32_t counter, const char* extension) {
  char buffer[48];
  snprintf(buffer, sizeof(buffer), "%s/q%010lu.%s", RR_QUEUE_DIR, (unsigned long)counter, extension);
  return String(buffer);
}

// Some core versions return "/rrq/name", others "name": keep only the name.
static String baseName(const char* name) {
  String text(name);
  int slash = text.lastIndexOf('/');
  return slash >= 0 ? text.substring(slash + 1) : text;
}

// Number of queued games; oldestPath (may be nullptr) gets the oldest file.
static int scanQueue(String* oldestPath) {
  int count = 0;
  String oldest;

  File dir = LittleFS.open(RR_QUEUE_DIR);
  if (!dir || !dir.isDirectory()) {
    if (oldestPath) *oldestPath = String();
    return 0;
  }

  File entry = dir.openNextFile();
  while (entry) {
    bool isFile = !entry.isDirectory();
    String name = baseName(entry.name());
    entry.close();

    if (isFile && name.endsWith(".json")) {
      count++;
      if (oldest.length() == 0 || name < oldest) oldest = name;
    }
    entry = dir.openNextFile();
  }
  dir.close();

  if (oldestPath) {
    *oldestPath = oldest.length() > 0 ? String(RR_QUEUE_DIR) + "/" + oldest : String();
  }
  return count;
}

// A ".tmp" file is a game whose save was interrupted (power loss): remove it.
static void removeTempFiles() {
  String names[RR_QUEUE_MAX + 8];
  int found = 0;

  File dir = LittleFS.open(RR_QUEUE_DIR);
  if (!dir || !dir.isDirectory()) return;

  File entry = dir.openNextFile();
  while (entry && found < (int)(sizeof(names) / sizeof(names[0]))) {
    String name = baseName(entry.name());
    entry.close();
    if (name.endsWith(".tmp")) names[found++] = String(RR_QUEUE_DIR) + "/" + name;
    entry = dir.openNextFile();
  }
  dir.close();

  for (int index = 0; index < found; index++) LittleFS.remove(names[index]);
}

static String readWholeFile(const String& path) {
  File file = LittleFS.open(path, "r");
  if (!file) return String();
  String text = file.readString();
  file.close();
  return text;
}

// ---------------------------------------------------------------------------
// Session id reserved at game over, so the live game_finished event and the
// upload carry the SAME id (docs/LIVE_PROTOCOL.md)
// ---------------------------------------------------------------------------
static uint32_t gReservedCounter = 0;   // 0 = none

String rrReserveSessionId() {
  if (gReservedCounter == 0) gReservedCounter = nextSessionCounter();
  return formatSessionId(gReservedCounter);
}

// ===========================================================================
// LIVE EVENTS (docs/LIVE_PROTOCOL.md) - best effort, never blocks the game
// ===========================================================================
// The game loop only ENQUEUES (O(1), non-blocking) into a bounded FreeRTOS
// queue. ONE separate task drains it: a batch of up to 20 events every
// ~250 ms (control_pressed, countdown_started, playback_started and
// game_finished wake it at once), 800 ms timeout. Queue full: the OLDEST
// event is dropped. A failed batch is never retried. Wi-Fi down: nothing is
// sent and the queue is emptied. Live data is not the source of truth; the
// upload of the finished game is.
constexpr uint8_t  RR_LIVE_QUEUE_LEN = 32;
constexpr uint8_t  RR_LIVE_BATCH_MAX = 20;
constexpr uint32_t RR_LIVE_BATCH_MS = 250;
constexpr uint32_t RR_LIVE_TIMEOUT_MS = 800;
static const char* RR_PREFS_LIVE_KEY = "lid";

struct RRLiveEvent {
  char gameId[32];
  char json[200];   // one event object; a 17-step playback is ~150 chars
};

static QueueHandle_t gLiveQueue = nullptr;
static TaskHandle_t gLiveTask = nullptr;
static char gLiveGameId[32] = "";
static uint32_t gLiveGameStart = 0;

[[maybe_unused]] static void liveTask(void*) {
  RRLiveEvent item;
  String body;
  for (;;) {
    // Sleep until the next batch is due, or until a "flush now" event.
    ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(RR_LIVE_BATCH_MS));
    if (WiFi.status() != WL_CONNECTED) {
      xQueueReset(gLiveQueue);   // never send old live data later
      continue;
    }
    while (xQueuePeek(gLiveQueue, &item, 0) == pdTRUE) {
      char gameId[sizeof(item.gameId)];
      strncpy(gameId, item.gameId, sizeof(gameId));
      body = String("{\"device_id\":\"") + DEVICE_ID + "\",\"game_id\":\"" + gameId + "\",\"events\":[";
      int count = 0;
      // One request = one game_id (a RESET switches ids between batches).
      while (count < RR_LIVE_BATCH_MAX && xQueuePeek(gLiveQueue, &item, 0) == pdTRUE &&
             strcmp(item.gameId, gameId) == 0) {
        xQueueReceive(gLiveQueue, &item, 0);
        if (count++ > 0) body += ',';
        body += item.json;
      }
      body += "]}";

      WiFiClient client;
      HTTPClient http;
      if (http.begin(client, String(SERVER_URL) + "/api/live/events")) {
        http.setConnectTimeout(RR_LIVE_TIMEOUT_MS);
        http.setTimeout((uint16_t)RR_LIVE_TIMEOUT_MS);
        http.addHeader("Content-Type", "application/json");
        http.addHeader("X-API-Key", API_KEY);
        http.POST(body);   // 202 or not: the batch is gone either way (no retry)
        http.end();
      }
    }
  }
}

static void liveBegin() {
#if RR_LIVE_EVENTS
  gLiveQueue = xQueueCreate(RR_LIVE_QUEUE_LEN, sizeof(RRLiveEvent));
  if (!gLiveQueue) {
    RR_LOG("WARNING: live events off (no memory for the queue)");
    return;
  }
  // Core 0 next to Wi-Fi, low priority: the game loop (core 1) is never delayed.
  xTaskCreatePinnedToCore(liveTask, "rrLive", 6144, nullptr, 1, &gLiveTask, 0);
#endif
}

// Formats one event and puts it in the queue. Never waits.
static void liveEnqueue(bool flushNow, const char* format, ...) {
  if (!gLiveQueue || gLiveGameId[0] == '\0' || WiFi.status() != WL_CONNECTED) return;

  RRLiveEvent item;
  strncpy(item.gameId, gLiveGameId, sizeof(item.gameId));
  item.gameId[sizeof(item.gameId) - 1] = '\0';
  int used = snprintf(item.json, sizeof(item.json), "{\"t_ms\":%lu,", (unsigned long)(millis() - gLiveGameStart));
  va_list args;
  va_start(args, format);
  vsnprintf(item.json + used, sizeof(item.json) - used, format, args);
  va_end(args);

  if (xQueueSend(gLiveQueue, &item, 0) != pdTRUE) {
    RRLiveEvent dropped;
    xQueueReceive(gLiveQueue, &dropped, 0);   // full: drop the OLDEST
    xQueueSend(gLiveQueue, &item, 0);
  }
  if (flushNow && gLiveTask) xTaskNotifyGive(gLiveTask);
}

// A new game_id ("RR01-L-000128"); the counter lives in flash like session ids.
void liveNewGame() {
  gPrefs.begin(RR_PREFS_NAMESPACE, false);
  uint32_t next = gPrefs.getUInt(RR_PREFS_LIVE_KEY, 0) + 1;
  gPrefs.putUInt(RR_PREFS_LIVE_KEY, next);
  gPrefs.end();
  snprintf(gLiveGameId, sizeof(gLiveGameId), "%s-L-%06lu", DEVICE_ID, (unsigned long)next);
  gLiveGameStart = millis();
}

void liveControlPressed(const char* control) {
  liveEnqueue(true, "\"type\":\"control_pressed\",\"control\":\"%s\"}", control);
}

void liveCountdown(uint8_t seconds, uint16_t stepMs) {
  liveEnqueue(true, "\"type\":\"countdown_started\",\"seconds\":%u,\"step_ms\":%u}", seconds, stepMs);
}

void liveGameStarted(uint8_t lives, uint8_t level) {
  liveEnqueue(false, "\"type\":\"game_started\",\"lives\":%u,\"level\":%u}", lives, level);
}

void livePlayback(uint8_t level, uint8_t attempt, const uint8_t* sequence, uint8_t length, uint16_t cueMs, uint16_t gapMs) {
  char list[64] = "";
  size_t pos = 0;
  for (uint8_t i = 0; i < length && i < 17 && pos < sizeof(list) - 3; i++) {
    pos += snprintf(list + pos, sizeof(list) - pos, i ? ",%u" : "%u", sequence[i]);
  }
  liveEnqueue(true, "\"type\":\"playback_started\",\"level\":%u,\"attempt\":%u,\"sequence\":[%s],\"cue_ms\":%u,\"gap_ms\":%u}",
              level, attempt, list, cueMs, gapMs);
}

void liveInputStarted(uint8_t level, uint32_t deadlineMs, uint8_t expectedLength) {
  liveEnqueue(false, "\"type\":\"input_started\",\"level\":%u,\"deadline_ms\":%lu,\"expected_length\":%u}",
              level, (unsigned long)deadlineMs, expectedLength);
}

void livePress(uint8_t index, uint8_t button, uint8_t expected, bool ok) {
  liveEnqueue(false, "\"type\":\"press\",\"index\":%u,\"button\":%u,\"expected\":%u,\"ok\":%s}",
              index, button, expected, ok ? "true" : "false");
}

void liveAttemptResult(uint8_t level, RRResult result, uint8_t lives, uint32_t score, uint32_t points, uint8_t speedBonus) {
  liveEnqueue(false,
              "\"type\":\"attempt_result\",\"level\":%u,\"result\":\"%s\",\"lives\":%u,\"score\":%lu,\"points_awarded\":%lu,\"speed_bonus\":%u}",
              level, resultName(result), lives, (unsigned long)score, (unsigned long)points, speedBonus);
}

// sessionId: rrReserveSessionId(), the id rrQueueSession() then uploads.
void liveGameFinished(bool win, uint32_t finalScore, uint8_t highestLevel, const String& sessionId) {
  liveEnqueue(true, "\"type\":\"game_finished\",\"outcome\":\"%s\",\"final_score\":%lu,\"highest_level_completed\":%u,\"session_id\":\"%s\"}",
              win ? "win" : "game_over", (unsigned long)finalScore, highestLevel, sessionId.c_str());
}

void liveReset() {
  liveEnqueue(true, "\"type\":\"game_reset\"}");
}

int rrQueuedCount() {
  return gFsReady ? scanQueue(nullptr) : 0;
}

String rrLastSessionId() {
  return gLastSessionId;
}

bool rrQueueSession(const RRSession& session) {
  if (!gFsReady) {
    RR_LOG("ERROR: flash (LittleFS) not ready, game NOT saved");
    return false;
  }
  if (!sessionLooksValid(session)) return false;

  // The id announced in the live game_finished event, if one was reserved.
  uint32_t counter = gReservedCounter != 0 ? gReservedCounter : nextSessionCounter();
  gReservedCounter = 0;
  String sessionId = formatSessionId(counter);
  String json = buildSessionJson(session, sessionId);
  if (json.length() == 0) return false;

  // Keep at most RR_QUEUE_MAX games: when full, the OLDEST one is dropped so
  // the newest result (the one the player is waiting for) is kept.
  String oldest;
  for (int guard = 0; guard < RR_QUEUE_MAX && scanQueue(&oldest) >= RR_QUEUE_MAX; guard++) {
    RR_LOG("Queue full (%u games): dropping the oldest, %s", RR_QUEUE_MAX, oldest.c_str());
    if (!LittleFS.remove(oldest)) break;
  }

  // Write to a .tmp file first, then rename: a power cut in the middle can
  // never leave a half-written game that would later be uploaded.
  String tmpPath = queuePath(counter, "tmp");
  String jsonPath = queuePath(counter, "json");

  File file = LittleFS.open(tmpPath, "w");
  if (!file) {
    RR_LOG("ERROR: cannot create %s, game NOT saved", tmpPath.c_str());
    return false;
  }
  size_t written = file.print(json);
  file.close();

  if (written != json.length() || !LittleFS.rename(tmpPath, jsonPath)) {
    LittleFS.remove(tmpPath);
    RR_LOG("ERROR: writing %s failed (flash full?), game NOT saved", jsonPath.c_str());
    return false;
  }

  gLastSessionId = sessionId;
  // Try to upload soon (as soon as the game is no longer active).
  gSendNextTryAt = millis();
  gSendRetryMs = RR_SEND_RETRY_MIN_MS;

  RR_LOG("Queued %s (%u bytes, %d waiting)", sessionId.c_str(), (unsigned)json.length(), scanQueue(nullptr));
  return true;
}

// ---------------------------------------------------------------------------
// Uploader: POST the OLDEST queued game; delete it only on 200/201
// ---------------------------------------------------------------------------
static void scheduleSendRetry() {
  gSendNextTryAt = millis() + gSendRetryMs;
  RR_LOG("Next upload try in %lu s", (unsigned long)(gSendRetryMs / 1000));
  gSendRetryMs = doubled(gSendRetryMs, RR_SEND_RETRY_MAX_MS);
}

static void sendOldestIfDue() {
  if (gGameActive || !gFsReady) return;           // never during gameplay
  if (WiFi.status() != WL_CONNECTED) return;
  if (!timeReached(gSendNextTryAt)) return;

  String path;
  if (scanQueue(&path) == 0) {
    gSendNextTryAt = millis() + RR_IDLE_CHECK_MS;
    return;
  }

  String body = readWholeFile(path);
  if (body.length() == 0) {
    // Unreadable file: moved aside (kept, not deleted) so it cannot block
    // the newer games behind it.
    String badPath = path;
    badPath.replace(".json", ".bad");
    LittleFS.rename(path, badPath);
    RR_LOG("ERROR: %s is empty or unreadable, moved to %s", path.c_str(), badPath.c_str());
    return;
  }

  WiFiClient client;
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/game-sessions";

  if (!http.begin(client, url)) {
    RR_LOG("Upload: bad SERVER_URL \"%s\"", SERVER_URL);
    scheduleSendRetry();
    return;
  }
  http.setConnectTimeout(RR_UPLOAD_CONNECT_TIMEOUT_MS);
  http.setTimeout(RR_UPLOAD_READ_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  int code = http.POST(body);
  http.end();

  if (code == 200 || code == 201) {
    // 201 = saved now, 200 = the server already had it (a retry after a lost
    // answer). Either way the game is safe on the server.
    LittleFS.remove(path);
    RR_LOG("Uploaded %s -> HTTP %d%s", path.c_str(), code, code == 200 ? " (already saved before)" : "");
    gSendRetryMs = RR_SEND_RETRY_MIN_MS;
    gSendNextTryAt = millis() + RR_SEND_GAP_MS;
    return;
  }

  // Anything else: keep the file and try again later.
  if (code > 0) {
    RR_LOG("Upload of %s refused: HTTP %d (kept in the queue)", path.c_str(), code);
    if (code == 401) RR_LOG("  -> 401: API_KEY in config.h does not match DEVICE_API_KEY on the server");
    if (code == 403) RR_LOG("  -> 403: DEVICE_ID in config.h does not own this API key");
    if (code == 400) RR_LOG("  -> 400: the JSON does not match docs/session.schema.json (firmware bug)");
  } else {
    RR_LOG("Upload of %s failed: %s (kept in the queue)", path.c_str(), HTTPClient::errorToString(code).c_str());
  }
  scheduleSendRetry();
}

// ---------------------------------------------------------------------------
// Wi-Fi: connect, notice drops, reconnect with backoff (never blocks)
// ---------------------------------------------------------------------------
static void wifiLoop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!gWifiWasConnected) {
      gWifiWasConnected = true;
      gWifiRetryMs = RR_WIFI_RETRY_MIN_MS;
      gSendNextTryAt = millis();   // upload what waited while offline
      RR_LOG("Wi-Fi connected, IP %s", WiFi.localIP().toString().c_str());
    }
    return;
  }

  if (gWifiWasConnected) {
    gWifiWasConnected = false;
    gWifiNextTryAt = millis();
    RR_LOG("Wi-Fi lost");
  }

  if (!timeReached(gWifiNextTryAt)) return;

  RR_LOG("Wi-Fi: connecting to \"%s\" (next try in %lu s if it fails)", WIFI_SSID,
         (unsigned long)(gWifiRetryMs / 1000));
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);   // returns at once; connects in the background
  gWifiNextTryAt = millis() + gWifiRetryMs;
  gWifiRetryMs = doubled(gWifiRetryMs, RR_WIFI_RETRY_MAX_MS);
}

// ---------------------------------------------------------------------------
// Difficulty: how many steps to add next level (0..2), +1 on ANY problem
// ---------------------------------------------------------------------------
int getNextSteps(float accuracy, float reactionRatio, int level, int currentLength) {
  if (WiFi.status() != WL_CONNECTED) return RR_FALLBACK_STEPS;

  // Same limits as the server, so a bad value does not even cost a request.
  if (!(accuracy >= 0.0f && accuracy <= 1.0f) || !(reactionRatio >= 0.0f) ||
      level < 1 || level > 15 || currentLength < 3 || currentLength > 17) {
    return RR_FALLBACK_STEPS;
  }

  JsonDocument request;
  request["accuracy"] = accuracy;
  request["reactionRatio"] = reactionRatio;
  request["level"] = level;
  request["currentLength"] = currentLength;
  String body;
  serializeJson(request, body);

  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, String(SERVER_URL) + "/api/difficulty/next")) return RR_FALLBACK_STEPS;

  // The 800 ms budget is split: connecting + waiting for the answer.
  http.setConnectTimeout(RR_DIFFICULTY_TIMEOUT_MS / 2);
  http.setTimeout((uint16_t)(RR_DIFFICULTY_TIMEOUT_MS / 2));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", API_KEY);

  int code = http.POST(body);
  if (code != 200) {
    http.end();
    return RR_FALLBACK_STEPS;
  }
  String reply = http.getString();
  http.end();

  JsonDocument answer;
  if (deserializeJson(answer, reply)) return RR_FALLBACK_STEPS;
  if (!answer["steps"].is<int>()) return RR_FALLBACK_STEPS;

  int steps = answer["steps"].as<int>();
  return (steps >= 0 && steps <= 2) ? steps : RR_FALLBACK_STEPS;
}

// ---------------------------------------------------------------------------
// Start and loop
// ---------------------------------------------------------------------------
void rrNetSetGameActive(bool active) {
  gGameActive = active;
}

void rrNetBegin() {
  // true = format the flash partition the first time (or if it is damaged).
  gFsReady = LittleFS.begin(true);
  if (!gFsReady) {
    RR_LOG("ERROR: LittleFS could not start - finished games cannot be queued");
  } else {
    if (!LittleFS.exists(RR_QUEUE_DIR)) LittleFS.mkdir(RR_QUEUE_DIR);
    removeTempFiles();
    RR_LOG("Queue: %d game(s) waiting from before", scanQueue(nullptr));
  }

  if (String(SERVER_URL).startsWith("https://")) {
    RR_LOG("WARNING: SERVER_URL is https but this sketch uses plain HTTP (see HTTPS NOTE)");
  }

  liveBegin();

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(false);   // reconnects are handled by wifiLoop()
  WiFi.setSleep(false);           // faster answers for getNextSteps()
  gWifiNextTryAt = millis();      // connect on the first rrNetLoop()
  gSendNextTryAt = millis();

  RR_LOG("Device %s, server %s", DEVICE_ID, SERVER_URL);
}

void rrNetLoop() {
  wifiLoop();
  sendOldestIfDue();
}

// ===========================================================================
// END OF NETWORK LAYER
// ===========================================================================

#if RR_DEMO_SERIAL_COMMANDS
// ---------------------------------------------------------------------------
// Test commands for the Serial Monitor (115200 baud). Not game logic: they
// only call the network layer so it can be tested without buttons.
// ---------------------------------------------------------------------------
static RRSession exampleSession() {
  // The example record of AGENTS.md / docs/session.schema.json.
  RRSession session = {};
  session.win = false;
  session.finalScore = 127;
  session.highestLevelCompleted = 1;
  session.finalSequenceLength = 4;
  session.successfulRounds = 1;
  session.failedAttempts = 3;
  session.durationSeconds = 42;
  session.attemptCount = 3;
  session.attempts[0] = {1, RR_PASS, 4100};
  session.attempts[1] = {2, RR_WRONG, 2100};
  session.attempts[2] = {2, RR_TIMEOUT, 0};
  return session;
}

static void listQueue() {
  File dir = LittleFS.open(RR_QUEUE_DIR);
  if (!dir || !dir.isDirectory()) {
    RR_LOG("Queue folder missing");
    return;
  }
  File entry = dir.openNextFile();
  while (entry) {
    RR_LOG("  %s (%u bytes)", baseName(entry.name()).c_str(), (unsigned)entry.size());
    entry.close();
    entry = dir.openNextFile();
  }
  dir.close();
  RR_LOG("%d game(s) waiting", rrQueuedCount());
}

static void demoSerialCommands() {
  if (!Serial.available()) return;
  char command = (char)Serial.read();

  switch (command) {
    case 'p':
      RR_LOG("JSON preview: %s", buildSessionJson(exampleSession(), String(DEVICE_ID) + "-PREVIEW").c_str());
      break;
    case 'f':
      rrQueueSession(exampleSession());
      break;
    case 'd': {
      uint32_t started = millis();
      int steps = getNextSteps(0.8f, 0.6f, 5, 7);
      RR_LOG("getNextSteps -> %d (took %lu ms)", steps, (unsigned long)(millis() - started));
      break;
    }
    case 'q':
      listQueue();
      break;
    case 'a':
      rrNetSetGameActive(!gGameActive);
      RR_LOG("Game active: %s (uploads %s)", gGameActive ? "yes" : "no", gGameActive ? "paused" : "allowed");
      break;
    case 'w':
      RR_LOG("Wi-Fi status %d, IP %s", (int)WiFi.status(), WiFi.localIP().toString().c_str());
      break;
    case 'l':   // the web /live page should show START + the 3-2-1 countdown
      liveNewGame();
      liveControlPressed("start");
      liveCountdown(3, 1000);
      RR_LOG("Live test sent (game id %s)", gLiveGameId);
      break;
    case 'h':
      RR_LOG("Commands: p=print example JSON  f=queue example game  d=difficulty call");
      RR_LOG("          q=list queue  a=toggle game active  w=Wi-Fi status  l=live test  h=help");
      break;
    default:
      break;   // newline characters etc.
  }
}
#endif

void setup() {
  Serial.begin(115200);
  rrNetBegin();
#if RR_DEMO_SERIAL_COMMANDS
  RR_LOG("Type h + Enter in the Serial Monitor for test commands");
#endif
}

void loop() {
  rrNetLoop();

#if RR_DEMO_SERIAL_COMMANDS
  demoSerialCommands();
#endif

  // The game code goes here. Like the network layer, it should never block
  // for long (no long delay()), so uploads and Wi-Fi keep working.
}
