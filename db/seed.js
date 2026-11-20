// db/seed.js
// Inserts the minimum data the app needs to run:
//   1. Device RR01, with the SHA-256 hash of DEVICE_API_KEY (never the raw key).
//   2. Device SIM01, with the SHA-256 hash of SIM_API_KEY. This is the fake
//      device used by /tools/fake_esp32.js, kept separate from real games.
//   3. The animal IQ percentiles in app_config as JSON text.
//
// All writes use INSERT OR IGNORE, so running this script twice changes
// nothing the second time.
//
// Usage (from /backend): npm run seed

const crypto = require("crypto");

// Requiring the backend db also loads backend/.env, so DEVICE_API_KEY and
// SIM_API_KEY are available here. /db has no node_modules, so everything
// comes from /backend.
const db = require("../backend/src/db");

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

const apiKey = process.env.DEVICE_API_KEY;
const simApiKey = process.env.SIM_API_KEY;

if (!apiKey) {
  console.error(
    "DEVICE_API_KEY is missing. Add it to backend/.env (see backend/.env.example)."
  );
  process.exit(1);
}

if (!simApiKey) {
  console.error(
    "SIM_API_KEY is missing. Add it to backend/.env (see backend/.env.example)."
  );
  process.exit(1);
}

// The example values are public (they are in .env.example on GitHub). With
// them, anyone on the Wi-Fi could upload fake scores. Refuse them for the
// exhibition (NODE_ENV=production); only warn during development.
const EXAMPLE_KEYS = ["change-me", "dev-sim01-key"];
const weakKeys = [
  ["DEVICE_API_KEY", apiKey],
  ["SIM_API_KEY", simApiKey],
].filter(([, value]) => EXAMPLE_KEYS.includes(value));

if (weakKeys.length > 0) {
  const names = weakKeys.map(([name]) => name).join(" and ");

  if (process.env.NODE_ENV === "production") {
    console.error(
      `${names} still use the example value. Put real random keys in backend/.env before seeding the exhibition database.`
    );
    process.exit(1);
  }

  console.warn(`Warning: ${names} still use the example value (fine for development only).`);
}

// Store only hashes. The raw keys never touch the database.
function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// ---------------------------------------------------------------------------
// 1 + 2. Devices RR01 (real hardware) and SIM01 (fake uploader)
// ---------------------------------------------------------------------------

const insertDevice = db.prepare(`
  INSERT OR IGNORE INTO devices (device_id, name, api_key_hash, last_seen_at)
  VALUES (?, ?, ?, NULL)
`);

const devices = [
  { id: "RR01", name: "Rhythm Rush test device", key: apiKey },
  { id: "SIM01", name: "Simulated device", key: simApiKey },
];

const deviceResults = devices.map((device) => ({
  ...device,
  inserted: insertDevice.run(device.id, device.name, sha256(device.key)).changes === 1,
}));

// ---------------------------------------------------------------------------
// 3. Animal IQ tiers (JSON text in app_config)
// ---------------------------------------------------------------------------
// Score percentiles, from AGENTS.md. Never fixed score numbers: the maximum
// score is about 12,750 and the distribution can change.
const animalTiers = [
  { percentile_min: 0.9, animal: "Chimpanzee", iq_range: "90-100" },        // top 10%
  { percentile_min: 0.75, animal: "Bottlenose Dolphin", iq_range: "80-90" }, // next 15%
  { percentile_min: 0.55, animal: "Elephant", iq_range: "70-80" },          // next 20%
  { percentile_min: 0.3, animal: "Orangutan", iq_range: "60-70" },          // next 25%
  { percentile_min: 0.0, animal: "Pig", iq_range: "50-60" },                // rest 30%
];

const insertConfig = db.prepare(
  "INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)"
);

const tiersResult = insertConfig.run("animal_tiers", JSON.stringify(animalTiers));

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

for (const device of deviceResults) {
  if (device.inserted) {
    console.log(`inserted device ${device.id}`);
  } else {
    console.log(`device ${device.id} already exists (unchanged)`);
  }
}

if (tiersResult.changes === 1) {
  console.log("inserted app_config key 'animal_tiers'");
} else {
  console.log("app_config key 'animal_tiers' already exists (unchanged)");
}
