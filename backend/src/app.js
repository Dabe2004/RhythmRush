// backend/src/app.js
// Builds the Express app. It does NOT call listen - server.js does that, and
// the tests import this file directly with supertest.
//
// Ordinary errors never leak database details or stack traces to clients.
//
// createApp(options) exists so tests can change options (for example a lower
// rate limit, or a folder with a built frontend). The default export is the
// app with defaults and WITHOUT the website (API only).

const fs = require("fs");
const path = require("path");

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");

const gameSessionsRouter = require("./routes/gameSessions");
const createSessionsRouter = require("./routes/sessions");
const leaderboardRouter = require("./routes/leaderboard");
const difficultyRouter = require("./routes/difficulty");
const statsRouter = require("./routes/stats");
const createLiveRouter = require("./routes/live");

// Origins of the Vite dev server (npm run dev) and preview (npm run preview).
// Used when ALLOWED_ORIGINS is empty. The website served by Express itself is
// always allowed because it is the same origin.
const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

// "http://a:1, http://b:2/" -> ["http://a:1", "http://b:2"]; empty -> null.
function parseAllowedOrigins(text) {
  if (typeof text !== "string") return null;

  const list = text
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  return list.length > 0 ? list : null;
}

function isApiPath(urlPath) {
  return urlPath === "/api" || urlPath.startsWith("/api/");
}

// CORS: only the listed origins and the same origin get CORS headers.
// Requests without an Origin header (the ESP32, curl) are not affected.
// A browser on another origin can still SEND a simple GET, but it cannot read
// the answer, and it cannot send JSON/PATCH/DELETE or custom headers at all
// (the preflight gets no permission).
function corsOptionsFor(allowedOrigins) {
  return (req, callback) => {
    const origin = req.get("Origin");
    const host = req.get("Host");
    const sameOrigin =
      Boolean(origin) && Boolean(host) &&
      (origin === `http://${host}` || origin === `https://${host}`);

    callback(null, { origin: Boolean(origin) && (sameOrigin || allowedOrigins.includes(origin)) });
  };
}

// Serve the built React app (frontend/dist) when it exists:
//   /assets/*  hashed files, cached for a year
//   /, /live, /result, /session/:id ...  -> index.html (the React router
//   decides what to show). /api/* and missing files stay JSON 404s.
// Returns false when there is nothing to serve.
function serveFrontend(app, staticDir) {
  if (!staticDir) return false;

  const indexFile = path.join(staticDir, "index.html");
  if (!fs.existsSync(indexFile)) return false;

  app.use(
    express.static(staticDir, {
      index: false,
      setHeaders(res, filePath) {
        const inAssets = filePath.includes(`${path.sep}assets${path.sep}`);
        res.set("Cache-Control", inAssets ? "public, max-age=31536000, immutable" : "no-cache");
      },
    })
  );

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (isApiPath(req.path)) return next();
    // "/assets/missing.js" is a missing file, not a page.
    if (path.extname(req.path) !== "") return next();

    res.set("Cache-Control", "no-cache");
    return res.sendFile(indexFile);
  });

  return true;
}

/**
 * Build a fresh Express app.
 *
 * @param {object} [options]
 * @param {{windowMs?: number, limit?: number}} [options.nicknameRateLimit]
 * @param {object} [options.live]  live mirror options (routes/live.js): now,
 *        abandonMs, maxClients, heartbeatMs, rateLimit
 * @param {string} [options.staticDir]      built frontend to serve (server.js
 *        passes frontend/dist); none = API only
 * @param {string[]} [options.allowedOrigins] default: ALLOWED_ORIGINS from the
 *        environment, or the Vite dev origins when that is empty
 * @returns {import("express").Express}
 */
function createApp(options = {}) {
  const app = express();

  const allowedOrigins =
    options.allowedOrigins ?? parseAllowedOrigins(process.env.ALLOWED_ORIGINS) ?? DEV_ORIGINS;

  // Security headers. Helmet's defaults stay on (CSP, nosniff, frame
  // options, no X-Powered-By, ...). ONE directive is removed:
  // "upgrade-insecure-requests" tells the browser to load every file over
  // https, which breaks the exhibition setup (plain http://<laptop-ip>:3000
  // on the classroom Wi-Fi has no certificate).
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { upgradeInsecureRequests: null },
      },
    })
  );
  app.use(cors(corsOptionsFor(allowedOrigins)));

  // Live mirror: before the JSON parser, because it has its own 8 kb limit.
  const liveRouter = createLiveRouter(options.live);
  app.locals.live = liveRouter;
  app.use("/api/live", liveRouter);

  // JSON bodies only, capped at 100kb. A game session is a few hundred bytes.
  app.use(express.json({ limit: "100kb" }));

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------
  app.get("/api/health", (req, res) => {
    res.status(200).json({ ok: true });
  });

  // POST lives in gameSessions.js, GET/PATCH in sessions.js.
  // Both routers are mounted on the same path and only handle their methods.
  app.use("/api/game-sessions", gameSessionsRouter);
  app.use("/api/game-sessions", createSessionsRouter(options));

  app.use("/api/leaderboard", leaderboardRouter);
  app.use("/api/difficulty", difficultyRouter);
  app.use("/api/stats", statsRouter);

  // The website (production build), after the API so /api always wins.
  serveFrontend(app, options.staticDir);

  // Unknown route.
  app.use((req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  // -------------------------------------------------------------------------
  // JSON error handler (must be last, it takes 4 arguments)
  // -------------------------------------------------------------------------
  app.use((err, req, res, next) => {
    // Body parser errors: broken JSON or a body over the size limit.
    if (err.type === "entity.parse.failed" || (err instanceof SyntaxError && err.status === 400)) {
      return res.status(400).json({ error: "invalid_json" });
    }

    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "payload_too_large" });
    }

    // Other client errors (for example a malformed %-encoded URL): a short
    // code, never the error text or stack.
    const status = err.status || err.statusCode;
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      return res.status(status).json({ error: status === 404 ? "not_found" : "bad_request" });
    }

    // Anything unexpected: log on the server, return a generic message.
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "server_error" });
  });

  return app;
}

const app = createApp();

module.exports = app;
module.exports.createApp = createApp;
module.exports.parseAllowedOrigins = parseAllowedOrigins;
module.exports.DEV_ORIGINS = DEV_ORIGINS;
