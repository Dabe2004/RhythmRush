// backend/tests/security.test.js
// Phase L: production serving of the built frontend, CORS, security headers,
// and error bodies. New file; the older test files are not changed.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

process.env.DB_PATH = ":memory:";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const request = require("supertest");

const db = require("../src/db.js");
const { createApp } = require("../src/app.js");
const { runMigrations } = require("../../db/migrate.js");

// A fake "frontend/dist" folder: index.html + one hashed asset.
let distDir;

beforeAll(() => {
  runMigrations(db);

  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "rr-dist-"));
  fs.mkdirSync(path.join(distDir, "assets"));
  fs.writeFileSync(
    path.join(distDir, "index.html"),
    '<!doctype html><html><body><div id="root"></div></body></html>'
  );
  fs.writeFileSync(path.join(distDir, "assets", "index-abc123.js"), "console.log('app')");
  fs.writeFileSync(path.join(distDir, "favicon.svg"), "<svg></svg>");
});

afterAll(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Serving the built frontend
// ---------------------------------------------------------------------------
describe("serving frontend/dist", () => {
  it("serves index.html for / and for client-side routes", async () => {
    const app = createApp({ staticDir: distDir });

    for (const url of ["/", "/result", "/result/RR01-000127", "/session/RR01-000127", "/live"]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(200);
      expect(res.headers["content-type"]).toMatch(/text\/html/);
      expect(res.text).toContain('<div id="root"></div>');
      expect(res.headers["cache-control"]).toBe("no-cache");
    }
  });

  it("serves hashed assets with a long cache", async () => {
    const app = createApp({ staticDir: distDir });
    const res = await request(app).get("/assets/index-abc123.js");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/javascript/);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("serves other files from the folder", async () => {
    const app = createApp({ staticDir: distDir });
    const res = await request(app).get("/favicon.svg");

    expect(res.status).toBe(200);
  });

  it("a missing file is a 404, not index.html", async () => {
    const app = createApp({ staticDir: distDir });
    const res = await request(app).get("/assets/missing-999.js");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("unknown /api routes stay JSON 404s", async () => {
    const app = createApp({ staticDir: distDir });

    for (const url of ["/api", "/api/nope", "/api/game-sessions/x/y/z"]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(404);
      expect(res.body).toEqual({ error: "not_found" });
    }
  });

  it("the API still works next to the website", async () => {
    const app = createApp({ staticDir: distDir });
    const res = await request(app).get("/api/health");

    expect(res.body).toEqual({ ok: true });
  });

  it("only GET/HEAD fall back to index.html", async () => {
    const app = createApp({ staticDir: distDir });
    const res = await request(app).post("/result").send({});

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("without a staticDir (or with a missing folder) only the API is served", async () => {
    for (const app of [createApp(), createApp({ staticDir: path.join(distDir, "nope") })]) {
      const res = await request(app).get("/");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "not_found" });
    }
  });
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
describe("CORS", () => {
  it("allows the Vite dev server origins by default", async () => {
    const app = createApp();

    for (const origin of ["http://localhost:5173", "http://127.0.0.1:5173"]) {
      const res = await request(app).get("/api/health").set("Origin", origin);
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
    }
  });

  it("gives no CORS header to an unknown origin", async () => {
    const app = createApp();
    const res = await request(app).get("/api/health").set("Origin", "http://evil.example");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows the same origin (the website served by Express itself)", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/health")
      .set("Host", "192.168.1.20:3000")
      .set("Origin", "http://192.168.1.20:3000");

    expect(res.headers["access-control-allow-origin"]).toBe("http://192.168.1.20:3000");
  });

  it("requests without Origin (ESP32, curl) work normally", async () => {
    const res = await request(createApp()).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("ALLOWED_ORIGINS replaces the default list", async () => {
    const app = createApp({ allowedOrigins: ["http://kiosk.local:8080"] });

    const allowed = await request(app).get("/api/health").set("Origin", "http://kiosk.local:8080");
    const dev = await request(app).get("/api/health").set("Origin", "http://localhost:5173");

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://kiosk.local:8080");
    expect(dev.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers an allowed preflight for the JSON nickname PATCH", async () => {
    const res = await request(createApp())
      .options("/api/game-sessions/RR01-000127/nickname")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "PATCH")
      .set("Access-Control-Request-Headers", "content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-headers"]).toMatch(/content-type/i);
  });

  it("parses a comma-separated ALLOWED_ORIGINS value", () => {
    const { parseAllowedOrigins } = require("../src/app.js");

    expect(parseAllowedOrigins(" http://a:1 , http://b:2/ ,, ")).toEqual(["http://a:1", "http://b:2"]);
    expect(parseAllowedOrigins("")).toBeNull();
    expect(parseAllowedOrigins(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Headers and error bodies
// ---------------------------------------------------------------------------
describe("security headers", () => {
  it("keeps helmet's defaults and hides Express", async () => {
    const res = await request(createApp({ staticDir: distDir })).get("/");

    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["content-security-policy"]).toMatch(/default-src 'self'/);
    expect(res.headers["content-security-policy"]).toMatch(/script-src 'self'/);
  });

  it("does not force https (the kiosk runs on plain http on the LAN)", async () => {
    const res = await request(createApp({ staticDir: distDir })).get("/");

    expect(res.headers["content-security-policy"]).not.toMatch(/upgrade-insecure-requests/);
  });
});

describe("error bodies", () => {
  it("a malformed %-encoded id is a short JSON 400, never a stack trace", async () => {
    const res = await request(createApp({ staticDir: distDir })).get("/api/game-sessions/%E0%A4%A");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "bad_request" });
    expect(res.text).not.toMatch(/at .*\.js/);
  });

  it("a malformed page URL just gets the app shell (no error text)", async () => {
    const res = await request(createApp({ staticDir: distDir })).get("/%E0%A4%A");

    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root"></div>');
  });

  it("a body over 100 kb is refused with 413", async () => {
    const res = await request(createApp())
      .post("/api/game-sessions")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ padding: "x".repeat(110 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "payload_too_large" });
  });
});
