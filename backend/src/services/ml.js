// backend/src/services/ml.js
// Applies the three exported ML models in plain JavaScript.
//
// No Python runs in production: Express reads the JSON files written by the
// training scripts in /ml (backend/artifacts/*.json) and reproduces the same
// maths. ml/check_exports.py is the Python twin of the code in this file.
//
// The artifacts are read once, on first use, then cached in memory.
// If a file is missing or broken, the function throws a clear Error; the
// caller (the upload route) decides what to do.

const fs = require("fs");
const path = require("path");

// [final_score, avg_reaction_sec, highest_sequence_length, success_rate]
// Same order everywhere: skill.json "features" and animal.json mean/std.
const FEATURE_NAMES = [
  "final_score",
  "avg_reaction_sec",
  "highest_sequence_length",
  "success_rate",
];

// IQ ranges from AGENTS.md. Also stored as strings in animal.json "iq_range".
const IQ_RANGES = {
  Chimpanzee: [90, 100],
  "Bottlenose Dolphin": [80, 90],
  Elephant: [70, 80],
  Orangutan: [60, 70],
  Pig: [50, 60],
};

// ---------------------------------------------------------------------------
// Lazy loading + cache
// ---------------------------------------------------------------------------
let cache = null;

// ARTIFACTS_DIR can be overridden (used by the tests). Otherwise the folder
// next to src/routes and src/services: backend/artifacts.
function artifactsDir() {
  return process.env.ARTIFACTS_DIR || path.join(__dirname, "..", "..", "artifacts");
}

function readArtifact(filename) {
  const file = path.join(artifactsDir(), filename);

  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(`Cannot read ML artifact ${file}: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON in ML artifact ${file}: ${err.message}`);
  }

  if (data === null || typeof data !== "object") {
    throw new Error(`Invalid ML artifact ${file}: expected a JSON object`);
  }

  return data;
}

function loadSkill() {
  ensureCache();
  if (cache.skill) return cache.skill;

  const data = readArtifact("skill.json");

  if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
    throw new Error("Invalid skill.json: missing nodes array");
  }
  if (!Array.isArray(data.features) || data.features.length !== FEATURE_NAMES.length) {
    throw new Error("Invalid skill.json: missing features array");
  }

  cache.skill = {
    version: data.version,
    features: data.features,
    // id -> node, so walking the tree is a simple lookup.
    nodes: new Map(data.nodes.map((node) => [Number(node.id), node])),
  };

  return cache.skill;
}

function loadDifficulty() {
  ensureCache();
  if (cache.difficulty) return cache.difficulty;

  const data = readArtifact("difficulty.json");

  if (typeof data.intercept !== "number" || typeof data.weights !== "object" || data.weights === null) {
    throw new Error("Invalid difficulty.json: expected intercept and weights");
  }

  cache.difficulty = {
    version: data.version,
    intercept: data.intercept,
    weights: data.weights,
  };

  return cache.difficulty;
}

function loadAnimal() {
  ensureCache();
  if (cache.animal) return cache.animal;

  const data = readArtifact("animal.json");

  if (!Array.isArray(data.mean) || !Array.isArray(data.std)) {
    throw new Error("Invalid animal.json: missing mean/std arrays");
  }
  if (!Array.isArray(data.rows) || data.rows.length === 0) {
    throw new Error("Invalid animal.json: missing rows array");
  }
  if (!Array.isArray(data.tiers) || data.tiers.length === 0) {
    throw new Error("Invalid animal.json: missing tiers array");
  }

  // Reference scores for the percentile formula, and the standardized rows
  // for the nearest-neighbor search. Built once.
  const scores = data.rows.map((row) => Number(row.features[0]));
  const scaledRows = data.rows.map((row) => standardize(row.features, data.mean, data.std));

  cache.animal = {
    version: data.version,
    mean: data.mean,
    std: data.std,
    rows: data.rows,
    scores,
    scaledRows,
    tiers: data.tiers,
  };

  return cache.animal;
}

function ensureCache() {
  if (!cache) {
    cache = { skill: null, difficulty: null, animal: null };
  }
  return cache;
}

// Starts with an empty cache. Only the tests need this (they switch
// ARTIFACTS_DIR while the process is running).
function resetCache() {
  cache = null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function standardize(values, mean, std) {
  return values.map((value, index) => (Number(value) - mean[index]) / std[index]);
}

function toNumbers(features, names, callerName) {
  // Accept an object keyed by feature name, or an array in feature order.
  const values = Array.isArray(features)
    ? features.map(Number)
    : names.map((name) => Number(features[name]));

  if (values.length !== names.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${callerName}: expected ${names.length} finite feature values`);
  }

  return values;
}

// pandas rank(pct=True, method="average") on the reference scores:
//   percentile = (countLess + (countEqual + 1) / 2) / n
// This is exactly what ml/train_animal.py used to write score_percentile.
function percentileFromScores(value, scores) {
  let less = 0;
  let equal = 0;

  for (const score of scores) {
    if (score < value) less += 1;
    else if (score === value) equal += 1;
  }

  return (less + (equal + 1) / 2) / scores.length;
}

// Percentile of any score measured against the reference scores, using the
// same average-rank formula pandas used to create score_percentile.
function percentileForScore(score) {
  const model = loadAnimal();
  const value = Number(score);

  if (!Number.isFinite(value)) {
    throw new Error("percentileForScore: score must be a finite number");
  }

  return percentileFromScores(value, model.scores);
}

// Tiers are ordered best first, so the first match wins.
function animalForPercentile(percentile) {
  const { tiers } = loadAnimal();

  for (const tier of tiers) {
    if (percentile >= Number(tier.percentile_min)) {
      return tier.animal;
    }
  }

  throw new Error(`No animal tier for percentile ${percentile}`);
}

// Where the percentile sits inside its tier: 0 at the bottom, 1 at the top.
// The top tier ends at percentile 1.0.
function iqForPercentile(percentile) {
  const { tiers } = loadAnimal();

  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    const low = Number(tier.percentile_min);

    if (percentile >= low) {
      const high = index === 0 ? 1.0 : Number(tiers[index - 1].percentile_min);
      const span = high - low;
      const position = span > 0 ? Math.min(1, Math.max(0, (percentile - low) / span)) : 0;

      const range = IQ_RANGES[tier.animal];
      if (!range) {
        throw new Error(`No IQ range for animal ${tier.animal}`);
      }

      return Math.round(range[0] + (range[1] - range[0]) * position);
    }
  }

  throw new Error(`No animal tier for percentile ${percentile}`);
}

// ---------------------------------------------------------------------------
// Model 1: Adaptive Difficulty
// ---------------------------------------------------------------------------
// raw = intercept + w.accuracy*accuracy + w.reactionRatio*reactionRatio + w.level*level
function difficultyRaw({ accuracy, reactionRatio, level }) {
  const model = loadDifficulty();
  const weights = model.weights;

  const values = [accuracy, reactionRatio, level].map(Number);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("difficultyRaw: accuracy, reactionRatio and level must be finite numbers");
  }

  // Same operation order as ml/check_exports.py difficulty_prediction().
  return (
    model.intercept +
    weights.accuracy * values[0] +
    weights.reactionRatio * values[1] +
    weights.level * values[2]
  );
}

// Round half up (np.floor(raw + 0.5)) and clamp to 0..2.
function predictSteps(inputs) {
  const raw = difficultyRaw(inputs);
  const rounded = Math.floor(raw + 0.5);

  return Math.min(2, Math.max(0, rounded));
}

// ---------------------------------------------------------------------------
// Model 2: Skill Classifier
// ---------------------------------------------------------------------------
// Walk from node 0, go left when value <= threshold, stop at a leaf.
function predictSkill(features) {
  const model = loadSkill();

  // The order comes from skill.json, not from the order of the input object.
  const values = toNumbers(features, model.features, "predictSkill");

  let node = model.nodes.get(0);
  if (!node) {
    throw new Error("Invalid skill.json: no root node with id 0");
  }

  while (node.leaf === undefined) {
    const featureValue = values[Number(node.feature)];
    const nextId = featureValue <= Number(node.threshold) ? node.left : node.right;

    node = model.nodes.get(Number(nextId));
    if (!node) {
      throw new Error(`Invalid skill.json: missing node ${nextId}`);
    }
  }

  return String(node.leaf);
}

// ---------------------------------------------------------------------------
// Model 3: Animal IQ Matcher
// ---------------------------------------------------------------------------
// Nearest neighbor over the reference rows plus every stored session_features
// row (except excludeSessionId). The matched game's score percentile picks
// the animal and its IQ.
function matchAnimal(db, features, excludeSessionId) {
  const model = loadAnimal();
  const query = standardize(toNumbers(features, FEATURE_NAMES, "matchAnimal"), model.mean, model.std);

  let bestDistance = Infinity;
  let bestPercentile = null;
  let bestSessionId = null;

  // 1. Reference rows first, so they win exact ties.
  for (let index = 0; index < model.scaledRows.length; index += 1) {
    const distance = euclideanDistance(query, model.scaledRows[index]);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestPercentile = Number(model.rows[index].score_percentile);
      bestSessionId = String(model.rows[index].id);
    }
  }

  // 2. Real sessions stored in SQLite, in a stable order.
  const sql = `
    SELECT session_id, final_score, avg_reaction_sec, highest_sequence_length, success_rate
    FROM session_features
    WHERE (? IS NULL OR session_id <> ?)
    ORDER BY session_id
  `;
  const rows = db.prepare(sql).all(excludeSessionId ?? null, excludeSessionId ?? null);

  for (const row of rows) {
    const values = [
      row.final_score,
      row.avg_reaction_sec,
      row.highest_sequence_length,
      row.success_rate,
    ];
    const distance = euclideanDistance(query, standardize(values, model.mean, model.std));

    if (distance < bestDistance) {
      bestDistance = distance;
      // A database row has no stored percentile, so compute it from its
      // final_score against the reference scores.
      bestPercentile = percentileFromScores(Number(row.final_score), model.scores);
      bestSessionId = String(row.session_id);
    }
  }

  const animal = animalForPercentile(bestPercentile);
  const iq = iqForPercentile(bestPercentile);

  return {
    animal,
    iq,
    percentile: bestPercentile,
    matchedSessionId: bestSessionId,
    distance: bestDistance,
  };
}

function euclideanDistance(a, b) {
  let squared = 0;

  for (let index = 0; index < a.length; index += 1) {
    const difference = a[index] - b[index];
    squared += difference * difference;
  }

  return Math.sqrt(squared);
}

// ---------------------------------------------------------------------------
// Versions of the three artifacts, stored with every prediction.
// ---------------------------------------------------------------------------
function modelVersions() {
  return {
    skill: loadSkill().version,
    animal: loadAnimal().version,
    difficulty: loadDifficulty().version,
  };
}

module.exports = {
  predictSteps,
  predictSkill,
  matchAnimal,
  modelVersions,
  // Helpers used by matchAnimal itself and by the tests.
  difficultyRaw,
  percentileForScore,
  animalForPercentile,
  iqForPercentile,
  resetCache,
};
