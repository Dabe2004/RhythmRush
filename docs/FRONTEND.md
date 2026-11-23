# Rhythm Rush frontend

React + Vite (JavaScript, Tailwind CSS v4, Recharts). Pages: the public
leaderboard (Phase J1), the live result / kiosk screen (Phase J2), and the
session detail page (Phase K).

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
| `/` | Opens the live game (redirects to `/live`) | built |
| `/leaderboard` | Leaderboard (Top 10) | built (J1) |
| `/how-to-play` | "How to play" brochure (prints with a QR code) | built |
| `/live` | Live game: mirror of the device + kiosk result reveal | built |
| `/result` | Same page as `/live` (old name, still works) | built (J2) |
| `/live?demo=1` | Scripted demo game in the browser (`&auto=1` loops) | built |
| `/result/:sessionId` | Result of one specific game | built (J2) |
| `/session/:id` | Session detail with chart | built (K) |
| anything else | "Page not found" with a link back | built |

The header shows **Live game** (`/live`, also lit on `/result`),
**Leaderboard** (`/leaderboard`) and **How to play** (`/how-to-play`); the link
of the current page is highlighted. The site opens on the live game. A
"Skip to the main content" link comes first for keyboard users. While a game runs, a
**LIVE** sign next to the brand links to `/live`.

### Leaderboard: Top 10

- Polls `GET /api/leaderboard?limit=10` every 10 seconds (`usePolling`).
  The result page's rank lookup (`limit=100`) is separate and unchanged.
- **Title:** a "Top 10" sign, the time of the last refresh, and a subtitle
  across the remaining width: 10 entries -> "The 10 best scores so far. Tap
  a ticket to see how the game went."; fewer -> "All N scores so far. Tap a
  ticket ..." ("All 1 score" for one); none -> no subtitle (the empty state
  speaks). The text comes from `leaderboardSubtitle` in `src/leaderboard.js`.

**Layout rules**

| Width | Layout |
|---|---|
| >= 1024 px | two panes, together max 1200 px: **podium** left (5fr), **list** right (7fr). 10 entries fit 1920x1080 without scrolling; at 1280x720 the podium is fully visible and the list needs a small scroll |
| < 1024 px | one column: podium first, then the list |
| 1-3 entries | podium only, centred; no list pane |
| 0 entries | the closed-booth empty state ("Step right up! No games yet. Press Start on the device!") |

- **Podium = every entry ranked 1-3** (`splitPodium`). Rank 1: the biggest
  ticket, a painted "First Place" sign, 72 px gold ribbon, 96 px animal, big
  counter. Ranks 2-3: smaller tickets side by side under it (stacked on
  phones), 72 px animal.
- **List = ranks 4-10**: slim tickets, one line when the list is at least
  600 px wide (container query), else two lines. Each row: rank stub, name +
  level, small skill stamp, animal tag (44 px animal, name, IQ), score.
- **Ties** keep their shared number (RANK()) and are never hidden or merged:
  a tie at rank 2 shows two "2" tickets on the podium in API order; a tie for
  first shows two Champion tickets.
- Every ticket is **one link** to `/session/:id` (keyboard focus ring,
  >= 44 px tall); tickets are keyed by `session_id`, so a refresh never
  remounts or moves them.
- Names: the nickname, or "Player #N" (dark `#3a3448`, 11.4:1, but
  regular weight and smaller than a real name).
- Games without an ML prediction show "-" for skill and "No animal yet".
- A failed refresh keeps the old tickets (slightly faded) and lays an
  **"Out of order"** sign over the board (no layout shift), with Retry.
- A one-time slide-in when the tickets first appear (1.5 s window), off
  under reduced motion.
- First load: the six buttons light up in sequence ("Loading the
  scores..."); an empty database shows a closed booth with "Step right up!
  No games yet. Press Start on the device!".
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
  game was deleted with `tools/moderate.js`) is never shown.
- **Countdown.** A burning **fuse** (rope that shortens), "Back to the
  leaderboard in Ns" and a **Close** sign, placed at the top so they stay
  visible on a TV without scrolling. The countdown does not run while the
  browser tab is hidden.
- **Result content.** On the red stage a paper **result ticket** slides in:
  "GAME OVER" or "YOU WIN!" on a painted sign, the score as a giant
  mechanical counter, "Level N reached" (the level of the last attempt), the
  rank as a big stamp with a "?" link, "Place #N" from the top 100 with a
  ribbon for the podium ("Outside the top 100" otherwise, hidden if that
  request fails), and the animal with a "?" link: "You played like a(n)
  <Animal>!" and "Fun IQ number <n>"
  with its illustration and "Just for fun, not a real IQ test.". A game
  without a prediction shows "No animal yet for this game". A
  **win** drops CSS confetti once: it falls on the stage **behind** the ticket
  and the countdown text (never over text) and is gone within 4 s.
- **Nickname.** "Sign the guest book", only when the game has no nickname:
  input (max 16, 56 px tall), **Save** and **Skip**. Checked in the browser first (same rule as the API), one
  request at a time. Focusing or typing pauses the countdown; leaving the
  input, saving, or 15 seconds without a key press resumes it (without
  resetting it). Skip closes the result. Errors: 409 "This game already has a
  nickname.", 400 "That nickname isn't allowed. Use letters, numbers, spaces,
  - or _.", 429 "Too many tries. Wait a minute.", anything else "Could not
  save. Try again.". Success shows "Saved! You are <nickname>".
- **Idle screen.** The live panel in idle: "PRESS START / TO PLAY" on the LCD,
  the six buttons chasing in colour order, and a "Last results" ticket with
  the 5 newest games (`GET /api/game-sessions/recent`, every 10 seconds). See
  "Live game mirror" below.
- **`/result/:sessionId`** shows the same result block for one game, with no
  countdown and no automatic return; an unknown id shows "Game not found".

All kiosk rules live in the pure reducer `src/kioskState.js` and are unit
tested in `src/kioskState.test.js`; the page only sends events to it.

### Live game mirror (`/live`, also `/result`)

While a game runs on the ESP32, `/live` shows a copy of the real control
box top (contract: `docs/LIVE_PROTOCOL.md`): pink START | LCD | buzzer on
top, the six buttons in two rows of three with a green LED above each (the
LED lights, not the button, as on the box). It is **display-only**: the
web cannot control the hardware ("Mirror of the device. Play on the game
console.").

- **One state machine.** idle (LEDs dark, like the box) -> per attempt:
  countdown (1 2 3 Go!) -> watch -> countdown (1 2 3 Begin!) -> input -> result ->
  finished ("Final score N, saving...") -> the existing kiosk result reveal
  (`kioskState.js`, unchanged). `screenMode()` decides: the mirror wins while
  a game runs; after `game_finished` it waits until the latest-session poll
  shows that `session_id`, then the result reveal takes over (fallback: idle
  after 15 s). `game_reset` (START pressed mid-game) goes back to idle; 90 s
  of silence = idle. The LCD rows and the LED blink/chase copy the box's
  firmware (`rr_render`, `rr_leds`), so the TV and the box say the same.
- **One stream per tab.** `LiveProvider` (App.jsx) opens ONE `EventSource`
  for the whole tab (`live/useLiveGame.js`); the header and the leaderboard
  read the same state. EventSource reconnects by itself; after 3 failures it
  polls `GET /api/live/state` every 2 s and retries the stream every 20 s. A
  tab hidden for 30 s closes the stream and reopens it (fresh snapshot) when
  shown again.
- **Timing on the browser clock.** One `playback_started` event carries the
  whole sequence; `live/timeline.js` turns it into on/off times and the panel
  replays it. If the event arrives later than the whole playback lasts, the
  replay is skipped (WATCH only); a replay is never sped up, a duplicate never
  replays. The UI never computes score, lives or deadlines.
- **No per-frame renders.** `panelView(state, now)` (pure) says what is lit,
  what the LCD shows and when the next change is (`nextAt`); the component
  re-renders only at that moment and toggles CSS classes. Animations are
  transform/opacity only; prefers-reduced-motion switches states without
  movement (the LEDs do not blink or chase).
- **Header.** "Live game" (`/live`; `/result` still works and highlights it)
  and, while a game runs, a pulsing bulb + **LIVE** that links to `/live`. It
  keeps its place when hidden, so the header never jumps. The leaderboard
  shows a slim "A game is in progress. Watch live" banner.
- **Status:** connection chip "Live" / "Reconnecting..." / "Device offline"
  (stream and fallback both failing); no sound on the web (removed: the box's buzzer is the only sound; was off by
  default, remembered, WebAudio C4-A4 only after a click); an `aria-live`
  region announces phase changes only (Get ready, Go, Watch, Your turn, Game
  over).
- **Demo:** `/live?demo=1` plays a scripted game in the browser (no server):
  START is a real, keyboard-accessible button (the box has no RESET); a DEMO sticker is
  always visible. `?auto=1` loops it for an unattended screen. `?debug=1`
  shows the connection and the time from a playback event's arrival to the
  first lit button.
- **Sizes:** the whole panel fits a 1280x720 screen; phones stack the LCD
  over START and the buzzer when one row does not fit; START is at least
  44 px.

### How to play (`/how-to-play`)

A folded paper brochure for visitors: 7 numbered panels (Step right up, How
to play, Lives and time, Scoring, Your rank, Your animal, Good to know) and a
closed "What does this mean?" list. Desktop: three columns that flow like a
tri-fold leaflet; tablet: two; phone: one, with a sticky mini contents (Play,
Score, Rank, Animal) that jumps to the panels (smooth, instant with reduced
motion; focus moves to the panel). English / Filipino toggle on this page
only (remembered in localStorage; falls back to English for a missing key).
The Filipino text still needs review by a native speaker, but the page shows
no note about it. No popup anywhere.

- **Numbers are never typed by hand.** `vite.config.js` serves
  `virtual:game-facts`, built by `frontend/gameFacts.mjs` from
  `docs/game_rules.json` (run `python ml/export_rules.py` after a rule
  change) and `backend/artifacts/skill.json` + `animal.json`: lives, levels,
  points per level, bonus maximum, time limits, the worked example (from the
  real bonus table), the animal groups and fun IQ ranges, and the rank speed
  ranges (given only when the model's answer depends on speed alone).
- **"?" links** ("How is the rank decided?", "How is the animal decided?",
  44 px tap area) sit next to the rank stamp and the animal on the result
  ticket and the game page; on the leaderboard once in the title row (each
  ticket is a link, and a link inside a link is invalid HTML). The TV screen
  `/live` shows none while it waits or mirrors a game. A "? How to play" link
  is in every footer.
- **Print** (one "Print this page" button, `window.print()`): one portrait A4
  page (`@page { size: A4 portrait; margin: 12mm; }`; turn "Headers and
  footers" OFF in the print dialog), black ink on white, two flowing columns,
  no header/footer/contents/buttons/glossary. Body 11pt, panel titles 13pt,
  page title 18pt. The "Good to know" dots are a thick black border, so they
  print solid black even with "Background graphics" off. At the bottom, a
  boxed section: "Join the booth Wi-Fi first", then "Wi-Fi: <name>" from
  `VITE_WIFI_NAME` or a write-in line "Wi-Fi: ____________", then the QR code
  (40 mm with its white quiet zone) with "Scan to open on your phone" (14pt)
  and the address under it (12pt). Filipino prints the same page in
  Filipino; its longer sentences get tighter spacing and smaller title
  circles (`.brochure[lang="fil"]` print rules), never smaller text.
  The QR code exists ONLY on paper: it is in the page but `.print-only` hides
  it on screen. It encodes `<address>/how-to-play`, where the address is
  `VITE_PUBLIC_URL` (build-time) or the page's own address unless that is
  localhost / 127.0.0.1 / ::1; otherwise the paper says "Ask the staff for the
  game address". `VITE_WIFI_PASSWORD` is printed (on paper, for anyone to
  read) only if it is set together with `VITE_WIFI_NAME`. Encoder: `lean-qr/nano`
  (~4 kB, high error correction, no network). Open the page at the LAN address
  before printing, never at localhost.

### Visitor text (wording rules)

Every word a visitor reads lives in `src/content/visitorText.js` (labels,
messages, chips) or `src/content/howToPlay.js` (the brochure). Rules, checked
by `src/content/howToPlay.test.js`:

- sentences of at most 20 words (aim for 15), everyday words, active voice;
- no abbreviations ("seconds", never "s" or "sec"); "IQ" only as "fun IQ
  number", next to "Just for fun, not a real IQ test.";
- banned words (whole word, any case, English AND Filipino strings):
  sequence, playback, input, phase, reaction time, response time, deadline,
  timeout, accuracy, success rate, percentile, tier, nearest neighbor,
  similarity, matcher, decision tree, classifier, model, algorithm, AI,
  machine learning, synthetic, trained, latency, reconnecting, offline,
  mirror, kiosk, session, prediction, threshold, feature, data, API,
  backend, prize, ML, UI, LCD (list: `src/content/wordingRules.js`);
- brochure panels at most 70 words (the animal table's names and numbers
  are not counted) and an English Flesch reading ease of at least 70.

**Adding visitor text safely:** add the string to `visitorText.js` (or the
brochure file, in BOTH `en` and `fil`), import it in the component, run
`npm test`. A banned word, a long sentence or an abbreviation fails the test.
Code, comments, docs and developer tools (`/live?debug=1`) may keep technical
words. Known exception: the panel's 20 x 4 display copies the game console's
own text ("Watch the sequence", "New pattern, same Lv", see
`docs/LIVE_PROTOCOL.md`); changing it needs the firmware owner, so it is not
in `visitorText.js`.

### Session detail (Phase K)

`/session/:id`, opened by clicking a leaderboard row (the name is a real link
for keyboard users).

- Header ticket: outcome sign, nickname (or "Player #N"), game id, device, local
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

The session page is loaded with `React.lazy`, so Recharts (about 420 kB,
120 kB gzipped) is only downloaded when it is opened.

## Design

The look is a **carnival midway booth at night**: cream ticket paper,
tent-red awning and stage, one ink colour for text and outlines, hard offset
shadows, the six game buttons as the brand. The full brief (palette with
computed contrast ratios, type, spacing, shapes, motion, accessibility) and
the critique of the three iteration passes are in
[`docs/DESIGN.md`](DESIGN.md).

- **Tokens** live in the `@theme` block of `src/index.css` (Tailwind v4):
  `ink`, `cream`, `ticket`, `muted`, `tent`, `tent-dark`, `midnight`, the six
  `paint-*` button colours, `gold`/`silver`/`bronze`, `stamp-*`, `danger`,
  `ok`, plus `font-sign` (Bungee) and `font-body` (Nunito) and the hard
  shadows `shadow-hard-sm`/`shadow-hard`/`shadow-hard-lg`.
- **Shapes** (`.ticket`, `.ticket-notched`, `.sign`, `.painted`, `.stamp`,
  `.counter`, `.animal-tag`, `.awning`, `.bulb-rail`, `.arcade-btn`,
  `.stage`, `.fuse-*`, `.confetti`) are in `@layer components`, so a Tailwind
  utility on the same element always wins.
- **Fonts** come from `@fontsource/bungee` and `@fontsource/nunito` (latin,
  weights 400 + 400/800 only) and are bundled into `dist/assets`. There is no
  Google Fonts or CDN link: the site works without internet.
- **Motion** animates only `transform`/`opacity`: chasing bulbs, the
  button sequence, the ticket slide-in, the fuse, one-off confetti. Everything
  pauses while the tab is hidden (`data-tab-hidden` on `<html>`, set in
  `main.jsx`) and stops under `prefers-reduced-motion: reduce`.
- **Animals** are original inline SVG components in
  `src/components/animals/` (each under 1 kB, `role="img"` + `aria-label`);
  unknown animals get a blank-ticket drawing. No emoji anywhere.
- **Charts** keep their validated result colours; axes, grid and tooltips
  follow the theme (ink axis line, beige hairline grid, Bungee numbers,
  ticket-style tooltips).
- VS Code: `@theme` is Tailwind syntax. A local `.vscode/settings.json`
  (gitignored) teaches the editor's CSS checker these at-rules, so it does
  not show "Unknown at rule @theme".

### Sizes (production build)

| File | Before redesign | After redesign | After Top 10 |
|---|---|---|---|
| main JS (`index-*.js`) | 287.64 kB (90.44 kB gzip) | 297.75 kB (93.57 kB gzip) | 302.81 kB (94.51 kB gzip) |
| CSS | 40.87 kB (7.62 kB gzip) | 36.62 kB (8.18 kB gzip) | 37.92 kB (8.53 kB gzip) |
| SessionDetail chunk | 7.14 kB | 7.92 kB | 7.88 kB |
| Charts chunk (Recharts) | 419.83 kB | 420.25 kB | 420.25 kB |
| Fonts (woff2, the browser downloads only these) | - | 14.3 + 16.3 + 16.5 kB | same |
| Images | none | none (all SVG inline; paper grain is a 353-byte data URI) | none |

After the admin removal and the live mirror: main JS **322.52 kB (101.22 kB
gzip)**, CSS **41.86 kB (9.78 kB gzip)**, SessionDetail chunk with Recharts
**425.31 kB (121.13 kB gzip)**; no admin chunk.

## Top 10 checklist (0 / 3 / 10 / tie)

Use a **copy** database, never the real one. From `/backend` in PowerShell:

```powershell
$env:DB_PATH = "./data/ui_test.db"
node ../db/migrate.js
node ../db/seed.js
node src/server.js                       # keep this terminal open (port 3000)
```

Second terminal, also from `/backend` with the same `$env:DB_PATH`, to switch
between the cases (`clear_fake.js --yes` removes only the fake SIM01 games):

```powershell
$env:DB_PATH = "./data/ui_test.db"
node ../tools/clear_fake.js --yes                     # back to 0 games
node ../tools/fake_esp32.js --count 3 --seed 5        # 3 games
node ../tools/fake_esp32.js --count 10 --seed 5       # 10 games (after clearing)
```

For the **tie**, clear, then upload 14 games with seed 5 and the seed-1 game
twice (the same game twice = the same score):
`--count 14 --seed 5`, then `--count 1 --seed 1` two times.

- [ ] **0 games.** Closed booth: "Step right up! No games yet. Press Start on
      the device!". No subtitle, no tickets.
- [ ] **3 games.** Subtitle "All 3 scores so far. ...". Only the podium,
      centred: the Champion ticket with its sign on top, #2 and #3 side by side
      under it. No empty list pane.
- [ ] **10 games.** Subtitle "The 10 best scores so far. ...". On a 1920x1080
      screen (F11) the podium and ranks 4-10 are all visible without
      scrolling. At 1280x720 the podium is fully visible; rank 10 needs a short
      scroll.
- [ ] **14 games.** Exactly 10 tickets.
- [ ] **Tie.** Rank 1 is the Champion; the next two tickets both show a silver
      "2"; the list starts at rank 4.
- [ ] **No prediction.** Insert or upload a game without a prediction (for
      example the pre-Phase-G `RR01-000127`): its ticket shows "-" and
      "No animal yet" and nothing breaks.
- [ ] **Phone (360-390 px).** One column, podium first; list rows use two
      lines; nothing sticks out of a ticket; no sideways scroll.
- [ ] **Hierarchy.** From across the room, the Champion ticket is the first
      thing you notice.
- [ ] **Refresh.** Wait 10 s: nothing jumps or flickers.
- [ ] **Keyboard.** Tab through the tickets: each one gets the ink + yellow
      ring and Enter opens `/session/<id>`.

Afterwards stop the server and delete `backend/data/ui_test.db*`.

## Manual test checklist

Run the backend and frontend, then check:

- [ ] **Normal load.** Open `http://localhost:5173/`. Tickets appear, and
      "Updated 8:27:05 PM" (Philippine time, 12-hour clock) advances at least
      once after 10 seconds.
- [ ] **Rank styling.** With at least three games, ranks 1-3 are on the
      podium with gold, silver and bronze ribbons; ranks 4-10 are list rows
      with a "No. N" stub. Two equal scores show the same rank number and the
      next rank skips (1, 2, 2, 4).
- [ ] **No prediction.** A game uploaded before Phase G (for example
      `RR01-000127`) still appears, with "-" for skill and "No animal yet".
- [ ] **Loading state.** In DevTools, set Network to "Slow 3G" and reload.
      The six buttons light up in sequence with "Loading the scores..."
      before the tickets appear.
- [ ] **Empty state.** Stop the frontend and backend, point the backend at an
      empty database (`DB_PATH=./data/test_frontend.db`, run migrate + seed),
      start both, and open the page. It must show the closed booth with
      "Step right up! No games yet. Press Start on the device!".
- [ ] **Backend stopped.** Leave the page open with tickets visible, stop the
      backend, and wait for the next 10-second poll. The tickets must stay
      (slightly faded) and a yellow **"Out of order"** sign with "Could not
      refresh. Showing the last known scores." and Retry is taped over the
      board. Start the backend again and click Retry; the sign disappears.
- [ ] **Look and motion.** The awning bulbs chase; no element has a blurred
      shadow, glow or gradient text; no emoji anywhere (animals are
      drawings). In DevTools > Rendering, emulate
      `prefers-reduced-motion: reduce`: bulbs and buttons stand still (all
      lit), the result ticket does not slide, no confetti.
- [ ] **Keyboard.** Press Tab: every link/button shows a thick ink ring with a
      yellow halo; the active nav sign is pressed in and has a pointer under
      it (not only a colour change).
- [ ] **Offline fonts.** With the production build (`npm start`), DevTools >
      Network shows only requests to the laptop itself, including the three
      `.woff2` files; nothing goes to Google or a CDN.
- [ ] **Narrow phone width.** In DevTools, switch to a 360-390 px-wide
      device. Each ticket stacks (rank and name, tear line, score, level,
      stamp, animal tag); nothing overflows sideways.
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

- [ ] **Empty database.** The live panel shows "PRESS START / TO PLAY", the
      six buttons chase one after another, and "Last results" says "No games
      yet. Be the first!".
- [ ] **TV.** On the 1080p display in full screen (F11), the idle stage and a
      result fill the screen without scrolling; read the score, level, rank,
      skill and animal from 2 m away.
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
      the name appears on the leaderboard and in Last results.
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
- [ ] **Header.** "Live game" is highlighted on `/live`, `/result` and
      `/result/<id>`, "Leaderboard" on `/`.
- [ ] **Phone width.** At 390 px wide nothing scrolls sideways.

Delete the test database afterwards (`backend/data/result_check.db*`).

## Session page checklist

Same test database as above; upload some games with the fake ESP32.

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
- [ ] **Phone width.** The attempts table scrolls sideways inside its box;
      the page itself never does.

## Files

| File | Purpose |
|---|---|
| `src/api.js` | fetch wrapper, 8 s timeout, `.status` on errors |
| `src/usePolling.js` | polling hook (hidden-tab pause, no overlap, keeps old data) |
| `src/index.css` | design tokens (`@theme`), paper grain, focus ring, carnival shapes, motion rules |
| `src/theme.js` | six button colours + notes, stamp and ribbon colours |
| `src/components/SkillBadge.jsx` | skill as a rubber stamp, "-" when missing |
| `src/components/AnimalTag.jsx` | animal tag: animal drawing + name + IQ |
| `src/components/StatusMessage.jsx` | loading (buttons) / "Out of order" / closed booth |
| `src/components/ArcadeButtons.jsx` | the six game buttons with notes, still or in sequence |
| `src/components/Decor.jsx` | marquee bulbs, awning scallops, bunting, confetti (decorative) |
| `src/components/ScoreCounter.jsx` | mechanical counter digits (plain number for screen readers) |
| `src/components/RankBadge.jsx` | place ribbon for rank 1-3, numbered stub otherwise |
| `src/components/LevelSign.jsx` | "Level N" sign (`small` for tight cards) |
| `src/components/PlayerName.jsx` | nickname, or the dark-but-secondary "Player #N" |
| `src/leaderboard.js` | Top 10 helpers: `LEADERBOARD_LIMIT`, subtitle text, podium/list split (tested) |
| `src/components/animals/` | Chimpanzee, Bottlenose Dolphin, Elephant, Orangutan, Pig, MysteryTicket SVGs + `AnimalIcon` |
| `src/pages/Leaderboard.jsx` | leaderboard page |
| `src/pages/Result.jsx` | live result screen (kiosk) and one-game result |
| `src/kioskState.js` | pure kiosk reducer: baseline, countdown, pause, dismiss |
| `src/nickname.js` | nickname rule (same as the API) and error messages |
| `src/format.js` | score / level / rank / article helpers |
| `src/useSession.js` | loads one game, optional retry, `notFound` flag |
| `src/components/ResultCard.jsx` | the big result block, shared by both result modes |
| `src/components/NicknameForm.jsx` | nickname form, validation, no double submit |
| `src/pages/SessionDetail.jsx` | one game: facts, ML results, chart, attempts table (lazy) |
| `src/components/Charts.jsx` | Recharts chart of the attempts (session page) |
| `src/chartData.js` | game-rule mirror (deadline), result colours, chart-row mapping |
| `src/*.test.js` | vitest unit tests for the pure helpers (`npm test`) |
| `src/App.jsx` | header (LIVE sign, 3 nav signs), routes (`/` opens `/live`), footer, `LiveProvider` |
| `src/content/visitorText.js` | every visitor string outside the brochure (wording rules) |
| `src/content/howToPlay.js` | brochure text, English + Filipino, numbers from `virtual:game-facts` |
| `src/content/wordingRules.js` | banned words, sentence and reading-ease checks (tests only) |
| `frontend/gameFacts.mjs` | build-time facts from the rule and model files |
| `src/pages/HowToPlay.jsx` | the brochure page (lazy) |
| `src/components/HelpLink.jsx`, `PrintQr.jsx` | "?" sign; print-only QR |
| `src/printQr.js` | QR address rule and encoding |
| `src/live/liveReducer.js` | live state, `panelView`, `screenMode`, connection status (pure, tested) |
| `src/live/timeline.js` | sequence and countdown timelines (pure, tested) |
| `src/live/useLiveGame.js` | the one EventSource per tab, polling fallback, hidden-tab close |
| `src/live/usePanel.js` | panel clock (renders only at boundaries), reduced motion, debug timing |
| `src/live/demoGame.js` | `?demo=1` scripted game and its START button |
| `src/components/LivePanel.jsx` | the control panel and the connection chip |
| `src/components/LiveIndicator.jsx` | header LIVE sign and leaderboard banner |
| `src/main.jsx` | BrowserRouter + React root |
