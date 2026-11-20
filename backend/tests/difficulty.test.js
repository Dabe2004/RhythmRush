// backend/tests/difficulty.test.js
// Tests for POST /api/difficulty/next

import { describe, it, expect, beforeAll, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const TEST_DEVICE_ID = "RR01";
const TEST_API_KEY = "test-rr01-key-0001";

process.env.DB_PATH = ":memory:";
process.env.DEVICE_API_KEY = TEST_API_KEY;

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");

const db = require("../src/db.js");
const app = require("../src/app.js");
const ml = require("../src/services/ml.js");
const { runMigrations } = require("../../db/migrate.js");

function postNext(body, apiKey = TEST_API_KEY) {
  const req = request(app).post("/api/difficulty/next").send(body);
  if (apiKey !== null) req.set("X-API-Key", apiKey);
  return req;
}

const VALID_BODY = {
  accuracy: 0.8,
  reactionRatio: 0.6,
  level: 5,
  currentLength: 7,
};

beforeAll(() => {
  runMigrations(db);

  const hash = crypto.createHash("sha256").update(TEST_API_KEY).digest("hex");
  db.prepare(
    "INSERT INTO devices (device_id, name, api_key_hash) VALUES (?, ?, ?)"
  ).run(TEST_DEVICE_ID, "Test device", hash);
});

describe("POST /api/difficulty/next", () => {
  it("returns steps and the next sequence length", async () => {
    const res = await postNext(VALID_BODY);

    expect(res.status).toBe(200);
    expect([0, 1, 2]).toContain(res.body.steps);
    expect(res.body.nextLength).toBeGreaterThanOrEqual(VALID_BODY.currentLength);
    expect(res.body.nextLength).toBeLessThanOrEqual(17);
    expect(res.body.nextLength).toBe(VALID_BODY.currentLength + res.body.steps);
    expect(res.body.model_version).toBe(1);
    expect(res.body.fallback).toBeUndefined();
  });

  it("never goes above 17 steps", async () => {
    const res = await postNext({ ...VALID_BODY, currentLength: 17 });

    expect(res.status).toBe(200);
    expect(res.body.nextLength).toBe(17);
  });

  it("matches the exported difficulty model", async () => {
    // calculate the expected value with the same code the route uses
    const expectedSteps = ml.predictSteps({
      accuracy: VALID_BODY.accuracy,
      reactionRatio: VALID_BODY.reactionRatio,
      level: VALID_BODY.level,
    });

    const res = await postNext(VALID_BODY);

    expect(res.body.steps).toBe(expectedSteps);
    expect(res.body.nextLength).toBe(
      Math.min(17, VALID_BODY.currentLength + expectedSteps)
    );
  });

  it("rejects accuracy above 1", async () => {
    const res = await postNext({ ...VALID_BODY, accuracy: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
  });

  it("rejects level 0", async () => {
    const res = await postNext({ ...VALID_BODY, level: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
  });

  it("rejects currentLength below 3", async () => {
    const res = await postNext({ ...VALID_BODY, currentLength: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
  });

  it("rejects a negative reactionRatio", async () => {
    const res = await postNext({ ...VALID_BODY, reactionRatio: -0.1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
  });

  it("rejects a missing field", async () => {
    const body = { ...VALID_BODY };
    delete body.currentLength;

    const res = await postNext(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_body");
  });

  it("rejects a missing API key with 401", async () => {
    const res = await postNext(VALID_BODY, null);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("rejects a wrong API key with 401", async () => {
    const res = await postNext(VALID_BODY, "not-the-key");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "unauthorized" });
  });

  it("falls back to +1 step when the artifacts are missing", async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-difficulty-"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const previousDir = process.env.ARTIFACTS_DIR;

    try {
      process.env.ARTIFACTS_DIR = emptyDir;
      ml.resetCache();

      const res = await postNext({ ...VALID_BODY, currentLength: 10 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        steps: 1,
        nextLength: 11,
        fallback: true,
      });
      expect(consoleError).toHaveBeenCalled();
    } finally {
      if (previousDir === undefined) delete process.env.ARTIFACTS_DIR;
      else process.env.ARTIFACTS_DIR = previousDir;

      ml.resetCache();
      consoleError.mockRestore();
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("falls back to 17 when the fallback reaches the top", async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-difficulty-"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const previousDir = process.env.ARTIFACTS_DIR;

    try {
      process.env.ARTIFACTS_DIR = emptyDir;
      ml.resetCache();

      const res = await postNext({ ...VALID_BODY, currentLength: 17 });

      expect(res.body).toEqual({ steps: 1, nextLength: 17, fallback: true });
    } finally {
      if (previousDir === undefined) delete process.env.ARTIFACTS_DIR;
      else process.env.ARTIFACTS_DIR = previousDir;

      ml.resetCache();
      consoleError.mockRestore();
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
