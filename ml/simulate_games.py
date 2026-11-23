#!/usr/bin/env python3
"""
Rhythm Rush - synthetic game simulator (Phase 1).

The ESP32 hardware is not finished, so there is no real gameplay data yet.
This script creates fake-but-realistic finished games that follow the Rhythm
Rush rules. Later phases train the three AI/ML models on these CSV files.

All game constants and formulas come from ml/game_rules.py. Do not copy them
into this file.

Outputs
-------
ml/data/games.csv          one row per finished game (features + labels)
ml/data/attempts.csv       one row per level attempt (analysis/debugging)
ml/data/players_hidden.csv hidden player labels ONLY (never a model input)

Run from the project root:
    python ml/simulate_games.py
    python ml/simulate_games.py --games 2000 --seed 42
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from game_rules import (
    DEFAULT_AVG_REACTION_SEC,
    MAX_LEVEL,
    MAX_SPEED_BONUS,
    MIN_DEADLINE_MS,
    START_LIVES,
    deadline_seconds,
    max_deadline_ms,
    next_deadline_ms,
    points_for_pass,
    reaction_ratio,
    sequence_length,
    speed_bonus,
    success_rate,
)

# The CSV columns are listed here so the output order is always the same.
GAME_COLUMNS = [
    "session_id",
    "final_score",
    "avg_reaction_sec",
    "success_rate",
    "highest_sequence_length",
    "skill_label",
    "next_level_steps",
    "outcome",
    "final_level_attempted",
    "successful_rounds",
    "failed_attempts",
    "total_attempts",
]

ATTEMPT_COLUMNS = [
    "session_id",
    "level",
    "attempt_number",
    "sequence_length",
    "deadline_sec",
    "result",
    "response_ms",
    "avg_press_ms",
    "presses_attempted",
    "presses_correct",
    "fail_press",
    "speed_bonus",
    "points",
    "lives_after",
    "score_after",
]

# This file is for labels/analysis later. It must never be a model input.
HIDDEN_PLAYER_COLUMNS = [
    "session_id",
    "player_type",
    "hidden_skill",
    "hidden_speed",
]


# ---------------------------------------------------------------------------
# Fake player generation
# ---------------------------------------------------------------------------

# press_mean is the simulator's latent speed (seconds per press). The label
# file reports a 0..1 speed score, so these bounds convert the existing
# press_mean value. No extra random numbers are drawn for this.
PRESS_MEAN_FASTEST = 0.18
PRESS_MEAN_SLOWEST = 0.62


def make_player(rng: np.random.Generator) -> dict:
    """
    Create the hidden "true ability" of a fake player.

    Beginner / Intermediate / Pro are the ground-truth skill labels that the
    classifier will learn later. The skill ranges overlap on purpose so the
    data is not unrealistically clean.

    The simulator has one hidden skill draw. press_mean is the hidden speed
    value used to generate press times, so hidden_speed is just a 0..1
    normalization of that same value. Adding it does not change the RNG stream.
    """
    label = rng.choice(
        ["Beginner", "Intermediate", "Pro"],
        p=[0.35, 0.40, 0.25],
    )

    if label == "Beginner":
        skill = rng.uniform(0.05, 0.50)
    elif label == "Intermediate":
        skill = rng.uniform(0.35, 0.80)
    else:
        skill = rng.uniform(0.65, 0.99)

    # Calibrated on the first real games on the box (November 2026): real
    # players press fast (about 0.25-0.4 s per button) but forget the pattern
    # once it is longer than they can hold. Nobody won the first 10 games;
    # most ended at levels 3-5 (sequences of 5-7 buttons).
    press_mean = 0.60 - 0.40 * skill + rng.normal(0.0, 0.03)
    press_sd = 0.10

    # Memory span: how many buttons the player recalls reliably (about 3-6).
    # Presses inside it are almost always right; beyond it, often wrong.
    span = 2.6 + 3.0 * skill + rng.normal(0.0, 0.5)
    p_correct = 0.975 + 0.02 * skill      # inside the span
    p_beyond = 0.35 + 0.35 * skill         # past the span

    # Everyone has an occasional "brain lapse" (a slow press). Beginners have
    # a few more lapses. With the box's shrinking time limit this creates the
    # realistic timeouts.
    lapse_prob = 0.03 + 0.04 * (1.0 - skill)

    # Higher = faster. This uses press_mean, which is already part of the
    # simulator's hidden player values; no new random draw is made.
    hidden_speed = float(
        np.clip(
            (PRESS_MEAN_SLOWEST - press_mean)
            / (PRESS_MEAN_SLOWEST - PRESS_MEAN_FASTEST),
            0.0,
            1.0,
        )
    )

    return {
        "skill_label": str(label),
        "skill": float(skill),
        "hidden_speed": hidden_speed,
        "press_mean": float(press_mean),
        "press_sd": float(press_sd),
        "p_correct": float(p_correct),
        "p_beyond": float(p_beyond),
        "span": float(span),
        "lapse_prob": float(lapse_prob),
    }


# ---------------------------------------------------------------------------
# One level attempt
# ---------------------------------------------------------------------------

def simulate_attempt(rng: np.random.Generator, level: int, player: dict, deadline_ms: int) -> dict:
    """
    Simulate one try at one level with the box's current time per press.

    A press can be:
      - too slow  -> result "timeout" (the per-press deadline is exceeded)
      - wrong     -> result "wrong"
    If every press is correct and on time -> result "pass".

    The game checks presses in order and stops at the first failure.
    """
    seq_len = sequence_length(level)
    deadline = deadline_ms / 1000

    # Reaction time for each press, in seconds.
    press_times = rng.normal(player["press_mean"], player["press_sd"], size=seq_len)
    lapses = rng.random(seq_len) < player["lapse_prob"]
    if lapses.any():
        press_times[lapses] += rng.normal(0.80, 0.20, size=int(lapses.sum()))
    press_times = np.clip(press_times, 0.12, None)

    # Was each button press the correct button? Harder past the memory span.
    p_each = np.where(np.arange(seq_len) < player["span"], player["p_correct"], player["p_beyond"])
    correct = rng.random(seq_len) < p_each

    elapsed = 0.0
    presses_correct = 0

    for index in range(seq_len):
        elapsed += float(press_times[index])

        if press_times[index] > deadline:
            # The ESP32 sends response_ms = 0 for a timeout.
            return {
                "sequence_length": seq_len,
                "deadline_sec": round(deadline, 3),
                "result": "timeout",
                "response_ms": 0,
                "avg_press_ms": None,
                "presses_attempted": index + 1,
                "presses_correct": presses_correct,
                "fail_press": index + 1,
            }

        if not correct[index]:
            # Time until the wrong press, matching the session example.
            return {
                "sequence_length": seq_len,
                "deadline_sec": round(deadline, 3),
                "result": "wrong",
                "response_ms": int(round(elapsed * 1000)),
                "avg_press_ms": None,
                "presses_attempted": index + 1,
                "presses_correct": presses_correct,
                "fail_press": index + 1,
            }

        presses_correct += 1

    # Every press was correct and inside the per-press deadline.
    response_ms = int(round(elapsed * 1000))
    return {
        "sequence_length": seq_len,
        "deadline_sec": round(deadline, 3),
        "result": "pass",
        "response_ms": response_ms,
        "avg_press_ms": round(response_ms / seq_len, 3),
        "presses_attempted": seq_len,
        "presses_correct": seq_len,
        "fail_press": None,
    }


# ---------------------------------------------------------------------------
# One complete game
# ---------------------------------------------------------------------------

def bootstrap_next_level_steps(
    level: int,
    accuracy: float,
    avg_reaction_sec: float,
) -> int:
    """
    Build the 0/1/2 target used by the Adaptive Difficulty model later.

    IMPORTANT: this is a BOOTSTRAP RULE, not real ground truth. It exists only
    because we do not have real adaptive-difficulty decisions yet. Real data
    can replace this target later.

    The rule uses the same inputs the model will see:
      - accuracy (success_rate)
      - reaction_ratio = avg_reaction_sec / deadline
      - level

    Output:
      2 = player is doing great, skip ahead
      1 = normal progression
      0 = player is struggling, do not speed up
    """
    ratio = min(reaction_ratio(avg_reaction_sec, level), 1.0)
    performance = 0.75 * accuracy + 0.25 * (1.0 - ratio)

    if performance >= 0.74:
        return 2
    if performance >= 0.62:
        return 1
    return 0


def simulate_game(
    rng: np.random.Generator, game_number: int
) -> tuple[dict, list[dict], dict]:
    """Simulate one complete game from level 1 until win or game over."""
    player = make_player(rng)
    session_id = f"SYN-{game_number:06d}"

    level = 1
    lives = START_LIVES
    score = 0
    attempt_number = 1
    attempts: list[dict] = []
    deadline_ms = max_deadline_ms(1)  # adapts after every pass, like the box

    while True:
        attempt = simulate_attempt(rng, level, player, deadline_ms)
        passed = attempt["result"] == "pass"

        bonus = 0
        points = 0
        if passed:
            bonus = speed_bonus(
                response_seconds=attempt["response_ms"] / 1000.0,
                seq_len=attempt["sequence_length"],
                deadline=deadline_ms / 1000,
            )
            points = points_for_pass(level, bonus)
            score += points
        else:
            lives -= 1  # a wrong press or a timeout costs one life

        attempt.update(
            {
                "session_id": session_id,
                "level": level,
                "attempt_number": attempt_number,
                "speed_bonus": bonus,
                "points": points,
                "lives_after": lives,
                "score_after": score,
            }
        )
        attempts.append(attempt)

        if passed:
            if level == MAX_LEVEL:
                outcome = "win"
                break
            deadline_ms = next_deadline_ms(level, deadline_ms, attempt["response_ms"], attempt["sequence_length"])
            level += 1
            attempt_number = 1
        else:
            if lives <= 0:
                outcome = "game_over"
                break
            attempt_number += 1

    # -----------------------------------------------------------------------
    # Build the four model features exactly as the game design defines them.
    # -----------------------------------------------------------------------
    passed_attempts = [a for a in attempts if a["result"] == "pass"]
    successful_rounds = len(passed_attempts)
    failed_attempts = len(attempts) - successful_rounds

    # Round before building the target so the target can be reproduced
    # exactly from the values stored in games.csv.
    rate = round(success_rate(successful_rounds, failed_attempts), 3)

    if passed_attempts:
        avg_reaction_sec = round(
            float(
                np.mean(
                    [
                        (a["response_ms"] / 1000.0) / a["sequence_length"]
                        for a in passed_attempts
                    ]
                )
            ),
            3,
        )
    else:
        # The game design says to use 3.0 when there were no passed attempts.
        avg_reaction_sec = DEFAULT_AVG_REACTION_SEC

    final_level_attempted = attempts[-1]["level"]
    highest_sequence_length = attempts[-1]["sequence_length"]

    game = {
        "session_id": session_id,
        "final_score": int(score),
        "avg_reaction_sec": avg_reaction_sec,
        "success_rate": rate,
        "highest_sequence_length": int(highest_sequence_length),
        "skill_label": player["skill_label"],
        "next_level_steps": bootstrap_next_level_steps(
            final_level_attempted, rate, avg_reaction_sec
        ),
        "outcome": outcome,
        "final_level_attempted": int(final_level_attempted),
        "successful_rounds": int(successful_rounds),
        "failed_attempts": int(failed_attempts),
        "total_attempts": int(len(attempts)),
    }

    # Hidden labels for later analysis. This row is written to a separate file
    # and must never be joined into the model feature table.
    hidden = {
        "session_id": session_id,
        "player_type": player["skill_label"],
        "hidden_skill": round(player["skill"], 6),
        "hidden_speed": round(player["hidden_speed"], 6),
    }

    return game, attempts, hidden


# ---------------------------------------------------------------------------
# Validation and main program
# ---------------------------------------------------------------------------

def validate(games: pd.DataFrame, attempts: pd.DataFrame) -> None:
    """A few cheap checks so a broken simulation fails loudly."""
    assert games["session_id"].is_unique, "session_id must be unique"
    assert attempts["session_id"].isin(games["session_id"]).all(), "unknown session_id"

    # A game can never lose more than the 3 starting lives.
    assert attempts["lives_after"].between(0, START_LIVES).all(), "bad lives count"

    # Sequence length and deadline must come from the shared game rules.
    expected_seq = attempts["level"].apply(sequence_length)
    assert (attempts["sequence_length"] == expected_seq).all(), "bad sequence length"
    # The time per press adapts to the player, between 1 s and the level cap.
    cap = attempts["level"].apply(deadline_seconds)
    assert attempts["deadline_sec"].between(MIN_DEADLINE_MS / 1000, 99).all(), "deadline below 1 s"
    assert (attempts["deadline_sec"] <= cap + 1e-9).all(), "deadline above the level cap"

    # Points and bonuses must follow the game rules.
    passed = attempts[attempts["result"] == "pass"]
    failed = attempts[attempts["result"] != "pass"]
    assert (failed["points"] == 0).all(), "failed attempts must score 0"
    assert passed["speed_bonus"].between(0, MAX_SPEED_BONUS).all(), "bad speed bonus"
    expected_points = passed.apply(
        lambda row: points_for_pass(int(row["level"]), int(row["speed_bonus"])),
        axis=1,
    )
    assert (passed["points"] == expected_points).all(), "bad pass points"

    # Response times follow the session convention.
    assert (passed["response_ms"] > 0).all(), "pass response must be positive"
    assert (attempts.loc[attempts["result"] == "wrong", "response_ms"] > 0).all()
    assert (attempts.loc[attempts["result"] == "timeout", "response_ms"] == 0).all()
    assert passed["avg_press_ms"].notna().all(), "pass needs avg press time"
    assert failed["avg_press_ms"].isna().all(), "failed attempt has no avg press time"

    # Per-session counts and success rate must match the attempt file.
    counts = (
        attempts.assign(is_pass=attempts["result"] == "pass")
        .groupby("session_id")["is_pass"]
        .agg(["sum", "count"])
    )
    merged = games.set_index("session_id").loc[counts.index]
    assert (merged["successful_rounds"] == counts["sum"]).all(), "bad successful rounds"
    assert (merged["failed_attempts"] == counts["count"] - counts["sum"]).all()
    assert (merged["total_attempts"] == counts["count"]).all(), "bad attempt count"
    expected_rate = (
        counts["sum"] / counts["count"]
    ).round(3)
    assert np.allclose(merged["success_rate"], expected_rate), "bad success rate"

    # avg_reaction_sec must be recomputable from pass attempts.
    pass_rows = attempts[attempts["result"] == "pass"].copy()
    pass_rows["per_press_sec"] = (
        pass_rows["response_ms"] / 1000.0 / pass_rows["sequence_length"]
    )
    avg_by_session = pass_rows.groupby("session_id")["per_press_sec"].mean().round(3)
    expected_avg = avg_by_session.reindex(games["session_id"]).fillna(
        DEFAULT_AVG_REACTION_SEC
    )
    # Allow 0.001 for a possible half-way rounding difference between Python
    # and pandas when the third decimal is exactly 5.
    assert np.allclose(
        games["avg_reaction_sec"], expected_avg, atol=0.0011
    ), "bad avg reaction"

    # Final sequence length and level must match the last attempt.
    last = attempts.groupby("session_id").tail(1).set_index("session_id")
    assert (
        games.set_index("session_id")["highest_sequence_length"]
        == last["sequence_length"]
    ).all(), "bad highest sequence length"
    assert (
        games.set_index("session_id")["final_level_attempted"] == last["level"]
    ).all(), "bad final level"

    # Wins clear the last level. Game overs always use all 3 lives.
    wins = games[games["outcome"] == "win"]
    assert (wins["final_level_attempted"] == MAX_LEVEL).all(), "win must clear the last level"
    assert (wins["successful_rounds"] == MAX_LEVEL).all(), "win needs one pass per level"
    assert (wins["failed_attempts"] <= START_LIVES - 1).all(), "win with too many fails"
    game_overs = games[games["outcome"] == "game_over"]
    assert (game_overs["failed_attempts"] == START_LIVES).all(), "game over needs 3 fails"

    # The bootstrap target must be in range and reproducible from its inputs.
    assert games["next_level_steps"].isin([0, 1, 2]).all(), "bad difficulty target"
    expected_steps = games.apply(
        lambda row: bootstrap_next_level_steps(
            int(row["final_level_attempted"]),
            float(row["success_rate"]),
            float(row["avg_reaction_sec"]),
        ),
        axis=1,
    )
    assert (games["next_level_steps"] == expected_steps).all(), "bad target rule"


def validate_hidden(games: pd.DataFrame, hidden: pd.DataFrame) -> None:
    """Check the hidden-label file matches games and stays in 0..1."""
    assert len(hidden) == len(games), "hidden row count must match games"
    assert hidden["session_id"].is_unique, "hidden session_id must be unique"
    assert (
        hidden["session_id"].tolist() == games["session_id"].tolist()
    ), "hidden rows must follow game order"
    assert hidden["player_type"].isin(
        ["Beginner", "Intermediate", "Pro"]
    ).all(), "bad player_type"
    assert hidden["hidden_skill"].between(0.0, 1.0).all(), "bad hidden_skill"
    assert hidden["hidden_speed"].between(0.0, 1.0).all(), "bad hidden_speed"

    # player_type is the same hidden label already stored in games.csv.
    merged = hidden.merge(
        games[["session_id", "skill_label"]], on="session_id", how="left"
    )
    assert merged["skill_label"].notna().all(), "missing game for hidden row"
    assert (
        merged["player_type"] == merged["skill_label"]
    ).all(), "player_type must match skill_label"


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic Rhythm Rush games.")
    parser.add_argument("--games", type=int, default=2000, help="number of games to simulate")
    parser.add_argument("--seed", type=int, default=42, help="random seed (reproducible data)")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "data",
        help="folder for games.csv, attempts.csv, and players_hidden.csv",
    )
    args = parser.parse_args()

    if args.games < 1:
        parser.error("--games must be at least 1")

    rng = np.random.default_rng(args.seed)

    game_rows: list[dict] = []
    attempt_rows: list[dict] = []
    hidden_rows: list[dict] = []

    for game_number in range(1, args.games + 1):
        game, attempts, hidden = simulate_game(rng, game_number)
        game_rows.append(game)
        attempt_rows.extend(attempts)
        hidden_rows.append(hidden)

    games_df = pd.DataFrame(game_rows, columns=GAME_COLUMNS)
    attempts_df = pd.DataFrame(attempt_rows, columns=ATTEMPT_COLUMNS)
    hidden_df = pd.DataFrame(hidden_rows, columns=HIDDEN_PLAYER_COLUMNS)

    # Keep whole-number columns looking like whole numbers in the CSV.
    # "Int64" (capital I) lets pandas keep blanks for pass attempts.
    attempts_df["response_ms"] = attempts_df["response_ms"].astype("Int64")
    attempts_df["fail_press"] = attempts_df["fail_press"].astype("Int64")

    validate(games_df, attempts_df)
    validate_hidden(games_df, hidden_df)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    games_path = args.out_dir / "games.csv"
    attempts_path = args.out_dir / "attempts.csv"
    hidden_path = args.out_dir / "players_hidden.csv"

    games_df.to_csv(games_path, index=False, float_format="%.3f")
    attempts_df.to_csv(attempts_path, index=False, float_format="%.3f")
    hidden_df.to_csv(hidden_path, index=False, float_format="%.6f")

    # A short summary makes it easy to see whether the data looks sensible.
    print(f"Wrote {len(games_df)} games to {games_path}")
    print(f"Wrote {len(attempts_df)} attempts to {attempts_path}")
    print(f"Wrote {len(hidden_df)} hidden-player rows to {hidden_path}")
    print(
        "hidden_skill min/max: "
        f"{hidden_df['hidden_skill'].min():.6f} / "
        f"{hidden_df['hidden_skill'].max():.6f}"
    )
    print()
    print("Skill labels:")
    print(games_df["skill_label"].value_counts().to_string())
    print()
    print("Outcomes:")
    print(games_df["outcome"].value_counts().to_string())
    print()
    print("Next-level steps target:")
    print(games_df["next_level_steps"].value_counts().sort_index().to_string())
    print()
    print("Feature summary:")
    print(
        games_df[
            ["final_score", "avg_reaction_sec", "success_rate", "highest_sequence_length"]
        ]
        .describe()
        .round(2)
        .to_string()
    )


if __name__ == "__main__":
    main()
