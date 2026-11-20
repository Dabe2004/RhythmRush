// backend/tests/ml.test.js
// Checks that the JavaScript models reproduce the Python exports exactly.
//
// The expected values come from backend/tests/fixtures/ml_vectors.json,
// written by `python ml/export_test_vectors.py` (seed 42). That script
// reuses the plain-Python walkers from ml/check_exports.py.
//
// Vitest cannot be require()d from CommonJS, so this file is ESM and loads
// the CJS backend through Node's own require.

import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

// Point the ML service at the real exported artifacts. This must happen
// before the artifacts are first loaded (loading is lazy).
process.env.ARTIFACTS_DIR = fileURLToPath(new URL("../artifacts", import.meta.url));

const Database = require("better-sqlite3");
const ml = require("../src/services/ml.js");
const animalJson = require("../artifacts/animal.json");
const vectors = require("./fixtures/ml_vectors.json");

const TOLERANCE = 1e-9;

// IQ ranges from AGENTS.md, used to check the computed IQ.
const IQ_RANGES = {
  Chimpanzee: [90, 100],
  "Bottlenose Dolphin": [80, 90],
  Elephant: [70, 80],
  Orangutan: [60, 70],
  Pig: [50, 60],
};

// ---------------------------------------------------------------------------
// A throwaway database with an empty session_features table, so matchAnimal
// only sees the reference rows unless a test inserts something.
// ---------------------------------------------------------------------------
let db;

beforeAll(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE session_features (
      session_id              TEXT PRIMARY KEY,
      avg_reaction_sec        REAL,
      success_rate            REAL,
      highest_sequence_length INTEGER,
      final_score             INTEGER
    );
  `);
});

function insertSessionFeatures(sessionId, features) {
  db.prepare(`
    INSERT INTO session_features
      (session_id, avg_reaction_sec, success_rate, highest_sequence_length, final_score)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    sessionId,
    features.avg_reaction_sec,
    features.success_rate,
    features.highest_sequence_length,
    features.final_score
  );
}

// Object form used by the service.
function asInput(features) {
  return {
    final_score: features[0],
    avg_reaction_sec: features[1],
    highest_sequence_length: features[2],
    success_rate: features[3],
  };
}

// The fixture stores the Python name (reaction_ratio); the service takes
// reactionRatio, as specified for predictSteps({accuracy, reactionRatio, level}).
function asDifficultyInput(input) {
  return {
    accuracy: input.accuracy,
    reactionRatio: input.reaction_ratio,
    level: input.level,
  };
}

// ---------------------------------------------------------------------------
// Model 1: Adaptive Difficulty
// ---------------------------------------------------------------------------
describe("predictSteps", () => {
  it("has 40 exported cases", () => {
    expect(vectors.difficulty).toHaveLength(40);
  });

  it("matches every Python raw value and rounded step", () => {
    for (const testCase of vectors.difficulty) {
      const input = asDifficultyInput(testCase.input);
      const raw = ml.difficultyRaw(input);
      const steps = ml.predictSteps(input);

      // Raw honours the linear formula exactly.
      expect(Math.abs(raw - testCase.expected_raw)).toBeLessThanOrEqual(TOLERANCE);
      // Steps use floor(raw + 0.5) and the 0..2 clamp.
      expect(steps).toBe(testCase.expected_steps);
    }
  });

  it("includes rounding edge cases around .5 and clamped cases", () => {
    const half = vectors.difficulty.filter(
      (c) => Math.abs(c.expected_raw - 0.5) < 1e-5 || Math.abs(c.expected_raw - 1.5) < 1e-5
    );
    const outside = vectors.difficulty.filter(
      (c) => c.expected_raw < 0 || c.expected_raw > 2
    );

    // 6 cases sit on or beside .5 / 1.5, where rounding can flip.
    expect(half.length).toBeGreaterThanOrEqual(6);
    // Cases below 0 or above 2 prove the clamp works.
    expect(outside.length).toBeGreaterThanOrEqual(4);

    for (const c of outside) {
      expect([0, 1, 2]).toContain(c.expected_steps);
    }
  });
});

// ---------------------------------------------------------------------------
// Model 2: Skill Classifier
// ---------------------------------------------------------------------------
describe("predictSkill", () => {
  it("has 40 exported cases", () => {
    expect(vectors.skill).toHaveLength(40);
  });

  it("matches every Python label", () => {
    for (const testCase of vectors.skill) {
      expect(ml.predictSkill(testCase.input)).toBe(testCase.expected);
    }
  });

  it("returns only the three allowed labels", () => {
    const labels = new Set(vectors.skill.map((c) => ml.predictSkill(c.input)));

    for (const label of labels) {
      expect(["Beginner", "Intermediate", "Pro"]).toContain(label);
    }
  });
});

// ---------------------------------------------------------------------------
// Model 3: Animal IQ Matcher
// ---------------------------------------------------------------------------
describe("matchAnimal", () => {
  it("has 25 exported cases", () => {
    expect(vectors.animal).toHaveLength(25);
  });

  it("matches the Python nearest row, distance, percentile and animal", () => {
    const referenceIds = new Set(animalJson.rows.map((row) => row.id));

    for (const testCase of vectors.animal) {
      const result = ml.matchAnimal(db, asInput(testCase.features), null);
      const expected = testCase.expected;

      expect(result.distance).toBeCloseTo(expected.distance, 9);
      expect(result.percentile).toBeCloseTo(expected.percentile, 9);
      expect(result.animal).toBe(expected.animal);

      if (result.matchedSessionId !== expected.id) {
        // Only allowed for an exact tie between two reference rows.
        expect(referenceIds.has(result.matchedSessionId)).toBe(true);
        expect(result.percentile).toBeCloseTo(expected.percentile, 9);
      }
    }
  });

  it("reproduces every stored score_percentile from final_score", () => {
    // percentileForScore is the JS twin of pandas rank(pct=True, "average").
    let worst = 0;

    for (const row of animalJson.rows) {
      const computed = ml.percentileForScore(row.features[0]);
      worst = Math.max(worst, Math.abs(computed - row.score_percentile));

      expect(Number.isFinite(computed)).toBe(true);
    }

    expect(worst).toBeLessThanOrEqual(TOLERANCE);
  });

  it("never returns the excluded session", () => {
    const query = vectors.animal[0].features;
    insertSessionFeatures("TEST-EXCLUDE", asInput(query));

    try {
      const excluded = ml.matchAnimal(db, asInput(query), "TEST-EXCLUDE");
      expect(excluded.matchedSessionId).not.toBe("TEST-EXCLUDE");
    } finally {
      db.prepare("DELETE FROM session_features WHERE session_id = ?").run(
        "TEST-EXCLUDE"
      );
    }
  });

  it("returns an exact database copy as the nearest row (distance 0)", () => {
    const query = vectors.animal[1].features;
    insertSessionFeatures("TEST-COPY", asInput(query));

    try {
      // With no exclusion the identical database row is the nearest.
      const result = ml.matchAnimal(db, asInput(query), "TEST-OTHER");

      expect(result.matchedSessionId).toBe("TEST-COPY");
      expect(result.distance).toBeCloseTo(0, 12);
      expect(result.percentile).toBeCloseTo(
        ml.percentileForScore(query[0]),
        12
      );
    } finally {
      db.prepare("DELETE FROM session_features WHERE session_id = ?").run("TEST-COPY");
    }
  });

  it("keeps every IQ inside its animal range", () => {
    for (let step = 0; step <= 100; step += 1) {
      const percentile = step / 100;
      const animal = ml.animalForPercentile(percentile);
      const iq = ml.iqForPercentile(percentile);
      const [low, high] = IQ_RANGES[animal];

      expect(iq).toBeGreaterThanOrEqual(low);
      expect(iq).toBeLessThanOrEqual(high);
    }
  });

  it("maps the tier boundaries from animal.json correctly", () => {
    // animal.json tiers (best first):
    //   Chimpanzee >= 0.90, Bottlenose Dolphin >= 0.75, Elephant >= 0.55,
    //   Orangutan >= 0.30, Pig >= 0.00
    // The first tier whose percentile_min is <= the percentile wins.
    const cases = [
      { percentile: 0.0, animal: "Pig" },        // exactly the Pig floor
      { percentile: 0.1, animal: "Pig" },        // 0.1 < 0.30
      { percentile: 0.25, animal: "Pig" },       // still below 0.30
      { percentile: 0.45, animal: "Orangutan" }, // 0.30 <= p < 0.55
      { percentile: 0.7, animal: "Elephant" },   // 0.55 <= p < 0.75
      { percentile: 0.9, animal: "Chimpanzee" }, // 0.90 <= p
      { percentile: 1.0, animal: "Chimpanzee" }, // top of the top tier
    ];

    for (const c of cases) {
      expect(ml.animalForPercentile(c.percentile)).toBe(c.animal);

      const iq = ml.iqForPercentile(c.percentile);
      const [low, high] = IQ_RANGES[c.animal];
      expect(iq).toBeGreaterThanOrEqual(low);
      expect(iq).toBeLessThanOrEqual(high);
    }

    // IQ rises with the percentile inside a tier.
    expect(ml.iqForPercentile(0.9)).toBe(90);
    expect(ml.iqForPercentile(1.0)).toBe(100);
    expect(ml.iqForPercentile(0.0)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Versions and failure behaviour
// ---------------------------------------------------------------------------
describe("modelVersions", () => {
  it("returns the version of each artifact", () => {
    expect(ml.modelVersions()).toEqual({ skill: 1, animal: 1, difficulty: 1 });
  });
});

describe("missing artifacts", () => {
  it("throws a clear error instead of guessing", () => {
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");

    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-missing-artifacts-"));
    const previousDir = process.env.ARTIFACTS_DIR;

    try {
      process.env.ARTIFACTS_DIR = emptyDir;
      ml.resetCache();

      expect(() => ml.predictSkill(vectors.skill[0].input)).toThrow(
        /Cannot read ML artifact/
      );
      expect(() => ml.predictSteps(asDifficultyInput(vectors.difficulty[0].input))).toThrow(
        /Cannot read ML artifact/
      );
      expect(() =>
        ml.matchAnimal(db, asInput(vectors.animal[0].features), null)
      ).toThrow(/Cannot read ML artifact/);
    } finally {
      process.env.ARTIFACTS_DIR = previousDir;
      ml.resetCache();
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
