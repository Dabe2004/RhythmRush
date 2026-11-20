# Rhythm Rush frontend

React + Vite (JavaScript, Tailwind CSS v4, Recharts). Pages: the public
leaderboard (Phase J1), the live result / kiosk screen (Phase J2), and the
session detail and admin pages (Phase K).

## How to run

**Exhibition / production:** build once, then the backend serves the website
itself on port 3000 (no Vite, one process). From the project folder:

```powershell
npm run build     # writes frontend/dist
npm start         # API + website on http://localhost:3000
```

Express serves `frontend/dist` with an SPA fallback (every non-`/api` page
URL returns `index.html`; `/assets/*` files are cached for a year because
their names contain a hash). Rebuild after every frontend change.

**Development** (hot reload) uses two terminals:

```powershell
# terminal 1 - backend
cd backend
npm start

# terminal 2 - frontend
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite listens on all interfaces
(`server.host: true`), so a phone or tablet on the same Wi-Fi can open the
`Network` address printed by Vite, for example `http://192.168.1.5:5173`.

The dev server proxies `/api` to `http://localhost:3000`, so the browser only
talks to port 5173 and there are no CORS problems. `VITE_API_URL` is empty by
default; it only needs a value when the API lives on another machine. Copy
`frontend/.env.example` to `frontend/.env` to change it.

Production build, lint and unit tests:

```powershell
cd frontend
npm run build
npm run lint
npm test
npm run preview
```

`frontend/dist` and `frontend/node_modules` are gitignored; the rest of the
folder is part of the project.

## Pages

| Route | Page | Status |
|---|---|---|
| `/` | Leaderboard | built (J1) |
| `/result` | Live result screen, kiosk mode | built (J2) |
| `/result/:sessionId` | Result of one specific game | built (J2) |
| `/session/:id` | Session detail with chart | built (K) |
| `/admin` | Admin dashboard (password) | built (K) |
| anything else | "Page not found" with a link back | built |

The header shows **Leaderboard** (`/`) and **Live screen** (`/result`); the
link of the current page is highlighted. The admin page is never linked.

### Leaderboard

- Polls `GET /api/leaderboard?limit=20` every 10 seconds (`usePolling`).
- Table on screens `md` and wider, cards on narrow phones.
- Rank 1/2/3 get gold/silver/bronze circles; tied entries share the same
  number and colour.
- Shows nickname (or muted "Anonymous"), score with thousands separators,
  "Level N", the skill badge, and the animal with emoji and IQ.
- Games without an ML prediction show "-" in the skill/animal columns.
- A failed refresh keeps the old rows and adds a red banner with Retry.
- First load shows skeleton rows; an empty database shows
  "No games yet. Press Start on the device!".
- All values are rendered as React text, so nicknames cannot inject HTML.
- Footer: "Animal IQ is just for fun, not a real IQ test."

### Live result screen (Phase J2)

The ESP32 cannot open a web page, so the kiosk screen finds new games by
itself: `/result` polls `GET /api/game-sessions/latest` every 2 seconds.

- **Baseline.** The first answer only remembers the newest game that already
  exists, so an old game is never shown when the page opens. An empty
  database at page open also counts as a baseline, so the first game of the
  day **is** shown.
- **New game.** A different id is shown for 30 seconds, then the screen goes
  back to the idle screen by itself. A newer game replaces the one on screen
  and restarts the 30 seconds. A game older than the baseline (the newest
  game was deleted on the admin page) is never shown.
- **Countdown.** A bar, "Back to the leaderboard in Ns" and a **Close**
  button, placed at the top so they stay visible on a TV without scrolling.
  The countdown does not run while the browser tab is hidden.
- **Result content.** "Game Over" or "You Win!", the score with thousands
  separators, "Level N reached" (the level of the last attempt), the skill
  badge, "Rank #N" from the top 100 ("Outside the top 100" otherwise, hidden
  if that request fails), and "You played like a(n) <emoji> <Animal>, IQ
  <n>!" with "Just for fun, not a real IQ test.". A game without a prediction
  shows "Fun result not available for this game".
- **Nickname.** Only when the game has no nickname: input (max 16), **Save**
  and **Skip**. Checked in the browser first (same rule as the API), one
  request at a time. Focusing or typing pauses the countdown; leaving the
  input, saving, or 15 seconds without a key press resumes it (without
  resetting it). Skip closes the result. Errors: 409 "This game already has a
  nickname.", 400 "That nickname isn't allowed. Use letters, numbers, spaces,
  - or _.", 429 "Too many tries. Wait a minute.", anything else "Could not
  save. Try again.". Success shows "Saved! You are <nickname>".
- **Idle screen.** "Waiting for the next player...", six pulsing dots in the
  arcade colours, and a compact top 5 (refreshed every 10 seconds).
- **`/result/:sessionId`** shows the same result block for one game, with no
  countdown and no automatic return; an unknown id shows "Game not found".

All kiosk rules live in the pure reducer `src/kioskState.js` and are unit
tested in `src/kioskState.test.js`; the page only sends events to it.

### Session detail (Phase K)

`/session/:id`, opened by clicking a leaderboard row (the name is a real link
for keyboard users) or a game id on the admin page.

- Header: outcome, nickname (or "Anonymous player"), game id, device, local
  time, and the score.
- Facts: level reached, levels cleared, successful rounds, failed attempts,
  duration, success rate, average time per press, real or simulated.
- Skill badge and the animal block ("Just for fun, not a real IQ test.";
  "Fun result not available for this game" without a prediction).
- **Chart:** response time per attempt (Recharts bars). Pass, wrong and
  timeout have different colours **and** text labels in the legend, tooltip
  and table. A timeout has no response time, so it is drawn **hollow at the
  full time limit** of that level (`presses x seconds per press`) with a
  "Timeout" label, never as a zero-height bar. Hover a bar for the details.
- **Attempts table** (the chart's table view): attempt no., level, sequence
  length (= level + 2), result, response time ("no answer (limit N s)" for a
  timeout).
- Unknown id: friendly "Game not found" with a link back.

Chart colours: pass `#199e70`, wrong `#d95926`, timeout `#3987e5`. They were
checked with a palette validator on the app's dark surfaces (colour-blind
separation, normal-vision separation, >= 3:1 contrast). Classic green/red was
tested first and **failed** for red-green colour blindness (deutan
difference 4.1, minimum 6), so it was not used.

### Admin (Phase K)

`/admin` is **not linked** anywhere; type the URL. It talks to the admin API
(`docs/API.md`, "Admin API").

- **Login.** The password is checked with `POST /api/admin/login`, then kept
  **only in `sessionStorage`** (forgotten when the tab closes) and sent as
  `X-Admin-Password`. Log out, or any `401`, removes it and shows the login
  form again. Wrong password, too many tries (429) and "admin disabled" (503)
  each have their own message.
- **Overview** cards: total games, average score (+ best), win rate, real vs
  simulated games.
- **Charts:** games per 1,000-point score range, games per skill level, games
  per animal. One colour each (single series), values on hover / at the bar
  tip.
- **Devices:** id, name, Online/Offline badge (seen in the last 10 minutes),
  last seen ("5 min ago", exact time on hover), number of games.
- **Recent games** (newest 20): links to the session page, **Clear nickname**
  (only when there is one) and **Delete**, both behind a confirm dialog. One
  action at a time; errors are shown in a banner.
- **Remove simulated games:** deletes every `SIM01` game, enabled only after
  typing `SIM01` exactly. Real devices are never touched.
- **Models:** version, size and date of the three files in
  `backend/artifacts`, plus a short summary (tree nodes, reference games and
  animal tiers, difficulty formula).
- Everything refreshes every **15 seconds**; a failed refresh keeps the old
  data and shows a banner with Retry.

The session and admin pages are loaded with `React.lazy`, so Recharts (about
420 kB, 120 kB gzipped) is only downloaded when one of them is opened.

## Manual test checklist

Run the backend and frontend, then check:

- [ ] **Normal load.** Open `http://localhost:5173/`. Rows appear, and
      "Updated HH:MM:SS" advances at least once after 10 seconds.
- [ ] **Rank styling.** With at least three games, ranks 1-3 are gold,
      silver, and bronze. Two equal scores show the same rank number and the
      next rank skips (1, 2, 2, 4).
- [ ] **No prediction.** A game uploaded before Phase G (for example
      `RR01-000127`) still appears, with "-" for skill/animal/IQ.
- [ ] **Loading state.** In DevTools, set Network to "Slow 3G" and reload.
      Skeleton rows should pulse before the data appears.
- [ ] **Empty state.** Stop the frontend and backend, point the backend at an
      empty database (`DB_PATH=./data/test_frontend.db`, run migrate + seed),
      start both, and open the page. It must show
      "No games yet. Press Start on the device!".
- [ ] **Backend stopped.** Leave the page open with rows visible, stop the
      backend, and wait for the next 10-second poll. The rows must stay and a
      red "Could not refresh. Showing the last known scores." banner must
      appear with Retry. Start the backend again and click Retry; the banner
      disappears.
- [ ] **Narrow phone width.** In DevTools, switch to a 375 px-wide device.
      The table is replaced by one card per game; nothing overflows sideways.
- [ ] **Nickname escaping.** The nickname endpoint only accepts letters,
      numbers, spaces, dashes, and underscores, so `<` and `>` are rejected by
      the API by design. To prove the UI would render them safely, put one
      directly into a **test** database and reload:

      ```powershell
      cd backend
      node -e "const db=require('./src/db'); db.prepare('UPDATE game_sessions SET nickname=? WHERE session_id=?').run('<b>Boss</b>','RR01-000999')"
      ```

      The page must show the literal text `<b>Boss</b>`, not a bold "Boss".
      Restore the nickname afterwards (set it back to NULL).
- [ ] **Unknown route.** Open `http://localhost:5173/nope`. The "Page not
      found" screen appears and the link returns to the leaderboard.
- [ ] **Phone on Wi-Fi.** Open the printed `Network` URL from a phone. The
      page loads and the API calls still work through the proxy.

## Result page checklist

Use a **test** database so the real one stays clean. From `/backend`, in
PowerShell:

```powershell
$env:DB_PATH = "./data/result_check.db"
node ../db/migrate.js
node ../db/seed.js
node src/server.js          # keep this terminal open
```

In a second terminal start the frontend (`cd frontend`, `npm run dev`) and
open `http://localhost:5173/result`. In a third terminal, from `/backend`,
upload one game with `node ../tools/fake_esp32.js --count 1 --seed 1`
(another `--seed` gives another game).

- [ ] **Empty database.** The idle screen shows "Waiting for the next
      player...", six pulsing dots and "Be the first on the leaderboard!".
- [ ] **First game of the day.** Upload one game. Within 2 seconds the result
      appears (proves the empty-database baseline).
- [ ] **Old games stay hidden.** Reload the page while games exist. The idle
      screen shows; the newest existing game is NOT shown.
- [ ] **Readable from 2 m.** Stand back: headline, score, level, rank, skill
      and animal are all readable.
- [ ] **Countdown.** The bar shrinks and "Back to the leaderboard in Ns"
      counts down to the idle screen after 30 seconds.
- [ ] **Pause while typing.** Click the nickname box and type. "(paused while
      you type)" appears and the number stops. Click elsewhere: it continues
      from the same number.
- [ ] **Validation.** Type `<script>` and press Save: "Use only letters,
      numbers, spaces, - or _." and nothing is sent (DevTools Network tab).
- [ ] **Save.** Type `Ana_Maria-2` and Save: "Saved! You are Ana_Maria-2";
      the name appears on the leaderboard and in the top 5.
- [ ] **Double click.** Double-click Save quickly on a new game: the Network
      tab shows exactly one PATCH.
- [ ] **409.** Open `/result/<id>` of a game without a nickname in two tabs,
      save in the first, then in the second: "This game already has a
      nickname."
- [ ] **Skip / Close.** Both return to the idle screen at once, and that game
      does not come back on the next poll.
- [ ] **Newer game wins.** Upload a game while a result is on screen: the new
      result replaces it and the countdown restarts at 30.
- [ ] **Hidden tab.** Switch to another tab for 10 seconds while a result is
      shown; when you come back the countdown has not moved.
- [ ] **Server down.** Stop the backend: the idle screen shows "Cannot reach
      the server. Retrying...". Start it again: the message disappears.
- [ ] **One game page.** `/result/<id>` has no countdown, no automatic
      return, and a "Back to the leaderboard" link. `/result/NOPE` shows "Game
      not found".
- [ ] **Header.** "Live screen" is highlighted on `/result` and
      `/result/<id>`, "Leaderboard" on `/`. There is no admin link.
- [ ] **Phone width.** At 390 px wide nothing scrolls sideways.

Delete the test database afterwards (`backend/data/result_check.db*`).

## Session and admin checklist

Same test database as above. Start the backend with a known admin password
for the test, e.g. `$env:ADMIN_PASSWORD = "test-admin-1"` before
`node src/server.js`, and upload some games with the fake ESP32.

- [ ] **Row click.** On `/`, click a row (not the name): the session page
      opens. Tab to a name and press Enter: same page.
- [ ] **Chart.** Bars for every attempt; pass, wrong and timeout differ in
      colour and the legend names them. A timeout is a hollow full-height bar
      labelled "Timeout". Hovering a bar shows attempt, level, result, time
      and the time limit.
- [ ] **Table.** One row per attempt; sequence length = level + 2; a timeout
      says "no answer (limit N s)".
- [ ] **No prediction.** A game without a prediction shows "Not available"
      for the skill and "Fun result not available for this game".
- [ ] **404.** `/session/NOPE` shows "Game not found".
- [ ] **No admin link.** The header shows only Leaderboard and Live screen.
- [ ] **Login.** `/admin` with a wrong password: "Wrong password.". With the
      right one: the dashboard. DevTools > Application: the password is in
      Session Storage, nothing in Local Storage or cookies.
- [ ] **Lockout.** Enter a wrong password 10 times: the next try says "Too many
      wrong passwords...". (Restart the server to reset it.)
- [ ] **Auto refresh.** Upload a game; within 15 seconds it appears in Recent
      games and the counts change. Stop the backend: the old data stays and a
      red banner appears.
- [ ] **Clear nickname / Delete.** Cancel the confirm dialog: nothing
      changes. Accept: the success banner appears and the list updates.
- [ ] **Remove simulated games.** The button stays disabled until `SIM01` is
      typed exactly. Afterwards SIM01 shows 0 games and RR01 games remain.
- [ ] **Logout / 401.** Log out: back to the login form, Session Storage is
      empty. Log in, then restart the backend with another ADMIN_PASSWORD:
      within 15 seconds the page returns to the login form with a notice.
- [ ] **Phone width.** Tables scroll sideways inside their box; the page
      itself never does.

## Files

| File | Purpose |
|---|---|
| `src/api.js` | fetch wrapper, 8 s timeout, `.status` on errors |
| `src/usePolling.js` | polling hook (hidden-tab pause, no overlap, keeps old data) |
| `src/theme.js` | six arcade colours, skill styles, animal emoji |
| `src/components/SkillBadge.jsx` | skill pill, "-" when missing |
| `src/components/AnimalTag.jsx` | animal emoji + name + IQ |
| `src/components/StatusMessage.jsx` | loading / error / empty states |
| `src/pages/Leaderboard.jsx` | leaderboard page |
| `src/pages/Result.jsx` | live result screen (kiosk) and one-game result |
| `src/kioskState.js` | pure kiosk reducer: baseline, countdown, pause, dismiss |
| `src/nickname.js` | nickname rule (same as the API) and error messages |
| `src/format.js` | score / level / rank / article helpers |
| `src/useSession.js` | loads one game, optional retry, `notFound` flag |
| `src/components/ResultCard.jsx` | the big result block, shared by both result modes |
| `src/components/NicknameForm.jsx` | nickname form, validation, no double submit |
| `src/pages/SessionDetail.jsx` | one game: facts, ML results, chart, attempts table (lazy) |
| `src/pages/Admin.jsx` | admin login and dashboard (lazy) |
| `src/components/Charts.jsx` | Recharts charts: attempts, score histogram, count bars |
| `src/chartData.js` | game-rule mirror (deadline), result colours, chart-row mapping |
| `src/adminAuth.js` | admin password in sessionStorage; admin error messages |
| `src/*.test.js` | vitest unit tests for the pure helpers (`npm test`) |
| `src/App.jsx` | header, routes, footer |
| `src/main.jsx` | BrowserRouter + React root |
