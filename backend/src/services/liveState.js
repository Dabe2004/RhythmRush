// backend/src/services/liveState.js
// Live game mirror: what each device is doing RIGHT NOW (docs/LIVE_PROTOCOL.md).
// Memory only, never stored: the final upload stays the source of truth.
//
// reduceLive(state, event, now) is pure; createLiveStore() keeps one state per
// device, a ring buffer of broadcast messages (for SSE Last-Event-ID replay)
// and the listeners. The clock is injected so tests control time.

const ABANDON_MS = 90 * 1000;
const BUFFER_SIZE = 200;
const OLD_GAMES_KEPT = 50;

function emptyState(deviceId, gameId = null) {
  return {
    device_id: deviceId,
    game_id: gameId,
    phase: "idle", // idle | countdown | watch | input | result_pending
    level: null,
    attempt: null,
    lives: null,
    score: null,
    sequence: null, // last playback: { sequence, level, attempt, cue_ms, gap_ms, startedAt }
    input: null, // { expected_length, deadline_ms, done, startedAt }
    lastPress: null,
    countdown: null, // { seconds, step_ms, startedAt }
    lastControl: null, // { control, at }
    lastResult: null, // last attempt_result (cleared by the next playback)
    final: null, // game_finished fields
    resetAt: null,
    abandoned: false,
    lastEventAt: null,
  };
}

const IN_GAME = new Set(["watch", "input"]);

/**
 * Apply one event. Returns { state, applied }. An event that does not fit
 * the current phase (a press during the countdown, a result while idle) is
 * ignored: applied = false and the state is returned unchanged.
 */
function reduceLive(state, event, now) {
  const s = { ...state, lastEventAt: now, abandoned: false };
  const ignore = { state, applied: false };
  const ok = (next) => ({ state: next, applied: true });

  switch (event.type) {
    case "control_pressed":
      return ok({ ...s, lastControl: { control: event.control, at: now } });

    case "countdown_started":
      // A second countdown_started (RESET during the countdown) restarts it.
      return ok({
        ...s,
        phase: "countdown",
        countdown: { seconds: event.seconds, step_ms: event.step_ms, startedAt: now },
        sequence: null,
        input: null,
        lastPress: null,
        lastResult: null,
        final: null,
      });

    case "game_started":
      if (state.phase !== "countdown" && state.phase !== "idle") return ignore;
      return ok({ ...s, phase: "watch", lives: event.lives, level: event.level, score: 0, attempt: null });

    case "playback_started":
      // Accepted from idle too: a server restart mid-game must not freeze the mirror.
      if (state.phase === "result_pending") return ignore;
      return ok({
        ...s,
        phase: "watch",
        level: event.level,
        attempt: event.attempt,
        sequence: {
          sequence: event.sequence,
          level: event.level,
          attempt: event.attempt,
          cue_ms: event.cue_ms,
          gap_ms: event.gap_ms,
          startedAt: now,
        },
        input: null,
        lastPress: null,
        lastResult: null,
        countdown: null,
      });

    case "input_started":
      if (!IN_GAME.has(state.phase)) return ignore;
      return ok({
        ...s,
        phase: "input",
        input: { expected_length: event.expected_length, deadline_ms: event.deadline_ms, done: 0, startedAt: now },
      });

    case "press": {
      if (state.phase !== "input" || !state.input) return ignore;
      const done = event.ok ? Math.max(state.input.done, event.index + 1) : state.input.done;
      return ok({
        ...s,
        input: { ...state.input, done },
        lastPress: { index: event.index, button: event.button, expected: event.expected, ok: event.ok, at: now },
      });
    }

    case "attempt_result":
      if (!IN_GAME.has(state.phase)) return ignore;
      return ok({
        ...s,
        phase: "watch", // waiting for the next playback (NICE! / SAME SEQUENCE AGAIN)
        lives: event.lives,
        score: event.score,
        input: null,
        lastResult: {
          level: event.level,
          result: event.result,
          lives: event.lives,
          score: event.score,
          points_awarded: event.points_awarded,
          speed_bonus: event.speed_bonus,
          at: now,
        },
      });

    case "game_finished":
      if (!IN_GAME.has(state.phase)) return ignore;
      return ok({
        ...s,
        phase: "result_pending",
        score: event.final_score,
        input: null,
        final: {
          outcome: event.outcome,
          final_score: event.final_score,
          highest_level_completed: event.highest_level_completed,
          session_id: event.session_id,
          at: now,
        },
      });

    case "game_reset":
      return ok({ ...emptyState(state.device_id, state.game_id), lastControl: state.lastControl, resetAt: now, lastEventAt: now });

    default:
      return ignore;
  }
}

function createLiveStore({ now = Date.now, abandonMs = ABANDON_MS, bufferSize = BUFFER_SIZE } = {}) {
  const devices = new Map(); // device_id -> { state, oldGames: [] }
  const buffer = [];
  const listeners = new Set();
  let lastId = 0;

  function publish(event, state) {
    const message = { id: ++lastId, event, state };
    buffer.push(message);
    if (buffer.length > bufferSize) buffer.shift();
    for (const listener of listeners) listener(message);
  }

  // 90 s of silence in a game = abandoned, back to idle (broadcast once).
  function tick() {
    const t = now();
    for (const entry of devices.values()) {
      const { state } = entry;
      if (state.phase !== "idle" && state.lastEventAt !== null && t - state.lastEventAt > abandonMs) {
        entry.state = { ...emptyState(state.device_id, state.game_id), abandoned: true, lastEventAt: state.lastEventAt };
        publish({ type: "abandoned", device_id: state.device_id, game_id: state.game_id, receivedAt: t }, entry.state);
      }
    }
  }

  // Returns how many events were applied (0 for a stale game_id).
  function accept(deviceId, gameId, events) {
    tick();
    let entry = devices.get(deviceId);
    if (!entry) {
      entry = { state: emptyState(deviceId), oldGames: [] };
      devices.set(deviceId, entry);
    }

    if (gameId !== entry.state.game_id) {
      if (entry.oldGames.includes(gameId)) return 0;
      if (entry.state.game_id !== null) {
        entry.oldGames.push(entry.state.game_id);
        if (entry.oldGames.length > OLD_GAMES_KEPT) entry.oldGames.shift();
      }
      // RESET marks stay visible across the switch (the page plays the reset flash).
      const { lastControl, resetAt } = entry.state;
      entry.state = { ...emptyState(deviceId, gameId), lastControl, resetAt };
    }

    let accepted = 0;
    for (const event of events) {
      const t = now();
      const result = reduceLive(entry.state, event, t);
      if (!result.applied) continue;
      entry.state = result.state;
      accepted += 1;
      publish({ ...event, device_id: deviceId, game_id: gameId, receivedAt: t }, entry.state);
    }
    return accepted;
  }

  // The device that sent the newest event, if it is in a game.
  function snapshot() {
    tick();
    let newest = null;
    for (const { state } of devices.values()) {
      if (state.lastEventAt !== null && (newest === null || state.lastEventAt > newest.lastEventAt)) newest = state;
    }
    if (newest === null || newest.phase === "idle") return { active: false, now: now() };
    return { active: true, now: now(), state: newest };
  }

  // Messages after lastSeenId, or null when the buffer no longer has them.
  function since(lastSeenId) {
    if (lastSeenId > lastId) return null;
    if (lastSeenId === lastId) return [];
    if (buffer.length === 0 || buffer[0].id > lastSeenId + 1) return null;
    return buffer.filter((message) => message.id > lastSeenId);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { accept, snapshot, since, subscribe, tick, lastId: () => lastId, listenerCount: () => listeners.size };
}

module.exports = { reduceLive, createLiveStore, emptyState, ABANDON_MS, BUFFER_SIZE };
