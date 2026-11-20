// backend/src/services/nickname.js
// The ONE nickname rule, shared by the public route (set once) and the admin
// route (overwrite / clear), so the two can never drift apart.
//
// Trimmed first, then 1-16 characters from A-Z a-z 0-9 space - _.
// The frontend has the same rule in frontend/src/nickname.js.

const { z } = require("zod");

const NICKNAME_PATTERN = /^[A-Za-z0-9 _-]+$/;
const NICKNAME_MAX_LENGTH = 16;

const nicknameField = z
  .string()
  .trim()
  .min(1)
  .max(NICKNAME_MAX_LENGTH)
  .regex(NICKNAME_PATTERN);

module.exports = { nicknameField, NICKNAME_PATTERN, NICKNAME_MAX_LENGTH };
