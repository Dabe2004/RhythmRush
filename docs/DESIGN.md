# Rhythm Rush - design brief

The visual identity of the website (`/frontend`). Written before the
redesign was coded; the critique and iteration notes are at the end.

## Concept

**A traveling carnival midway at night, seen as a hand-painted arcade game
booth.** The website is the booth: a striped tent awning with marquee bulbs
on top, painted wooden signs, paper tickets and animal tags on the counter,
bunting along the bottom.

- Warm, tactile, slightly imperfect: things are a degree or two off-square,
  as if nailed up by hand; shadows are hard offsets, like paint on plywood.
- Playful but confident: big flat colours and thick ink outlines, no glow,
  no glass, no gradients pretending to be light.
- **Not** neon cyberpunk, not a dark dashboard. Cream paper is the main
  surface; deep tent-red and midnight-blue appear only as big framing areas
  (the awning, the kiosk stage).
- The six game buttons are the brand: red, orange, yellow, green, blue,
  purple, labelled with their notes **C4 D4 E4 F4 G4 A4**. They return as a
  motif: in the idle kiosk (lighting up in sequence, like the game), in
  loading states, in the bunting.

## Palette

One ink, one cream, one accent, plus the six button paints. All flat.

| Token | Hex | Role |
|---|---|---|
| `ink` | `#1d1a2f` | all text and every outline |
| `cream` | `#f6ecd6` | page background (ticket paper, with a faint grain) |
| `ticket` | `#fffaee` | the face of tickets, signs and tables (lighter than the page) |
| `muted` | `#5c5468` | secondary text (captions, "points", labels) |
| `mystery` | `#3a3448` | "Mystery Player" (no nickname): dark, but regular weight and 0.86 em, so real nicknames (800 weight) stay first |
| `tent` | `#b3261e` | **accent**: awning stripes, kiosk stage, primary buttons |
| `tent-dark` | `#8f1d17` | stage stripes, pressed states |
| `midnight` | `#1c2541` | footer band, the night sky behind the awning |
| `paint-red` | `#e2412f` | button 1 (C4), bunting. **Never under text** |
| `paint-orange` | `#f0892b` | button 2 (D4) |
| `paint-yellow` | `#f6c522` | button 3 (E4), highlight signs, focus ring halo |
| `paint-green` | `#2f9e57` | button 4 (F4) |
| `paint-blue` | `#2f6fde` | button 5 (G4). **Never under text** |
| `paint-purple` | `#7c4dcc` | button 6 (A4) |
| `gold` / `silver` / `bronze` | `#f2b630` / `#c9ccd4` / `#c77c3c` | place ribbons for rank 1-3 |
| `stamp-green` / `stamp-blue` / `stamp-purple` | `#1e6b3c` / `#1f4f9e` / `#5a2c9c` | skill stamps: Beginner / Intermediate / Pro |
| `danger` | `#a3201a` | error text, delete buttons |
| `ok` | `#1e6b3c` | success text |

### Contrast (WCAG 2.x, computed, not estimated)

| Text | Background | Ratio | Use |
|---|---|---|---|
| ink | cream | **14.41:1** | body text on the page |
| ink | ticket | **16.25:1** | text on tickets and signs |
| muted | cream | **6.12:1** | secondary text |
| muted | ticket | **6.90:1** | secondary text on tickets |
| mystery `#3a3448` | ticket `#fffaee` | **11.42:1** | "Mystery Player" on tickets (was muted, 6.90:1) |
| mystery | cream | **10.14:1** | "Mystery Player" on the page |
| mystery | tag `#f1d49b` | **8.29:1** | on a animal tag |
| cream | tent | **5.57:1** | text on the kiosk stage / awning |
| ticket | tent | **6.28:1** | text on the kiosk stage |
| cream | tent-dark | **7.59:1** | text on dark stage stripes |
| cream | midnight | **12.87:1** | footer text |
| yellow | tent | 4.02:1 | **large text only** (stage headline, >= 32 px bold) |
| yellow | midnight | 9.30:1 | large text |
| ink | orange | 6.70:1 | labels on orange |
| ink | yellow | 10.42:1 | "Out of order" sign, highlights |
| ink | green | 4.95:1 | labels on green |
| cream | purple | 4.72:1 | labels on purple |
| ink | gold / silver / bronze | 9.27 / 10.53 / 5.14:1 | rank numbers on ribbons |
| stamp-green / -blue / -purple | ticket | 6.25 / 7.55 / 8.86:1 | skill stamps |
| stamp-green / -blue / -purple | cream | 5.55 / 6.70 / 7.86:1 | skill stamps |
| danger | ticket / cream | 7.26 / 6.44:1 | error text |
| ok | ticket | 6.25:1 | success text |
| ink | red (`#e2412f`) | 4.05:1 | **FAIL** for body text - never used |
| cream | red / blue | 3.56 / 4.02:1 | **FAIL** - never used |

Rule from the failures: **no text is ever placed on the red or blue paint.**
The button notes sit *under* the buttons, on cream or tent-red.

Graphic objects (outlines, focus rings) need 3:1: ink on cream is 14.41:1;
ink on tent-red is only about 2.4:1, so on the red stage the focus ring adds
a yellow halo (yellow on tent 4.02:1).

### Chart colours

The session chart keeps its validated result colours (pass `#199e70`, wrong
`#d95926`, timeout `#3987e5`) and the single-series blue `#3987e5`. They were
re-validated on the new ticket surface `#fffaee` (light mode, all pairs):
lightness band, chroma, colour-blind separation (worst ΔE 9.4), normal-vision
separation (ΔE 20.9) and >= 3:1 contrast all pass. Text labels, the legend
and the attempts table still carry every value, so colour is never alone.

## Type

| Role | Face | Weights | Why |
|---|---|---|---|
| Display: headings, signs, big numbers, the score counter | **Bungee** | 400 | A typeface made for signage. All-caps, wide, very clear lining digits, so a score is readable from 2 m and fits a boxed "mechanical counter". It reads as a painted booth sign without the saloon cliché of Rye. |
| Body: everything else | **Nunito** | 400, 800 | Rounded terminals that match the friendly painted shapes, very legible at small sizes on a cheap tablet, with a heavy 800 for labels and names. |

Rejected: **Rye** (western/saloon, weak digits), **Chango** (too wide for a
360 px phone), **Lilita One** and **Fredoka** (read as generic mobile-game UI),
**DM Sans** (too neutral next to Bungee).

Fonts come from `@fontsource/bungee` and `@fontsource/nunito`, **latin subset
and only the three files used** (woff2: 14.3 + 16.3 + 16.5 kB). They are
bundled by Vite into `dist/assets`: no Google Fonts, no CDN, works without
internet.

Sizes (rem, 16 px base): body 1 / 1.125; labels 0.875 (800); ticket names
1.25-1.5 (800); sign headings 1.5-3 (Bungee); kiosk headline
`clamp(3rem, 7vw, 7.5rem)`; kiosk score digits `clamp(2.75rem, 6.5vw, 7rem)`.

## Spacing

Tailwind's 4 px scale, used in a short rhythm: **4, 8, 12, 16, 24, 32, 48,
64**. Inside a ticket 16-24; between tickets 16 (12 on phones); between page
sections 48-64. Generous gutters: 16 px on phones, 24 px on tablets.

## Shape language

- **Ink outlines:** 3 px on signs, tickets and buttons (2 px on small
  elements).
- **Hard offset shadows only:** `4px 4px 0 ink` (6 px on the big kiosk
  ticket, 2-3 px on small things). Never a blurred shadow, never a glow.
- **Slight rotations:** -2deg to 2deg on signs, stamps, tags and alternating
  leaderboard tickets (+-0.4deg). Never on long body text blocks.
- **Ticket notches:** half circles cut out of both sides of a ticket, plus a
  dashed "tear line" between the stub and the body.
- **Scalloped awning edge** and **bunting flags** drawn as inline SVG.
- **Marquee bulbs** on a dark rail, chasing in sequence.
- Corners: small (4-8 px) or square; no big rounded "cards".
- **Paper grain:** a 160 px tiled SVG noise (inline data URI, < 1 kB) on the
  cream page. No image files.

## Motion

- Only `transform` and `opacity` are animated.
- Bulbs chase (1.2 s loop), the six buttons light up one after another
  (3.6 s loop), the result ticket "prints" (slides in once, 0.6 s), confetti
  falls once on a win (about 4 s, then gone), the countdown fuse burns down.
- Everything decorative stops while the tab is hidden (`data-tab-hidden` on
  `<html>` pauses the animations) and is static under
  `prefers-reduced-motion: reduce` (bulbs and buttons lit, no slide, no
  confetti).
- No animation on large or blurred elements.

## Accessibility rules

- AA contrast for every text pair above.
- Focus: a 3 px ink outline with a yellow halo, visible on cream and on red.
- Tap targets >= 44 px (48 px for the kiosk nickname form).
- State is never colour alone: the active nav sign is pressed in, has no
  shadow and carries a "you are here" pointer; skills are words in a stamp;
  results have labels; ranks have numbers.
- SVG illustrations have `role="img"` and an `aria-label`; purely decorative
  SVG (bulbs, bunting, awning) is `aria-hidden`.
- Lists stay lists (`<ol>` for the leaderboard), tables stay tables.

## Components

| Component | Where |
|---|---|
| Awning: red/cream stripes, scalloped SVG edge, painted wordmark, marquee bulb rail | header |
| Booth-sign nav links (pressed + pointer when active) | header |
| Bunting (six colours) + the "just for fun" line | footer |
| `ArcadeButtons`: six flat buttons with note labels, static or in sequence | idle kiosk, loading states, empty state |
| `MarqueeBulbs` | header rail, kiosk stage |
| Ticket (notches + tear line) | leaderboard rows, Hall of Fame, result printout, session page |
| `ScoreCounter`: boxed Bungee digits | leaderboard, result, session |
| `RankBadge` ribbon (gold/silver/bronze rosette) and numbered stub | ranks |
| `SkillBadge` as a rubber stamp (rotated, double ink border) | everywhere skill appears |
| `AnimalTag` as a animal tag with the custom SVG animal | leaderboard, result, session |
| `animals/`: Chimpanzee, Bottlenose Dolphin, Elephant, Orangutan, Pig, MysteryTicket fallback | animal tags |
| Level sign | leaderboard, result |
| Fuse countdown | kiosk |
| Guest book (nickname form) | kiosk, one-game result |
| CSS confetti | kiosk win |
| Status signs: loading (buttons), "Out of order" (error), closed booth (empty) | all pages |

---

## Screenshots

Taken with headless Chrome against the **production build** (served by
Express) and the same throwaway database, at 360, 390 (after only), 768, 1280
and 1920 px; full pages plus viewport crops, the kiosk idle, a win and a game
over.

| Set | Folder |
|---|---|
| Before the redesign | `docs/screenshots/before/` (28 files) |
| After pass 1 | `docs/screenshots/after-pass1/` (28) |
| After pass 2 | `docs/screenshots/after-pass2/` (38) |
| Final | `docs/screenshots/after/` (38) |

The folder is about 60 MB, so it is **gitignored** (local only). File names
are `<width>-<page>.png`, e.g. `1920-result-idle.png`, `360-leaderboard-view.png`.

## Critique and iterations

I looked at every screenshot and judged it against the banned list.

**Before.** A dark navy page with an indigo radial glow and a faint neon grid,
identical rounded slate cards and table rows, pill badges for skill, emoji
for animals, gradient text on "You Win!", gradient progress bar and rank
circles, system font everywhere. Competent, and exactly what the banned list
describes.

**Pass 1 (first build).** The concept landed: awning, tickets, stamps, animal
tags, counter digits, the red stage. Problems found:

1. *Too many competing effects on the kiosk:* the header's bulb rail and the
   stage's top bulb rail sat on top of each other with the scallops between.
2. *The stage did not fill a 1080p TV:* a band of empty cream under it.
3. *Unlit arcade buttons looked muddy* (45 % paint + ink turned orange into
   brown and yellow into olive).
4. *Bungee has no lowercase,* so "29s" became "29S", chart ticks read "16 S",
   receipt values "1.26 S".
5. *Leaderboard stamps and animal-tag fun IQ number were too small* to scan.
6. *A real bug:* my component classes were unlayered CSS, so they beat
   Tailwind utilities; `.sign` forced `display: inline-block` and broke every
   `inline-flex` sign (the session back-link put its arrow above the text).

**Pass 2.** Component classes moved into `@layer components` (fixes 6);
the stage keeps one bulb rail and grows to the bottom of the screen (1, 2);
unlit buttons at 68 % paint (3); seconds and units moved out of Bungee, the
chart's unit became an axis label, receipt values use Nunito (4); bigger
stamps and tag text (5). Critique of pass 2:

7. On non-podium ranks the kiosk showed a tiny "No. 6" stub next to a huge
   "Rank #6": the number twice, at two scales.
8. The idle kiosk content hugged the top of the stage, leaving a dead
   lower-left area on a TV.
9. Hall of Fame scores were small next to the names at 2 m.

**Pass 3.** Ribbon only for the podium, the number alone otherwise (7);
stage content centred vertically (8); larger Hall of Fame names and counters
on wide screens (9). Then the automated checks found one more real issue: the
game-id links of the back-office page (since removed) were 16 px tall (fixed
to a 44 px hit area).

**What still feels generic or weak (honest):**

- The leaderboard is 15-20 identical tickets; the ribbons and the slight
  alternating tilt help, but the long list is still repetitive.
- The confetti falls *over* the result for about 4 s and briefly covers text
  on a win. Kept on purpose (it is short and festive), but it is a trade-off.
- The notch on the phone-sized session header sits at mid-height rather than
  exactly on its tear line.

## Banned-list check (final build)

Checked by eye on every screenshot **and** by a script that walks every
element of `/`, `/result`, `/session/:id`, the back-office page (since
removed) and the 404 page:

| Banned | Result |
|---|---|
| Dark navy page, purple-blue glows, radial glow blobs | none (script: no `radial-gradient` anywhere; navy only as the footer band) |
| Glassmorphism, backdrop blur, blur filters | none (script: no `backdrop-filter`, no `blur()`) |
| Neon grid background | removed (the grid class is gone) |
| Identical rounded-2xl soft-shadow cards | none: tickets, signs, tags, ledger; script found **no shadow with blur > 0** |
| Gradient text / gradient buttons | none (script: no `background-clip: text`); the only CSS gradients are hard-edged stripes (awning, stage, fuse rope) |
| System/Inter look | Bungee + Nunito everywhere (`document.fonts.check` passes) |
| Emoji as icons/illustrations | none (script: no Extended_Pictographic character in any page text); 5 custom SVG animals + a ticket fallback |
| Pill badge for skill | replaced by a tilted rubber stamp |
| Sparkle icons | none |
| Centred symmetric hero | the kiosk idle is a left headline + right Hall of Fame; page titles are left-aligned tilted signs |
| Filler / marketing copy | copy is functional ("The 10 best scores so far. Tap a ticket to see how the game went.") |

## Verification

- **Motion:** bulbs (`bulb-chase`) and buttons (`btn-light`) animate; with
  `document.hidden` the `data-tab-hidden` attribute pauses them
  (`animation-play-state: paused`) and they run again when visible; under
  emulated `prefers-reduced-motion: reduce` the animations are `none` and the
  buttons are shown lit.
- **Focus:** Tab onto the wordmark shows a 3 px solid ink outline plus an
  8 px yellow halo.
- **Tap targets:** every visible link, button and input on all pages is at
  least 44 x 44 px (leaderboard names count as their 100 px ticket); the
  kiosk nickname input and buttons are 56 px.
- **Network:** loading every page of the production build makes **no request
  to another host**; the three woff2 files come from `/assets`.
- **Functionality unchanged:** the Phase J2 kiosk scenario (34 checks: empty
  DB baseline, countdown, pause while typing, save, 409, Close/Skip, newer
  game replaces, 404, phone width) and the Phase K scenario (37 checks: row
  click, chart bars and hollow timeout, tooltip, and the back-office actions
  that were removed later) pass on the redesigned build; only
  their selectors and expected copy were updated.
- **Sizes:** see `docs/FRONTEND.md` ("Design").

---

## Top 10 leaderboard: podium + compact list

The leaderboard page became a **Top 10** (`getLeaderboard(10)`; the kiosk
top 5 and the result page's top-100 rank lookup are unchanged).

### Layout

- **Ranks 1-3 = winners podium**, **ranks 4-10 = compact list**. No
  pagination, tabs or "show more".
- **From 1024 px:** two panes, podium left (`5fr`), list right (`7fr`),
  together capped at **1200 px** so tickets never run edge to edge.
- **Below 1024 px:** one column, podium first.
- **Podium:** rank 1 is the biggest ticket with a painted **"First Place"** sign,
  a 72 px ribbon, the 96 px animal and a 3xl score counter; ranks 2 and 3 are
  smaller tickets **side by side under it** (48 px ribbon, 72 px animal, xl
  counter), stacked on phones. Tilts stay within -0.6deg to +0.6deg.
- **List rows** (one link each, at least 44 px tall): rank stub, name and
  level, a small stamp, the animal tag with a 44 px drawing, the score. One
  line when the list is at least 600 px wide (container query), otherwise two
  tidy lines (name and score / stamp and animal).
- **Ties** keep the shared number (RANK()) and are never merged: the podium
  holds every entry ranked 1-3 in API order (`splitPodium` in
  `src/leaderboard.js`), so a tie at 2 shows two "2" tickets with silver
  ribbons, and a tie for first gives two Champion tickets.
- **Fewer than 4 entries:** the podium alone, centred (max 36 rem), no empty
  list pane. **0 entries:** the empty state, unchanged.
- **No prediction:** "No animal yet" with a faded blank-ticket drawing.
- **Stability:** tickets are keyed by `session_id`, the page structure does
  not change during the 10-second refresh, and the "Out of order" sign is
  laid over the board (absolute) instead of pushing it down. The one-time
  slide-in only runs during the first 1.5 s, so a refresh never re-animates.

**Decision against the brief, and why.** The brief asked for ranks 1-3
"stacked", #1 largest, with the podium fully visible at 1280x720. With the
required sizes (ribbons, a 96 px and two 72 px drawings, nickname, level,
stamp, IQ and counter on every card), three cards stacked vertically are
about 670 px tall: they cannot fit under the header on a 720 px screen. #1
on top with #2 and #3 side by side under it is still a stack (two tiers,
the classic podium shape) and measures **698 px** to the bottom of the podium
at 1280x720 in every test case.

### "Mystery Player"

Was `muted` `#5c5468` (6.90:1, it looked too pale next to real names). Now
`mystery` `#3a3448`: **11.42:1 on ticket paper, 10.14:1 on cream, 8.29:1 on a
animal tag**. It stays secondary by being **regular weight (400) and 0.86 em**
while nicknames are 800 weight, not by being light. One component
(`PlayerName`) is used on the leaderboard, the kiosk Hall of Fame and the
session page.

### Other polish

- The awning is lower from 1024 px (`lg:py-2`, smaller wordmark), which buys
  the vertical space the Top 10 needs on a 1080p screen.
- Animal drawings on tickets are at least 44 px (list), 72 px (#2/#3) and
  96 px (#1).
- **Win confetti** is now a backdrop layer of the red stage: `z-index 0`
  behind the content (`z-index 10`), so it falls around the ticket and behind
  the countdown text, never over text. It ends within 4 s (longest piece
  0.96 s delay + 2.88 s fall = 3.84 s) and is off under reduced motion.

### Critique and revisions (screenshots in `docs/screenshots/top10-pass1/` and `docs/screenshots/top10/`)

Cases tested on a copy database: 0, 1, 2, 3, 4, 7, 10 and 14 games, plus a
tie at ranks 2-3 with a game that has no prediction; at 360x740, 768x1024,
1280x720 and 1920x1080.

**Pass 1.** The hierarchy worked from the start: the eye lands on the
Champion ticket first (biggest card, the sign, the largest counter), and
1920x1080 showed all 10 entries. Problems:

1. At 1280x720 the podium ended at **803-883 px**: the Champion card wrapped
   its score under the animal and the #2/#3 cards were about 320 px tall and
   half empty.
2. In the list, the stamp column clipped "INTERMEDIATE" under the animal tag.
3. At 1280 px, long animal names squeezed player names to "Mys...".

**Revision 1.** Champion counter on the animal line (3xl), #2/#3 cards rebuilt
compact (48 px ribbon, xs stamp, small level sign), small stamp size and fixed
column widths in the list. New problems found in the screenshots:

4. The #2/#3 **score counter overflowed the card edge**: a 5-digit counter
   does not fit next to a 72 px drawing in a half-width card.
5. List tags cut animal names ("Chimpan...", "Bottlenos...").

**Revision 2.** The #2/#3 score got its own line; long animal names may wrap
to two lines (list tags 12 rem, compact text). The measurements then showed:

6. The podium height depended on the data: when a #2/#3 card held "Level 13"
   **and** an "INTERMEDIATE" stamp they wrapped onto two lines, pushing the
   podium to 728 px (8 px past 720).

**Revision 3.** Name and level sit beside the ribbon and the stamp has its own
line, so every #2/#3 card has the same height: the podium bottom is **698 px
at 1280x720 in every case**. Then the 360 px screenshot showed:

7. On phones the fixed list column widths (meant for one-line rows) pushed the
   animal tag **out of the ticket**. My "no sideways scroll" check had not
   caught it (the tag stayed inside the page), so I added a check that no
   element sticks out of its ticket. The fixed widths now apply only in
   one-line mode, and the new check passes for every case at all four sizes.

**What is still weak (honest):**

- **2 m readability of the list on the 1920 TV.** The 1200 px cap keeps the
  list compact: names are 18 px (Mystery Player about 15.5 px), level and IQ
  12 px. Fine at a laptop, small from 2 m. The kiosk `/result` screen is the
  page meant for distance; the podium (30 px name, big counters) reads from
  2 m, the list rows less so.
- **Empty space on the TV.** At 1920x1080 the content ends around 805 px, so
  there is a band of cream above the bunting. It is calm rather than wrong.
- **Truncation.** A 16-character nickname is cut with an ellipsis in list
  rows (the full name has a tooltip and is on the session page).
- **Rotation of the stamps** (-5deg) makes their box slightly larger than
  their layout box; the overflow check allows 6 px for it.

### Verification (real runs, all on the production build)

- 120/120 layout checks (`top10` script, every case and size): entry counts
  (14 games show exactly 10), list pane only with 4+ entries, empty state,
  subtitle text, 1200 px cap, Champion sign, drawings >= 44 px (podium
  97/73/73 px), list rows >= 44 px (78 px), podium fully visible at 1280x720
  (698 px), all 10 inside 1920x1080 (list ends at 804 px), the tie shows two
  rank-2 tickets in API order, "No animal yet" for the game without a prediction,
  no sideways scroll at 360 px, nothing sticks out of a ticket.
- Refresh stability: after a real 10-second refresh the same 10 ticket
  elements are still in the page and none moved.
- Keyboard: Tab reaches a list row link, which shows the ink + yellow ring.
- Confetti: 60 text sample points, **0 covered**; layer `z-index 0`; longest
  piece 3.72 s; after 4 s all 36 animations are finished and invisible.
- No request to another host. The kiosk scenario (34 checks) still passes.

---

## Live game panel (`/live`)

The one place that does **not** use the carnival look: the panel copies the
real control panel (the reference image was not visible to the assistant, so
the written description and its colours were used). Around it, everything
stays carnival: the red stage, the awning, the "Last results" ticket.

- **Layout:** no title in the panel. Top row START | LCD | RESET, vertically
  centred; below, the six buttons in two rows (1 Red, 2 Orange, 3 Yellow /
  4 Green, 5 Blue, 6 Purple) with uppercase colour names only (no notes); a speaker
  grille at the bottom. Phones (panel narrower than 470 px): the LCD goes on
  top with START and RESET side by side under it.
- **Look:** panel `#f1f4f5` with a 6 px `#3e5a6e` border and 32 px radius, a
  hard 6 px ink shadow like every carnival ticket; LCD `#172d3b` with a
  lighter slate border and pale mint monospaced text in a 20 x 4 grid; round
  buttons with a white inner ring, a flat white highlight ellipse and a bold
  white number. Flat fills only: no glow, blur or gradient.
- **Contrast (WCAG):** LCD text 11.69:1, labels 12.10:1, START text 6.31:1,
  RESET text 10.78:1, countdown numeral 14.24:1. The white numbers inside the
  buttons are **below AA** on orange (2.52), yellow (1.88) and green (2.85),
  as on the real panel. They are decoration (the grid is `aria-hidden`); the
  dark label under each button ("YELLOW E4", 12.10:1) carries the meaning.
- **States are never colour alone:** lit = lighter fill + thicker white ring
  + scale 1.06 + a hard outer ring in the button's colour; pressed = press
  animation + ripple; wrong = shake + "OOPS!" on the LCD; spent lives are
  grey AND crossed out; the connection chip has text and a different shape
  per state.

### Critique and revisions (screenshots in `docs/screenshots/live/`, local only)

**Round 1** (`before-revision/`), honest problems found by looking and by the
layout script:

1. A lit button only got lighter: on the TV it read as "faded", the
   opposite of "lit".
2. Button labels were 31.3 px on 1920 (target >= 32 for 2 m).
3. The panel did not fit 1280x720 (ended at 865 px); "Final score...,
   saving..." and the connection chip were below the fold even on 1080p.
4. The countdown numeral and the pills were small next to the LCD.

**Round 2:** outer ring on lit buttons; labels `min(4.2cqi, 3.4vh)`; button
size and gaps also capped by the screen height; status and "Last results" in
the right column; bigger numeral and pills. New problems:

5. The panel moved between states: the LIVE sign appeared in the header and
   wrapped the nav on phones and tablets, the stage centred its content
   vertically, and the fuse bar and progress dots only existed during input.
6. On 768 px the first LCD line touched the LCD border (the font followed the
   panel width, not the LCD width).
7. The DEMO sign was below the panel on phones.

**Round 3 (final, `final/`):** the LIVE sign sits next to the brand and keeps
its space when hidden; the live stage is top-aligned; hearts and dots share
one fixed row and the fuse track is always there; the LCD sizes its text from
its own width (container query), so 20 columns always fit; DEMO is a sticker
on the panel's corner. Measured: LCD 32.2 px and labels 34.4 px on 1920, the
panel ends at 716 px on 1280x720, the same position in every state at every
width, no sideways scroll at 360 px, 0 console errors.

**Does it match the description?** Yes for layout, colours, button style,
LCD and pills. **Is the START/LCD/RESET row balanced?** Yes on TV and
desktop; on phones the stacked version is clearer than three squeezed items.
**Readable from 2 m on 1920?** LCD and labels pass the 32 px target; the
countdown numeral is very large. **Still weak:** the LCD's fourth line is
often empty (honest to a 20 x 4 display, but it looks bottom-heavy); the
white numbers on the light buttons are low contrast by design; a real TV
check is still needed.

---

## "How to play" brochure (`/how-to-play`)

A folded paper brochure laid on the booth: cream paper panels with ink
outlines, hard offset shadows, a painted numbered header (cream number on tent
red), at most 0.6 degrees of rotation, and the arcade colours as list markers
(a coloured ring with the number in ink inside). Visual help instead of words:
a flat inline strip (watch, your turn, next level) drawn with the six button
circles, the three rank stamps, the five animal drawings. No images, no emoji,
no glow or gradients, bundled fonts only.

**Contrast (WCAG):** panel text ink on ticket 16.25:1, page text on cream
14.41:1, step and title numbers cream on tent red 5.57:1, Pro stamp 8.86:1,
Intermediate 7.55:1, Beginner 6.25:1, footer "How to play" cream on midnight
12.87:1, print black on white 21:1. The coloured marker rings are decoration
(yellow is only 1.56:1 against the paper); the number inside each ring is ink
on paper.

**Print (one portrait A4 page):** one "Print this page" button and one
layout, `@page { size: A4 portrait; margin: 12mm; }` ("Headers and footers"
OFF in the print dialog). Black ink on white, two flowing columns, 1.5 px
black panel borders, body 11pt, panel titles 13pt, page title 18pt. The
"Good to know" dots are a thick black border, so they stay solid black with
"Background graphics" off. The QR section is a separate box with a 2.5 px
border at the end of the column flow (bottom right): "Join the booth Wi-Fi
first" (16pt), "Wi-Fi: <name>" or a write-in line (14pt), then the 40 mm QR
with its quiet zone, "Scan to open on your phone" (14pt) and the address
(12pt). Measured with headless Chrome print-to-PDF at the LAN address: 1 page.

### Critique and revisions (screenshots: `docs/screenshots/how-to-play/`, local only)

**Round 1:** looked at 360, 768, 1280x720 and 1920x1080 plus a print preview.

1. Print: the brochure title was missing (the print rule hid every `<header>`,
   including the brochure's own) and it took 2 A4 pages.
2. Print: the rank stamps overlapped their sentences; grid rows stretched to
   the tallest panel and left empty paper.
3. Screen, desktop: the same stretched rows left a mostly empty "Step right
   up!" panel.
4. Result page: "FUN IQ NUMBER 55" in the big display font wrapped into two
   heavy lines.

**Round 2 (final):** only the site header and footer are hidden in print;
panels flow down columns (screen and print) like a real leaflet; smaller
stamps and drawings on paper; the fun IQ label is small with the number big;
stamps stack above their sentence in a narrow panel; on a narrow panel the
animal table uses 32 px drawings so 768 px never scrolls sideways. Measured:
A4 1 page; the printed QR decodes to the LAN address; body text
18 px on phones; every tap target 44 px; no sideways scroll at any size; the
sticky contents stays at the top and moves focus to the panel; all 10 Top 10
entries still fit 1920x1080 and the podium fits 1280x720.

**Honest check:** skimmable in 20 seconds? The numbered headers and the
contents bar make the four answers (play, score, rank, animal) easy to find;
the full read is longer. Reading ease (Flesch, English) per panel: play 100,
how 94, lives 95, score 81, rank 79, animal 92, good 89 (average 90). The
hardest sentence left is "The better that game scored compared with all the
others, the higher your animal." (15 words; it explains a comparison, which is
hard to say more simply). The panel's 20 x 4 display still says "WATCH
SEQUENCE" (the game console's own text, see docs/FRONTEND.md "Visitor text").
