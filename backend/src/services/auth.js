// backend/src/services/auth.js
// One shared device API key check, used by every route that needs a key
// (currently POST /api/game-sessions and POST /api/difficulty/next).
//
// Devices store only sha256(key), so we hash the incoming header and compare
// the hashes with crypto.timingSafeEqual (constant time).

const crypto = require("crypto");

// sha256 hex buffer for a raw key.
function hashApiKey(apiKey) {
  return crypto.createHash("sha256").update(String(apiKey)).digest();
}

/**
 * Find the device that owns this API key.
 *
 * @param {import("better-sqlite3").Database} db open database
 * @param {string} apiKey raw key from the X-API-Key header
 * @returns {{device_id: string, api_key_hash: string}|null}
 */
function findDeviceByApiKey(db, apiKey) {
  if (!apiKey) return null;

  const incoming = hashApiKey(apiKey);
  const devices = db.prepare("SELECT device_id, api_key_hash FROM devices").all();

  for (const device of devices) {
    const stored = Buffer.from(device.api_key_hash, "hex");

    // timingSafeEqual throws when the lengths differ, so check first.
    if (stored.length === incoming.length && crypto.timingSafeEqual(stored, incoming)) {
      return device;
    }
  }

  return null;
}

/**
 * Express middleware: 401 unless X-API-Key belongs to a known device.
 * On success the device is available as req.device.
 *
 * @param {import("better-sqlite3").Database} db open database
 */
function requireDeviceApiKey(db) {
  return (req, res, next) => {
    const apiKey = req.get("X-API-Key");

    if (!apiKey) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const device = findDeviceByApiKey(db, apiKey);

    if (!device) {
      return res.status(401).json({ error: "unauthorized" });
    }

    req.device = device;
    return next();
  };
}

module.exports = {
  hashApiKey,
  findDeviceByApiKey,
  requireDeviceApiKey,
};
