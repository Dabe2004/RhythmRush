// backend/src/services/nickname.js
// The ONE nickname rule for PATCH /api/game-sessions/:id/nickname.
//
// Trimmed first, then 1-16 characters from A-Z a-z 0-9 space - _, and no
// word from backend/blocklist.txt. The frontend has the same character rule
// in frontend/src/nickname.js (the blocklist is server-only).

const fs = require("fs");
const path = require("path");
const { z } = require("zod");

const NICKNAME_PATTERN = /^[A-Za-z0-9 _-]+$/;
const NICKNAME_MAX_LENGTH = 16;
const BLOCKLIST_FILE = path.join(__dirname, "..", "..", "blocklist.txt");

// Words of 5+ letters match anywhere ("motherfucker" hits "fucker").
// Shorter words match only a whole word, or the whole nickname once
// separators are removed ("f-u-c-k"), so "Class" never hits "ass".
// Tradeoff: "fuckboy" passes unless the longer form is listed too.
const SHORT_WORD = 4;

const LEET = { 0: "o", 3: "e", 4: "a", 5: "s", "@": "a" };

// "f+u+c+k+" for "fuck": a repeated letter ("fuuuck") still matches.
function wordPattern(word) {
  return word
    .split("")
    .map((ch) => `${ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}+`)
    .join("");
}

function parseBlocklist(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith("#"))
    .map((word) => ({ short: word.length <= SHORT_WORD, re: new RegExp(wordPattern(word)) }));
}

// Lowercase, undo digit/symbol swaps, split on space - _, and glue runs of
// single letters back together ("Big F-u-c-k" -> big, fuck). "1" can stand
// for "i" or "l", so both readings are checked.
function readings(nickname) {
  const lower = nickname.toLowerCase().replace(/[0345@]/g, (ch) => LEET[ch]);
  return ["i", "l"].map((one) => {
    const tokens = [];
    let run = "";
    for (const part of lower.replace(/1/g, one).split(/[\s_-]+/).filter(Boolean)) {
      if (part.length === 1) {
        run += part;
        continue;
      }
      if (run) tokens.push(run);
      run = "";
      tokens.push(part);
    }
    if (run) tokens.push(run);
    return { tokens, joined: tokens.join("") };
  });
}

function isBlockedNickname(nickname, words) {
  return readings(nickname).some(({ tokens, joined }) =>
    words.some(({ short, re }) => {
      if (!short) return re.test(joined);
      const whole = new RegExp(`^(?:${re.source})$`);
      return whole.test(joined) || tokens.some((token) => whole.test(token));
    })
  );
}

// Loaded at startup and re-read when tools/moderate.js block-add changes the
// file, so a new word works without restarting the server.
let cache = { mtimeMs: -1, words: [] };
function blocklist() {
  try {
    const { mtimeMs } = fs.statSync(BLOCKLIST_FILE);
    if (mtimeMs !== cache.mtimeMs) {
      cache = { mtimeMs, words: parseBlocklist(fs.readFileSync(BLOCKLIST_FILE, "utf8")) };
    }
  } catch (err) {
    if (cache.mtimeMs === -1) console.warn(`Nickname blocklist not loaded: ${err.message}`);
    cache.mtimeMs = 0;
  }
  return cache.words;
}
blocklist();

const nicknameField = z
  .string()
  .trim()
  .min(1)
  .max(NICKNAME_MAX_LENGTH)
  .regex(NICKNAME_PATTERN)
  .refine((nickname) => !isBlockedNickname(nickname, blocklist()));

module.exports = {
  nicknameField,
  NICKNAME_PATTERN,
  NICKNAME_MAX_LENGTH,
  BLOCKLIST_FILE,
  parseBlocklist,
  isBlockedNickname,
};
