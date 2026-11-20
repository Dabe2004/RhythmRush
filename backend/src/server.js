// backend/src/server.js
// Starts the HTTP server. Run from /backend with: npm start
//
// One process serves BOTH the API (/api/...) and the website (the React
// build in frontend/dist, made with "npm run build" in /frontend), so the
// exhibition laptop only needs this one command.

const os = require("os");
const path = require("path");

// Load backend/.env regardless of the current working directory.
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const { createApp } = require("./app");
const { adminConfigProblem } = require("./services/auth");

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIST = path.join(__dirname, "..", "..", "frontend", "dist");

const app = createApp({ staticDir: FRONTEND_DIST });

// Tell the operator about the admin password WITHOUT printing it.
const adminProblem = adminConfigProblem(process.env.ADMIN_PASSWORD, process.env.NODE_ENV);
if (adminProblem) {
  console.warn(`Admin API is OFF (${adminProblem}). Set ADMIN_PASSWORD in backend/.env.`);
} else if (process.env.ADMIN_PASSWORD === "change-me") {
  console.warn('Admin password is still the example "change-me". Change it before the exhibition.');
}

// IPv4 addresses of this computer, e.g. 192.168.1.5. The ESP32, the kiosk
// screen and phones use one of these instead of "localhost".
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
}

app.listen(PORT, () => {
  console.log(`Rhythm Rush backend listening on http://localhost:${PORT}`);

  for (const address of lanAddresses()) {
    console.log(`  on this network: http://${address}:${PORT}`);
  }

  if (require("fs").existsSync(path.join(FRONTEND_DIST, "index.html"))) {
    console.log("  website: served from frontend/dist (/, /result, /admin)");
  } else {
    console.log("  website: NOT built - only the API is served. Run: npm run build (in /frontend)");
  }
});
