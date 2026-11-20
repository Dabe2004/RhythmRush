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
ADMIN_PASSWORD=<random value 3>   # tell only the moderators
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
  rule from the README ("Windows firewall"), in an administrator PowerShell.
- Avoid guest Wi-Fis with "client isolation": devices cannot see each other
  there. A dedicated router or a phone hotspot is safest.
- Turn off sleep: Settings > System > Power > Screen and sleep > Never (while
  plugged in).

## On the day

### 7. Start

```powershell
npm start
```

Check the output:

- `Rhythm Rush backend listening on http://localhost:3000`
- `on this network: http://192.168.x.y:3000` (note this address)
- `website: served from frontend/dist`
- **no** "Admin API is OFF" or "change-me" warning

### 8. Open the screens

| Screen | Open | Notes |
|---|---|---|
| Kiosk display (TV/monitor near the game) | `http://<laptop IP>:3000/result` | Press F11 for full screen. It shows "Waiting for the next player...". |
| Moderator laptop or tablet | `http://<laptop IP>:3000/admin` | Log in with `ADMIN_PASSWORD`. Devices: RR01 should go **Online** after the first game. |
| Optional second screen | `http://<laptop IP>:3000/` | The leaderboard. |

### 9. Three-device dry run (before visitors arrive)

Use the three devices you will really use: **(a)** the ESP32 game box,
**(b)** the kiosk display, **(c)** the moderator laptop or phone.

1. **(a)** Play one short game on the ESP32 (fail on purpose at level 1-2).
2. **(b)** Within about 2 seconds the kiosk shows "Game Over", the score, the
   level, the skill and the animal. Type a test nickname and press Save:
   "Saved! You are ...".
3. **(c)** The admin page shows the game in Recent games within 15 seconds,
   RR01 is **Online**, and Total games is 1.
4. **Offline test.** Switch off the laptop's Wi-Fi (or stop `npm start`), play
   one more game on the ESP32, then switch it back on. The game must arrive
   **exactly once** (Recent games shows one new row, not two) and appear on
   the kiosk.
5. **Wrong and timeout presses.** Play a game with one wrong press and one
   timeout. On `/session/<id>` (click the game on the admin page) the chart and
   the table show the wrong press and the timeout.
6. **Score check.** The score on the ESP32 display, on the kiosk and on the
   leaderboard are the same number.
7. **Clean up the dry run.** On the admin page, Delete the test games one by
   one (they belong to RR01). The leaderboard is empty again.

If step 2 fails but step 3 works, the kiosk screen cannot reach the laptop
(firewall or wrong address). If step 3 fails, the ESP32 cannot reach the
laptop: check its Serial Monitor output.

## During the event

- Rude nickname? Admin page > Recent games > **Clear nickname**.
- The kiosk refreshes itself; if it ever looks stuck, press F5.
- Do not run `npm run fake` on the exhibition database. If it happens anyway:
  admin page > Clean-up > type `SIM01` > **Remove simulated games**.

## After the event

- Back up `backend/data/rhythm.db` (the real games, useful for retraining).
- Remove the firewall rule: `Remove-NetFirewallRule -DisplayName "Rhythm Rush 3000"`.
- Change `ADMIN_PASSWORD` if it was shared widely.
