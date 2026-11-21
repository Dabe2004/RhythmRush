# Demo day checklist

For the people running Rhythm Rush at the exhibition. Do steps 1-6 the day
before, at home or in the classroom, and steps 7-9 on the day. Commands are
for PowerShell in the project folder unless it says otherwise.

## The day before

### 1. Update and test the code

```powershell
git pull
npm run install-all
npm run test-all          # needs ml/data once: npm run simulate
npm run build
```

All tests must pass and the build must succeed.

### 2. Delete all test data

Every fake or test game lives in the database file. Stop the server first
(Ctrl+C), then delete the file and its two helper files:

```powershell
Remove-Item backend/data/rhythm.db* -Confirm
```

(If you want to keep the old data, copy the files to another folder first.)

### 3. Set real secrets in `backend/.env`

Make a random value for each secret (run this three times):

```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
```

Then edit `backend/.env`:

```ini
NODE_ENV=production
PORT=3000
DB_PATH=./data/rhythm.db
DEVICE_API_KEY=<random value 1>   # the same value goes into the ESP32 config.h
SIM_API_KEY=<random value 2>      # different from DEVICE_API_KEY
ALLOWED_ORIGINS=
```

Never commit this file (it is gitignored) and never put it on a slide.

### 4. Create the fresh database

```powershell
npm run migrate
npm run seed
```

`seed` must print `inserted device RR01` and `inserted device SIM01`. With
`NODE_ENV=production` it refuses the example keys, so if it complains, step 3
is not done.

### 5. Flash the ESP32

In `firmware/rhythm_rush_client/config.h` set the Wi-Fi name and password of
the exhibition network, `SERVER_URL` to `http://<laptop IP>:3000`, `API_KEY`
to the new `DEVICE_API_KEY`, and `DEVICE_ID` to `RR01`. Upload the sketch.
See `firmware/rhythm_rush_client/README.md`.

### 6. Prepare the network

- Give the laptop a **fixed IP** on the exhibition Wi-Fi (DHCP reservation in
  the router), so the ESP32's `SERVER_URL` stays right.
- Set the Wi-Fi profile on the laptop to **Private** and add the firewall
  rule from the README ("Windows firewall"), in an elevated PowerShell.
- Avoid guest Wi-Fis with "client isolation": devices cannot see each other
  there. A dedicated router or a phone hotspot is safest.
- Turn off sleep: Settings > System > Power > Screen and sleep > Never (while
  plugged in).

### 6b. Print the "How to play" sign with its QR code

1. Join the booth router or phone hotspot with the laptop.
2. Find the laptop's IP: `ipconfig` in PowerShell, "IPv4 Address" of the Wi-Fi
   adapter (e.g. `192.168.1.5`). Reserve it in the router (DHCP reservation)
   so it never changes. Optionally put it in `frontend/.env` as
   `VITE_PUBLIC_URL=http://192.168.1.5:3000` and run `npm run build` again.
3. Start the server and open `http://<laptop IP>:3000/how-to-play` on the
   laptop. **Never `localhost`**: then the sign prints "Ask the staff for the
   game address" instead of a QR code.
4. Choose English or Filipino, then press "Print this page" ("I-print ang
   pahinang ito"): one portrait A4 page in either language. In the print
   dialog turn **"Headers and footers" OFF** (otherwise the browser adds the date, title
   and address and the sign can spill onto a second page). "Background
   graphics" can stay off: the dots still print black. Check the QR code and
   the address under it in the print preview, print, and tape it up at the
   booth. Without `VITE_WIFI_NAME`, write the booth Wi-Fi name by hand on the
   "Wi-Fi: ____________" line.
5. Scan it with a phone that is **on the booth Wi-Fi**: it must open the
   brochure.

**Warnings.** The QR code breaks if the laptop's IP changes, so check it
again on the day (scan once more). A phone on mobile data cannot open it: the
sign must tell visitors to join the booth Wi-Fi first (set `VITE_WIFI_NAME`
to print the name; a password is printed only if `VITE_WIFI_PASSWORD` is set,
and then anyone can read it on the paper).

## On the day

### 7. Start

```powershell
npm start
```

Check the output:

- `Rhythm Rush backend listening on http://localhost:3000`
- `on this network: http://192.168.x.y:3000` (note this address)
- `website: served from frontend/dist`

### 8. Open the screens

| Screen | Open | Notes |
|---|---|---|
| Kiosk display (TV/monitor near the game) | `http://<laptop IP>:3000/live` | Press F11 for full screen. Idle: the panel's LCD says "PRESS START / TO PLAY" and the buttons chase. The chip under it must say **Live**. |
| No device / spare screen | `http://<laptop IP>:3000/live?demo=1&auto=1` | A scripted demo game that loops by itself (clearly marked DEMO). Never on the main kiosk while the real game runs. |
| Optional second screen | `http://<laptop IP>:3000/leaderboard` | The leaderboard (`/` opens the live game). |
| Visitors' phones (booth Wi-Fi) | the printed QR code, or `http://<laptop IP>:3000/how-to-play` | How to play, the rank and the animal explained. |

### 9. Three-device dry run (before visitors arrive)

Use the three devices you will really use: **(a)** the ESP32 game box,
**(b)** the kiosk display, **(c)** the laptop (a PowerShell in `backend/`).

1. **(a)** Play one short game on the ESP32 (fail on purpose at level 1-2).
   **(b)** While playing, the kiosk mirrors the panel: START press, 3-2-1-GO,
   the sequence, your presses, level/score/lives on the LCD. A retry or the
   next level has **no** countdown. After the game it shows "Final score N,
   saving...".
2. **(b)** Within about 2 seconds the kiosk shows "Game Over", the score, the
   level, the skill and the animal. Type a test nickname and press Save:
   "Saved! You are ...".
3. **(c)** `node ../tools/moderate.js list` shows the game with device RR01.
4. **Offline test.** Switch off the laptop's Wi-Fi (or stop `npm start`), play
   one more game on the ESP32, then switch it back on. The game must arrive
   **exactly once** (`moderate.js list` shows one new row, not two) and appear
   on the kiosk.
5. **Wrong and timeout presses.** Play a game with one wrong press and one
   timeout. On `/session/<id>` (click the game on the leaderboard) the chart
   and the table show the wrong press and the timeout.
6. **Score check.** The score on the ESP32 display, on the kiosk and on the
   leaderboard are the same number.
7. **Clean up the dry run.** Delete the test games one by one with
   `node ../tools/moderate.js delete-game <id> --yes --confirm <id>` (they
   belong to RR01), or reset the whole database (README, "Moderation"). The
   leaderboard is empty again.

8. **RESET.** Hold RESET about 1 s during a game: the kiosk flashes the
   buttons backwards, shows "RESTARTING..." and a new countdown; the
   abandoned game never appears on the leaderboard. A short tap mid-game
   does nothing. RESET after game over says "PLAY AGAIN!".
9. **Delay.** Film the panel and the TV together in slow motion and count the
   frames between a lit LED ring and the lit button on screen; note it in
   `docs/NOTES.md`.

If step 2 fails but step 3 works, the kiosk screen cannot reach the laptop
(firewall or wrong address). If step 3 fails, the ESP32 cannot reach the
laptop: check its Serial Monitor output.

## During the event

- Rude nickname? On the laptop, in `backend/`:
  `node ../tools/moderate.js list`, then
  `node ../tools/moderate.js clear-nickname <id> --yes`. To stop a word for
  the rest of the day: `node ../tools/moderate.js block-add <word>`.
- The kiosk refreshes itself; if it ever looks stuck, press F5. "Reconnecting..."
  under the panel means the TV lost the laptop for a moment; it recovers by
  itself. The mirror is only a picture: scores always come from the upload.
- Do not run `npm run fake` on the exhibition database. If it happens anyway:
  `node ../tools/clear_fake.js --yes` removes every SIM01 game (real games
  are never touched).

## After the event

- Back up `backend/data/rhythm.db` (the real games, useful for retraining).
- Remove the firewall rule: `Remove-NetFirewallRule -DisplayName "Rhythm Rush 3000"`.
