#!/usr/bin/env python3
"""
Rhythm Rush - Phase C: train the Adaptive Difficulty model.

Inputs (in this order):
    accuracy        = success_rate from games.csv
    reaction_ratio  = avg_reaction_sec / deadline_seconds(final_level_attempted)
    level           = final_level_attempted

Target:
    next_level_steps from games.csv (0, 1, or 2)

IMPORTANT: next_level_steps is a BOOTSTRAP RULE created by the simulator,
not real difficulty data. A high R2 only means the model reproduces that rule.
It does not prove the model understands real players.

Forbidden inputs (never used by the model):
    skill_label, player_type, hidden_skill, hidden_speed

Run from the project root:
    python ml/train_difficulty.py

Export:
    backend/artifacts/difficulty.json
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

from game_rules import reaction_ratio

FEATURE_COLUMNS = [
    "accuracy",
    "reaction_ratio",
    "level",
]

FORBIDDEN_INPUT_COLUMNS = [
    "skill_label",
    "player_type",
    "hidden_skill",
    "hidden_speed",
]

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "ml" / "data"
ARTIFACTS_DIR = PROJECT_ROOT / "backend" / "artifacts"

RANDOM_STATE = 42

# Filled by main() before predict_steps() is used.
_MODEL: LinearRegression | None = None


def load_data() -> pd.DataFrame:
    """Load games in a stable order and keep the columns we need."""
    games = pd.read_csv(DATA_DIR / "games.csv")
    games = games.sort_values("session_id").reset_index(drop=True)

    assert len(games) > 0, "games.csv is empty"
    assert games["next_level_steps"].notna().all(), "target has missing values"
    assert games["next_level_steps"].isin([0, 1, 2]).all(), (
        "next_level_steps must be 0, 1, or 2"
    )
    return games


def build_features(games: pd.DataFrame) -> pd.DataFrame:
    """Build the 3 allowed difficulty inputs."""
    level = games["final_level_attempted"].astype(int)

    X = pd.DataFrame(
        {
            "accuracy": games["success_rate"].astype(float),
            "reaction_ratio": [
                reaction_ratio(avg_reaction, game_level)
                for avg_reaction, game_level in zip(
                    games["avg_reaction_sec"], level
                )
            ],
            "level": level.astype(float),
        }
    )

    # Guard: exactly the 3 allowed inputs, and no hidden labels.
    assert list(X.columns) == FEATURE_COLUMNS, "wrong difficulty inputs"
    assert set(X.columns).isdisjoint(FORBIDDEN_INPUT_COLUMNS), (
        "forbidden label/hidden columns must never be model inputs"
    )
    for column in FORBIDDEN_INPUT_COLUMNS:
        assert column not in X.columns, f"{column} must never be a model input"

    return X


def predict_steps(accuracy: float, reaction_ratio: float, level: float) -> int:
    """
    Predict how many levels to add next: 0, 1, or 2.

    The linear output is rounded half up (like JavaScript Math.round) and
    clamped to the allowed 0..2 range.
    """
    if _MODEL is None:
        raise RuntimeError("train the model before calling predict_steps()")

    # Build a one-row DataFrame so sklearn sees the same feature names
    # that were used during training.
    row = pd.DataFrame(
        [[float(accuracy), float(reaction_ratio), float(level)]],
        columns=FEATURE_COLUMNS,
    )
    raw = float(_MODEL.predict(row)[0])
    rounded = int(np.floor(raw + 0.5))
    return max(0, min(2, rounded))


def main() -> None:
    global _MODEL

    games = load_data()
    X = build_features(games)

    # Use the bootstrap target exactly as generated in games.csv.
    y = games["next_level_steps"].astype(int)

    print("next_level_steps class split (full data):")
    counts = y.value_counts().sort_index()
    for step in [0, 1, 2]:
        count = int(counts.get(step, 0))
        print(f"  {step}: {count} ({count / len(y):.2%})")
    print()

    # 80/20 split, fixed project seed.
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=RANDOM_STATE,
    )

    print(f"Train rows: {len(X_train)}")
    print(f"Test rows: {len(X_test)}")
    print()

    model = LinearRegression()
    model.fit(X_train, y_train)
    _MODEL = model

    y_pred = model.predict(X_test)
    print(f"R2: {r2_score(y_test, y_pred):.4f}")
    print(f"MAE: {mean_absolute_error(y_test, y_pred):.4f}")
    print()

    print("Model weights:")
    print(f"  intercept: {float(model.intercept_):.6f}")
    for name, weight in zip(FEATURE_COLUMNS, model.coef_):
        print(f"  {name}: {float(weight):.6f}")
    print()

    # Show that the helper produces the final 0/1/2 decisions.
    examples = [
        ("fast and accurate", 0.95, 0.40, 6),
        ("average player", 0.80, 0.80, 4),
        ("struggling player", 0.40, 1.30, 4),
        ("slow but accurate", 0.95, 1.20, 6),
        ("fast but sloppy", 0.40, 0.40, 6),
    ]

    print("Example predictions:")
    for label, accuracy, ratio, level in examples:
        steps = predict_steps(accuracy, ratio, level)
        print(
            f"  {label}: accuracy={accuracy:.2f}, "
            f"reaction_ratio={ratio:.2f}, level={level} -> {steps}"
        )
    print()

    # Exact export format required by AGENTS.md.
    payload = {
        "version": 1,
        "intercept": float(model.intercept_),
        "weights": {
            "accuracy": float(model.coef_[0]),
            "reactionRatio": float(model.coef_[1]),
            "level": float(model.coef_[2]),
        },
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = ARTIFACTS_DIR / "difficulty.json"

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)

    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
