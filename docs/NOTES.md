# Rhythm Rush - Project Notes

## Overview

Rhythm Rush is a 6-button musical memory game. This document is the report for the offline ML phase: synthetic data generation, three trained models, exported JSON artifacts, all metrics, retraining instructions, and limitations. All results use synthetic data and the fixed project seed **42**.

### Current status

- **Phases 1, A2, B, B2, C, and D are complete: synthetic data only.**
- Phase A2 adds `ml/data/players_hidden.csv` for hidden player labels. It is **never a model input**.
- Phase B trained the **Skill Classifier** and the **Animal IQ Matcher**. Phase B2 aligned both exports with the required JSON formats.
- Phase C trained the **Adaptive Difficulty** model. All three ML models now exist.
- Phase D added `docs/session.schema.json` and reorganized this report. No backend, database, or frontend code exists yet.
- The ESP32 hardware/firmware is **not finished**, so there is no real gameplay data yet.
- Python is used **only for offline training**. Production will have no Python. Express will read exported JSON from `/backend/artifacts`.
- The later database is **SQLite** via the `better-sqlite3` package. It uses a local database file, not a database server.
- `ml/data/` is gitignored because it is generated data.

Build order for the whole project:

1. ML models on synthetic data
2. SQLite database
3. Express backend
4. Fake ESP32 uploader
5. React frontend

### Model summary

| Model | Algorithm | Inputs | Output / labels |
|---|---|---|---|
| Adaptive Difficulty | `LinearRegression` | `accuracy` (0-1), `reaction_ratio`, `level` | Steps to add next level, rounded and clamped to 0, 1, 2. Optional: if the server is slow/down, the ESP32 adds +1. |
| Skill Classifier | `DecisionTreeClassifier(max_depth=3)` | the 4 features below | `Beginner`, `Intermediate`, `Pro`. Labels come from the simulator's **hidden player skill**, not from score percentiles. |
| Animal IQ Matcher | `NearestNeighbors(k=1)` on standardized 4 features | the 4 features below | Animal chosen from the matched game's score percentile. UI must say **"just for fun, not a real IQ test"**. |

### Files

| File | Purpose |
|---|---|
| `ml/game_rules.py` | Single source of truth for all game constants and formulas. |
| `ml/simulate_games.py` | Creates fake-but-realistic finished games using `game_rules.py`. |
| `ml/train_difficulty.py` | Trains the Adaptive Difficulty regression and writes `backend/artifacts/difficulty.json`. |
| `ml/train_skill.py` | Trains the Skill Classifier and writes `backend/artifacts/skill.json`. |
| `ml/train_animal.py` | Builds the standardized nearest-neighbor lookup and writes `backend/artifacts/animal.json`. |
| `ml/check_exports.py` | Applies all three JSON exports in plain Python and compares them with sklearn on 100 random games. |
| `ml/data/games.csv` | One row per finished game: the 4 model features plus labels and audit fields. Gitignored. |
| `ml/data/attempts.csv` | One row per level attempt, useful for checking the simulation. Gitignored. |
| `ml/data/players_hidden.csv` | One row per game with hidden labels. **Labels only, never a model input.** Gitignored. |
| `backend/artifacts/difficulty.json` | Production artifact for the difficulty endpoint later. |
| `backend/artifacts/skill.json` | Production artifact for `/api/skill` later. |
| `backend/artifacts/animal.json` | Production artifact for `/api/animal` later. |
| `docs/NOTES.md` | This report: assumptions, data dictionary, results, limitations. |
| `docs/session.schema.json` | JSON Schema (draft 2020-12) for the ESP32 session record. |
| `.gitignore` | Keeps generated ML data, Python caches, and `.env` out of git. |

### Commands

Run the rules self-check:

```bash
python ml/game_rules.py
```

Regenerate the default synthetic data (2,000 games, seed 42):

```bash
python ml/simulate_games.py
```

This writes `games.csv`, `attempts.csv`, and `players_hidden.csv`.

Other sizes/seeds are allowed for experiments, but **42 is the project seed**:

```bash
python ml/simulate_games.py --games 5000 --seed 42
```

Train all three models and verify the exports:

```bash
python ml/train_skill.py
python ml/train_animal.py
python ml/train_difficulty.py
python ml/check_exports.py
```

### Game rules implemented

- 6 buttons: 1 Red, 2 Orange, 3 Yellow, 4 Green, 5 Blue, 6 Purple.
- Start with 3 lives at Level 1.
- Sequence length = `level + 2`.
- Per-press deadline = `max(1.5, 3.0 - 0.2 * (level - 1))` seconds.
- An attempt result is `pass`, `wrong`, or `timeout`.
- A failed attempt loses 1 life and retries the **same** level.
- 3 lives lost = game over. Clearing Level 15 = win.
- Points for a passed level = `100 * level + speed_bonus`.
- `speed_bonus = round(50 * (1 - response_time / (sequence_length * deadline)))`, clamped to `0..50`.
- `response_time` = time from the end of playback to the last correct press.
- The theoretical maximum score is `100 * (1 + 2 + ... + 15) + 15 * 50 = 12,750`.

### Where the rules live

All constants and formulas are in `ml/game_rules.py`. `simulate_games.py` imports them and never copies them. Training scripts do the same.

Important helpers:

- `sequence_length(level)`
- `deadline_seconds(level)`
- `speed_bonus(response_seconds, seq_len, deadline)`
- `points_for_pass(level, bonus)`
- `success_rate(successful_rounds, failed_attempts)`
- `reaction_ratio(avg_reaction_sec, level)`

### The 4 model features

| Feature | Definition |
|---|---|
| `final_score` | Total points at the end of the game. |
| `avg_reaction_sec` | Average over **pass** attempts of `(response_ms / 1000) / sequence_length`. If there were no pass attempts, use `3.0`. |
| `success_rate` | `successful_rounds / (successful_rounds + failed_attempts)`. If both are zero, use `0.0`. |
| `highest_sequence_length` | The final sequence length reached (`final_level_attempted + 2`), even if the final attempt failed. |

### Session record

The ESP32 will later send a session like this:

```json
{
  "session_id": "RR01-000127",
  "device_id": "RR01",
  "outcome": "game_over",
  "final_score": 127,
  "highest_level_completed": 1,
  "final_sequence_length": 4,
  "successful_rounds": 1,
  "failed_attempts": 3,
  "duration_seconds": 42,
  "attempts": [
    {"level": 1, "result": "pass", "response_ms": 4100},
    {"level": 2, "result": "wrong", "response_ms": 2100},
    {"level": 2, "result": "timeout", "response_ms": 0}
  ]
}
```

This exact record is also stored as an `examples` entry in `docs/session.schema.json`.

Mapping to the training table:

| Session field | `games.csv` column |
|---|---|
| `session_id` | `session_id` |
| `final_score` | `final_score` |
| `highest_level_completed` | `successful_rounds` (equal under these rules) |
| `final_sequence_length` | `highest_sequence_length` |
| `successful_rounds` | `successful_rounds` |
| `failed_attempts` | `failed_attempts` |
| `attempts` | `attempts.csv` rows |
| `device_id` | Not in the Phase 1 training table. Session metadata, not a model feature. |
| `duration_seconds` | Not in the Phase 1 training table. Session metadata, not a model feature. |

The Phase 1 synthetic CSV intentionally keeps only the fields needed for training, feature auditing, and label auditing. The later backend can export extra session metadata if needed.

### Security and configuration

- No secrets belong in code.
- The later backend must use `.env` and keep `.env.example` updated.
- `.gitignore` excludes `ml/data/`, `backend/data/`, `*.db`, `.env`, `node_modules/`, `__pycache__/`, and `.venv/`.

## Synthetic data (how it was made)

`ml/simulate_games.py` creates fake-but-realistic finished games using only the constants and formulas imported from `ml/game_rules.py`. Defaults are **2,000 games with seed 42**, written to three gitignored CSVs:

- `games.csv`: one row per finished game.
- `attempts.csv`: one row per level attempt, in game order.
- `players_hidden.csv`: one row per game with hidden labels only.

Each fake player gets a hidden skill value in `0..1` and a hidden skill group: `Beginner`, `Intermediate`, or `Pro`. The group ranges overlap on purpose. Press speed, correctness probability, lapse probability, and skill ranges are plausible for a rhythm game but are **not measured from humans**. A failed attempt loses a life and retries the same level; a game ends after 3 failed attempts or a win at Level 15.

### Timing interpretation

The rules give a **per-press** deadline, so the simulator checks each individual press against that deadline. A press that is too slow produces `timeout`.

The `response_time` for a whole attempt is the sum of the individual press times, which matches "time from end of playback to last correct press" for a sequential sequence.

Response values in `attempts.csv` follow the session-record convention:

- `pass`: total response time for the sequence, in milliseconds.
- `wrong`: time until the wrong press, in milliseconds.
- `timeout`: `0` (matching the example session record).

`avg_press_ms` is only filled for passes because the model feature only uses pass attempts.

### Hidden player labels (Phase A2)

`ml/data/players_hidden.csv` has one row per game:

| Column | Description |
|---|---|
| `session_id` | Links to `games.csv` and `attempts.csv`. |
| `player_type` | Hidden skill group: `Beginner`, `Intermediate`, or `Pro`. Same value as `games.csv` `skill_label`. |
| `hidden_skill` | The simulator's hidden skill value, 0-1. This is the value used to generate the player's performance. |
| `hidden_speed` | A 0-1 speed score derived from the simulator's existing `press_mean` (expected seconds per press). Higher = faster. |

Important rules for this file:

- It is **only for labels/analysis**. Never feed it to a model as an input.
- The models use the 4 gameplay features, not the hidden values.
- `hidden_speed` is not a new random draw. The simulator already uses `press_mean` to generate press times; the CSV stores a normalization of that same value:
  `clip((1.15 - press_mean) / (1.15 - 0.45), 0, 1)`.
- Adding this file did **not** change the RNG stream. `games.csv` and `attempts.csv` were byte-identical before and after:
  - `games.csv` SHA-256: `44824524BC650B8E39A9457AB4212FBDA0A77F2A729E536A8CA4EC2ED403CDAE`
  - `attempts.csv` SHA-256: `2542EFA84EBDB26001BF46D8790930A0D9343FAE66E36500C07E67953DB5AE75`
  - `players_hidden.csv` SHA-256: `B9CCAF42ADB090610B5BA482949B2363AE3F573D223475180E5D05A466C94A1E`

### Data dictionary: `ml/data/games.csv`

One row per finished game.

| Column | Type | Description |
|---|---|---|
| `session_id` | string | Unique synthetic session ID, e.g. `SYN-000001`. |
| `final_score` | integer | Total score. |
| `avg_reaction_sec` | real | Per-press average reaction time over passed attempts, or `3.0`. |
| `success_rate` | real | Passed attempts / all attempts. |
| `highest_sequence_length` | integer | Final sequence length reached. |
| `skill_label` | string | Hidden synthetic skill group: `Beginner`, `Intermediate`, `Pro`. Training label for the classifier. |
| `next_level_steps` | integer | Bootstrap difficulty target: 0, 1, or 2. |
| `outcome` | string | `win` or `game_over`. Audit field. |
| `final_level_attempted` | integer | Level of the last attempt. Difficulty-model `level` input. |
| `successful_rounds` | integer | Number of passed attempts. |
| `failed_attempts` | integer | Number of failed attempts. |
| `total_attempts` | integer | `successful_rounds + failed_attempts`. |

### Data dictionary: `ml/data/attempts.csv`

One row per level attempt, in game order.

| Column | Type | Description |
|---|---|---|
| `session_id` | string | Links to `games.csv`. |
| `level` | integer | Level attempted. |
| `attempt_number` | integer | Try number at this level (increments after a failure). |
| `sequence_length` | integer | `level + 2`. |
| `deadline_sec` | real | Per-press deadline for this level. |
| `result` | string | `pass`, `wrong`, or `timeout`. |
| `response_ms` | integer | Pass: total response time. Wrong: time until the wrong press. Timeout: `0`. |
| `avg_press_ms` | real or blank | `response_ms / sequence_length` for a pass; blank for a failure. |
| `presses_attempted` | integer | Presses attempted before the attempt ended. |
| `presses_correct` | integer | Correct presses before the attempt ended. |
| `fail_press` | integer or blank | 1-based press number where the attempt failed; blank for a pass. |
| `speed_bonus` | integer | 0..50 bonus for a pass; 0 for a failure. |
| `points` | integer | `100 * level + speed_bonus` for a pass; 0 for a failure. |
| `lives_after` | integer | Lives remaining after the attempt. |
| `score_after` | integer | Cumulative score after the attempt. |

### Snapshot of the default generated data

Defaults: 2,000 games, seed 42.

| Item | Value |
|---|---|
| Games | 2,000 |
| Level attempts | 24,003 |
| Hidden-player rows | 2,000 |
| `hidden_skill` range | 0.050065 - 0.984973 |
| Passes | 18,593 (77.5%) |
| Wrong presses | 4,824 (20.1%) |
| Timeouts | 586 (2.4%) |
| Wins | 329 (16.45%) |
| Game overs | 1,671 (83.55%) |
| Mean final score | 5,821.79 |
| Median final score | 4,775.50 |
| Score range | 0 - 12,532 (theoretical max 12,750) |
| Mean final level attempted | 10.13 |

Skill labels:

| Label | Games | Win rate | Mean score | Mean final level |
|---|---|---|---|---|
| Beginner | 659 | 0.9% | 3,215.65 | 7.73 |
| Intermediate | 813 | 11.4% | 5,805.19 | 10.29 |
| Pro | 528 | 43.6% | 9,100.11 | 12.88 |

Difficulty bootstrap target:

| `next_level_steps` | Games |
|---|---|
| 0 | 403 |
| 1 | 1,122 |
| 2 | 475 |

These numbers change if `--games` or `--seed` changes. Project results must use seed 42 unless there is a documented reason to change it.

### Assumptions about the synthetic data

1. **`accuracy` for the difficulty model means `success_rate`.** No separate accuracy field is defined in the feature list.
2. **`level` for the difficulty model means `final_level_attempted`.** It is the level of the last attempt and equals `highest_sequence_length - 2`.
3. **`reaction_ratio = avg_reaction_sec / deadline_seconds(level)`.** The model input is not clamped. The bootstrap target clamps the ratio at 1.0 when computing its performance score.
4. **The difficulty target is a bootstrap rule, not real truth.** It exists only because no real adaptive-difficulty decisions exist yet.
5. **Skill labels come from the hidden simulator skill, not score percentiles.** The generator chooses a hidden group and then generates performance from it. Ranges overlap on purpose.
6. **Failure response times follow the session example.** Wrong attempts record time until the wrong press; timeouts record `0`.
7. **Per-press deadline interpretation.** Each individual press is checked against the deadline, and the total response is the sum of press times.
8. **The fake player parameters are invented.** Press speed, correctness probability, lapse probability, and skill ranges are plausible for a rhythm game but are not measured from humans.
9. **Session metadata is intentionally omitted from the training table.** `device_id` and `duration_seconds` are not model features. Later backend exports can add them for audit.
10. **The animal matcher is a fun feature.** The UI must say "just for fun, not a real IQ test".
11. **`players_hidden.csv` is labels-only.** It exists so later phases can study or re-derive labels. It must never be an input feature at training or inference time.
12. **`hidden_speed` is a normalized existing value, not a new random draw.** It is derived from the simulator's `press_mean`, so the RNG stream and the other CSV files stay unchanged.

## Model 1 Adaptive Difficulty

Phase C trained the Adaptive Difficulty model and exported `backend/artifacts/difficulty.json`. The model is a `LinearRegression` that recommends how many levels to add next.

### Inputs and target

| Item | Value |
|---|---|
| Input 1 | `accuracy` = `success_rate` (0-1) |
| Input 2 | `reaction_ratio = avg_reaction_sec / deadline_seconds(final_level_attempted)` |
| Input 3 | `level` = `final_level_attempted` |
| Target | `next_level_steps` read directly from `games.csv` |
| Split | 80/20, seed 42: 1,600 train rows, 400 test rows |
| Model | `LinearRegression` |

- `reaction_ratio` is built with the helper in `ml/game_rules.py`; no game constants are copied.
- Forbidden inputs are asserted in code: `skill_label`, `player_type`, `hidden_skill`, `hidden_speed`.
- The model input `reaction_ratio` is not clamped. Only the bootstrap target clamps its ratio at 1.0.

### Bootstrap target

The difficulty target is **not real ground truth**. It is a bootstrap rule so the ML phase has a target to learn from. It should be replaced when real gameplay/difficulty decisions exist.

The rule uses the same inputs the model will see:

```text
ratio = min(avg_reaction_sec / deadline_seconds(level), 1.0)
performance = 0.75 * accuracy + 0.25 * (1 - ratio)

performance >= 0.74  -> 2
performance >= 0.62  -> 1
otherwise            -> 0
```

The thresholds were chosen so the synthetic data contains a mix of 0, 1, and 2 instead of almost always 1. They are a project choice, not a game rule.

Class split of `next_level_steps` in the full data:

| Steps | Games | % |
|---|---|---|
| 0 | 403 | 20.15% |
| 1 | 1,122 | 56.10% |
| 2 | 475 | 23.75% |

### Results

- **R2: 0.7883**
- **MAE: 0.2542**

Exported model:

| Field | Value |
|---|---|
| `intercept` | -0.665421 |
| weight `accuracy` | 1.251040 |
| weight `reactionRatio` | -0.939677 |
| weight `level` | 0.121498 |

**Important:** `next_level_steps` is a **bootstrap rule**, not real player behavior. The R2 above only shows how well `LinearRegression` reproduces that rule. It does **not** show that the model understands real players, and it is not evidence that the recommended progression is good game design.

`difficulty.json` shape:

```json
{
  "version": 1,
  "intercept": -0.665421,
  "weights": {
    "accuracy": 1.251040,
    "reactionRatio": -0.939677,
    "level": 0.121498
  }
}
```

### `predict_steps` examples

`predict_steps(accuracy, reaction_ratio, level)` rounds half up and clamps to `0..2`.

| Player | accuracy | reaction_ratio | level | steps |
|---|---:|---:|---:|---:|
| Fast and accurate | 0.95 | 0.40 | 12 | 2 |
| Average | 0.80 | 0.80 | 8 | 1 |
| Struggling | 0.40 | 1.30 | 4 | 0 |
| Slow but accurate | 0.95 | 1.20 | 12 | 1 |
| Fast but sloppy | 0.40 | 0.40 | 6 | 0 |

The brief also allows an optional ESP32 fallback: if the server is slow or down, the ESP32 adds +1. That fallback is not part of the Python export.

### Export verification

`ml/check_exports.py` rebuilds the same LinearRegression split and compares `difficulty.json` with sklearn on the same 100 random games:

- Intercept and weights: exact match.
- Raw predictions: **100/100** match (maximum difference `2.22e-16`).
- Rounded and clamped steps: **100/100** match.

## Model 2 Skill Classifier

Phase B trained the Skill Classifier and exported `backend/artifacts/skill.json`. Phase B2 confirmed that the export already matched the required JSON format.

### Inputs and labels

- Target: `player_type` from `players_hidden.csv`; this is the simulator's hidden skill class, **not** a score percentile.
- Inputs, in exact order: `final_score`, `avg_reaction_sec`, `highest_sequence_length`, `success_rate`.
- Forbidden inputs are asserted in code: `skill_label`, `player_type`, `hidden_skill`, `hidden_speed`, `next_level_steps`.
- Split: 80/20 stratified, seed 42: 1,600 train rows, 400 test rows.
- Model: `DecisionTreeClassifier(max_depth=3)`.

Class counts in the full data:

| Class | Games |
|---|---|
| Beginner | 659 |
| Intermediate | 813 |
| Pro | 528 |

### Results

**Accuracy: 0.6650 (66.50%)**, which is 266 correct out of 400 held-out games.

Confusion matrix (rows = true, columns = predicted):

| True \ Predicted | Beginner | Intermediate | Pro |
|---|---|---|---|
| Beginner | 111 | 21 | 0 |
| Intermediate | 43 | 102 | 18 |
| Pro | 0 | 52 | 53 |

What the confusion matrix shows:

- **Beginner recall is 84.1% (111/132).** All 21 Beginner errors are predicted Intermediate; none are predicted Pro.
- **Intermediate recall is 62.6% (102/163).** Its errors split between Beginner (43) and Pro (18).
- **Pro recall is 50.5% (53/105).** Half of the true Pro games are predicted Intermediate; none are predicted Beginner.
- **No Beginner/Pro cross-errors.** Mistakes stay between neighbouring classes, which is expected because the hidden skill ranges overlap on purpose.
- **Pro is under-detected.** The tree mostly splits on `avg_reaction_sec` (root threshold `0.78`), so slower but otherwise strong games can look Intermediate. A depth-3 tree has at most 8 leaves, which limits how finely it can separate the overlapping groups.
- The exported tree uses only `avg_reaction_sec` and one `final_score` split. `success_rate` and `highest_sequence_length` are allowed inputs but are not selected at depth 3. That is a model choice, not a data leak; the assert still guarantees forbidden columns are absent.

### Export shape

`skill.json` has 15 nodes. An internal node goes **left when `value <= threshold`**, otherwise right. Leaf nodes contain a class name.

```json
{
  "version": 1,
  "features": ["final_score", "avg_reaction_sec", "highest_sequence_length", "success_rate"],
  "nodes": [
    {"id": 0, "feature": 1, "threshold": 0.78, "left": 1, "right": 8},
    {"id": 1, "leaf": "Intermediate"}
  ]
}
```

Required fields are `version`, `features`, and `nodes`. Internal nodes use `id`, `feature`, `threshold`, `left`, and `right`; leaf nodes use `id` and `leaf`.

### Export verification

`ml/check_exports.py` walks the exported tree in plain Python (no sklearn prediction code) and checks 100 random games with seed 42:

- Skill tree: **100/100** predictions match sklearn.

## Model 3 Animal IQ Matcher

Phase B built the Animal IQ Matcher and exported `backend/artifacts/animal.json`. Phase B2 changed the export to the required top-level `mean`, `std`, and `rows` shape.

### Method

- Script: `ml/train_animal.py`.
- Fit on all 2,000 games. This is a lookup-style nearest-neighbor model, so there is no train/test split.
- The 4 features are standardized with `StandardScaler`; the full-data mean/std are saved in the JSON.
- `score_percentile` is computed with `pandas.rank(pct=True, method="average")`. The observed range is `0.001250` to `0.999750`, which is effectively 0-1.
- Express must standardize the request with the saved mean/std, find the nearest row by Euclidean distance, then map that row's percentile through `tiers`.
- The UI must clearly say **"just for fun, not a real IQ test"**.

### Animal score percentiles

The maximum score is about **12,750**, so the animal matcher **must use score percentiles, not fixed score numbers**. The percentile tiers are:

| Score percentile | Animal | IQ range |
|---|---|---|
| Top 10% | Chimpanzee | 90-100 |
| Next 15% | Bottlenose Dolphin | 80-90 |
| Next 20% | Elephant | 70-80 |
| Next 25% | Orangutan | 60-70 |
| Remaining 30% | Pig | 50-60 |

Animal tier counts from the 2,000 percentiles:

| Animal | Games |
|---|---|
| Chimpanzee | 198 |
| Bottlenose Dolphin | 303 |
| Elephant | 400 |
| Orangutan | 499 |
| Pig | 600 |

### Export shape

```json
{
  "version": 1,
  "mean": [5821.794, 0.792514, 12.132, 0.740551],
  "std": [3970.274996, 0.160570, 3.623614, 0.129603],
  "rows": [
    {
      "id": "SYN-000001",
      "features": [12459.0, 0.698, 17.0, 0.938],
      "score_percentile": 0.8775
    }
  ],
  "features": ["final_score", "avg_reaction_sec", "highest_sequence_length", "success_rate"],
  "tiers": [
    {"percentile_min": 0.90, "animal": "Chimpanzee", "iq_range": "90-100"},
    {"percentile_min": 0.75, "animal": "Bottlenose Dolphin", "iq_range": "80-90"},
    {"percentile_min": 0.55, "animal": "Elephant", "iq_range": "70-80"},
    {"percentile_min": 0.30, "animal": "Orangutan", "iq_range": "60-70"},
    {"percentile_min": 0.00, "animal": "Pig", "iq_range": "50-60"}
  ]
}
```

The required export fields are `version`, `mean`, `std`, and `rows`; `features` and `tiers` are extra metadata. `rows` is ordered by `session_id`, and each row contains the session id, the 4 raw features, and the score percentile.

### Export verification

`ml/check_exports.py` re-implements nearest-neighbor distance in plain Python and checks 100 random games with seed 42:

- Animal mean/std, row ids, row features, and percentiles: exact match with sklearn/pandas.
- Nearest neighbor: **100/100** distances match sklearn. 98 indices match exactly; 2 are equal-distance ties caused by duplicate feature rows, which produce the same percentile and animal.
- Jittered unseen-style queries: **100/100** distances match sklearn.
- Animal tier boundaries and all 2,000 percentile mappings are valid.

## Metrics (all numbers so far)

### Data metrics

| Metric | Value |
|---|---|
| Games | 2,000 |
| Level attempts | 24,003 |
| Hidden-player rows | 2,000 |
| Passes | 18,593 (77.5%) |
| Wrong presses | 4,824 (20.1%) |
| Timeouts | 586 (2.4%) |
| Wins | 329 (16.45%) |
| Game overs | 1,671 (83.55%) |
| Mean final score | 5,821.79 |
| Median final score | 4,775.50 |
| Minimum final score | 0 |
| Maximum final score | 12,532 |
| Theoretical maximum score | 12,750 |
| Mean final level attempted | 10.13 |
| `hidden_skill` minimum | 0.050065 |
| `hidden_skill` maximum | 0.984973 |

Skill-label metrics:

| Label | Games | Win rate | Mean score | Mean final level |
|---|---|---|---|---|
| Beginner | 659 | 0.9% | 3,215.65 | 7.73 |
| Intermediate | 813 | 11.4% | 5,805.19 | 10.29 |
| Pro | 528 | 43.6% | 9,100.11 | 12.88 |

### Model 1: Adaptive Difficulty metrics

| Metric | Value |
|---|---|
| Train rows | 1,600 |
| Test rows | 400 |
| R2 | 0.7883 |
| MAE | 0.2542 |
| Intercept | -0.665421 |
| Weight `accuracy` | 1.251040 |
| Weight `reactionRatio` | -0.939677 |
| Weight `level` | 0.121498 |
| `next_level_steps = 0` | 403 games (20.15%) |
| `next_level_steps = 1` | 1,122 games (56.10%) |
| `next_level_steps = 2` | 475 games (23.75%) |

### Model 2: Skill Classifier metrics

| Metric | Value |
|---|---|
| Train rows | 1,600 |
| Test rows | 400 |
| Accuracy | 0.6650 (66.50%) |
| Correct test games | 266 of 400 |
| Beginner recall | 84.1% (111/132) |
| Intermediate recall | 62.6% (102/163) |
| Pro recall | 50.5% (53/105) |
| Exported tree nodes | 15 |
| Tree depth | 3 (maximum 8 leaves) |
| Root split | `avg_reaction_sec <= 0.78` |

Skill confusion matrix:

| True \ Predicted | Beginner | Intermediate | Pro |
|---|---|---|---|
| Beginner | 111 | 21 | 0 |
| Intermediate | 43 | 102 | 18 |
| Pro | 0 | 52 | 53 |

### Model 3: Animal IQ Matcher metrics

| Metric | Value |
|---|---|
| Games in lookup | 2,000 |
| Mean (4 features) | [5821.794, 0.792514, 12.132, 0.740551] |
| Std (4 features) | [3970.274996, 0.160570, 3.623614, 0.129603] |
| Score percentile minimum | 0.001250 |
| Score percentile maximum | 0.999750 |
| Tier percentile minimums | 0.90, 0.75, 0.55, 0.30, 0.00 |
| Chimpanzee games | 198 |
| Bottlenose Dolphin games | 303 |
| Elephant games | 400 |
| Orangutan games | 499 |
| Pig games | 600 |

### Export verification metrics

All checks use 100 random games with seed 42.

| Check | Result |
|---|---|
| Skill tree predictions | 100/100 match sklearn |
| Difficulty intercept and weights | Exact match with sklearn |
| Difficulty raw predictions | 100/100 match; maximum difference 2.22e-16 |
| Difficulty rounded and clamped steps | 100/100 match |
| Animal mean/std | Exact match with sklearn |
| Animal rows | 2,000 ids and features match `games.csv` |
| Animal percentiles | Exact match with pandas |
| Nearest-neighbor distances | 100/100 match sklearn |
| Nearest-neighbor indices | 98 exact matches; 2 equal-distance ties |
| Jittered queries | 100/100 distances match sklearn |
| Animal tiers | 5 boundaries valid; all 2,000 percentiles map to an animal |

## How to retrain with real data

1. Export real finished sessions from the backend to the **same columns** as `games.csv`, `attempts.csv`, and `players_hidden.csv`.
2. Recompute `avg_reaction_sec`, `success_rate`, and `highest_sequence_length` from the session/attempt rows using `ml/game_rules.py`. Keep the documented definitions:
   - `avg_reaction_sec` = average over **pass** attempts of `(response_ms / 1000) / sequence_length`, or `3.0` if there are no passes.
   - `success_rate` = `successful_rounds / (successful_rounds + failed_attempts)`, or `0.0` if both are zero.
   - `highest_sequence_length` = `final_sequence_length`.
3. Provide real `skill_label` values through an agreed labeling process. Do not derive them from score percentiles. `players_hidden.csv` is labels-only; hidden labels exist only for synthetic data.
4. For `next_level_steps`, either keep the documented bootstrap rule or replace it with the game designer's real desired progression. The current target is a bootstrap rule, not ground truth.
5. Keep seed **42** for reproducible experiments unless a new seed is documented.
6. Rerun the three training scripts, then the export checker:

```bash
python ml/train_skill.py
python ml/train_animal.py
python ml/train_difficulty.py
python ml/check_exports.py
```

7. Write JSON only to `/backend/artifacts`. Never add a Python server to production; Express reads the exported JSON.

The game itself must still use `ml/game_rules.py` formulas when computing features, and real sessions must follow `docs/session.schema.json`.

## Limitations

- **Everything is trained on synthetic data.** Good model scores on this data do **not** prove the models work on real players.
- **The difficulty target is a bootstrap rule.** R2 and MAE only measure how well the model reproduces that rule, not real player behavior or good game design.
- **Difficulty is trained on whole-game aggregates but used mid-game.** The model learns from finished-game values such as final success rate and final level, but in play it must recommend the next step before the game is over. Its mid-game inputs may be noisier or differently distributed than training rows.
- **`success_rate` and `highest_sequence_length` overlap with score.** A game ends after 3 failed attempts, so these features are partly consequences of the same events that determine `final_score`; they are not independent measurements.
- **The skill classes overlap in the simulator.** This is why accuracy is only **66.5%** and Pro recall is about **50.5%** (53/105). Mistakes stay between neighbouring classes; no Beginner game is predicted Pro and no Pro game is predicted Beginner.
- **The skill classifier learns the simulator's hidden skill definition.** Real labels will need another source, such as a coach or a clearly documented rule.
- **The difficulty target is a heuristic.** It may recommend progression that the game designer does not agree with.
- **The synthetic data has cleaner patterns than real play.** Real hardware may add input latency, missed presses, and noisier timing.
- **Timeouts are less common than wrong presses** in the generated data because fake players are fairly accurate.
- **Score tiers must be computed as percentiles from the current dataset.** Fixed score cutoffs would break because the maximum score is about 12,750 and the distribution can change.
- **Hidden labels only exist for synthetic data.** Real sessions will not have `hidden_skill` or `hidden_speed` unless the game collects or estimates them separately.
- **The animal IQ matcher is for fun only.** It is **not a real IQ measurement**, and the UI must say so.
- **There is no real ESP32 data, database, backend, or frontend yet.** Phase D only adds documentation and the session schema.
