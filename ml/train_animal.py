#!/usr/bin/env python3
"""
Rhythm Rush - Phase B: build the Animal IQ Matcher.

The matcher stores every game's 4 gameplay features plus that game's score
percentile. At prediction time, Express standardizes the 4 inputs with the
saved mean/std, finds the nearest stored game, and maps that game's score
percentile to an animal tier.

Only the 4 gameplay features are stored as model inputs. Hidden labels
(player_type, hidden_skill, hidden_speed) and next_level_steps are never used.

Run from the project root:
    python ml/train_animal.py

Export:
    backend/artifacts/animal.json
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

# Same feature order as train_skill.py. Keep this order in the JSON export.
FEATURE_COLUMNS = [
    "final_score",
    "avg_reaction_sec",
    "highest_sequence_length",
    "success_rate",
]

# Labels and hidden simulator values. Never model inputs.
FORBIDDEN_INPUT_COLUMNS = [
    "skill_label",
    "player_type",
    "hidden_skill",
    "hidden_speed",
    "next_level_steps",
]

# Percentile tiers, best first. A game at the 95th percentile gets Chimpanzee,
# a game at the 40th percentile gets Orangutan, and so on.
# "Top 10%" means percentile >= 0.90.
ANIMAL_TIERS = [
    {"percentile_min": 0.90, "animal": "Chimpanzee", "iq_range": "90-100"},
    {"percentile_min": 0.75, "animal": "Bottlenose Dolphin", "iq_range": "80-90"},
    {"percentile_min": 0.55, "animal": "Elephant", "iq_range": "70-80"},
    {"percentile_min": 0.30, "animal": "Orangutan", "iq_range": "60-70"},
    {"percentile_min": 0.00, "animal": "Pig", "iq_range": "50-60"},
]

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "ml" / "data"
ARTIFACTS_DIR = PROJECT_ROOT / "backend" / "artifacts"
RANDOM_STATE = 42


def load_data() -> pd.DataFrame:
    """Load games and attach hidden labels; animal.json only needs features."""
    games = pd.read_csv(DATA_DIR / "games.csv")
    hidden = pd.read_csv(DATA_DIR / "players_hidden.csv")

    data = games.merge(
        hidden,
        on="session_id",
        how="inner",
        validate="one_to_one",
    )
    # Same deterministic order as train_skill.py.
    data = data.sort_values("session_id").reset_index(drop=True)

    assert len(data) == len(games) == len(hidden), "join must keep every game"
    return data


def animal_for_percentile(percentile: float) -> str:
    """Map a 0-1 score percentile to an animal name."""
    for tier in ANIMAL_TIERS:
        if percentile >= tier["percentile_min"]:
            return str(tier["animal"])
    # ANIMAL_TIERS ends at 0.00, so this line should never run.
    raise ValueError(f"percentile out of range: {percentile}")


def main() -> None:
    data = load_data()
    X = data[FEATURE_COLUMNS]

    # Guard: fail loudly if a label or hidden column ever sneaks in.
    assert list(X.columns) == FEATURE_COLUMNS, "inputs must be the 4 features"
    assert set(X.columns) == {
        "final_score",
        "avg_reaction_sec",
        "highest_sequence_length",
        "success_rate",
    }, "unexpected feature list"
    assert set(X.columns).isdisjoint(
        FORBIDDEN_INPUT_COLUMNS
    ), "forbidden label/hidden columns must never be model inputs"

    # Standardize the 4 features. We save the mean and std in the JSON so
    # Express can apply exactly the same transformation at request time.
    scaler = StandardScaler()
    scaled = scaler.fit_transform(X)

    # Nearest-neighbor index over all finished games. Animal matching is a
    # lookup-style model, so there is no train/test split here.
    matcher = NearestNeighbors(n_neighbors=1)
    matcher.fit(scaled)

    # Score percentile, 0-1. Pandas rank(pct=True) gives 1/n for the lowest
    # score and 1.0 for the highest. Ties get the average rank.
    percentiles = data["final_score"].rank(pct=True, method="average")

    animal_counts = percentiles.map(animal_for_percentile).value_counts()
    ordered_counts = {
        tier["animal"]: int(animal_counts.get(tier["animal"], 0))
        for tier in ANIMAL_TIERS
    }

    print(f"Games: {len(data)}")
    print(f"Nearest-neighbor rows: {matcher.n_samples_fit_}")
    print("Feature scaler (mean / std):")
    for name, mean, std in zip(FEATURE_COLUMNS, scaler.mean_, scaler.scale_):
        print(f"  {name}: {mean:.6f} / {std:.6f}")
    print()
    print(
        "Score percentile range: "
        f"{percentiles.min():.6f} - {percentiles.max():.6f}"
    )
    print("Animal tier counts (from score percentiles):")
    for animal, count in ordered_counts.items():
        print(f"  {animal}: {count}")
    print()

    # Required export shape:
    #   {"version": 1, "mean": [...], "std": [...],
    #    "rows": [{"id": ..., "features": [...], "score_percentile": ...}]}
    # "features" and "tiers" are extra metadata kept for the backend/UI.
    rows = []
    for session_id, values, percentile in zip(
        data["session_id"],
        X.itertuples(index=False, name=None),
        percentiles,
    ):
        rows.append(
            {
                "id": str(session_id),
                "features": [float(value) for value in values],
                "score_percentile": float(percentile),
            }
        )

    payload = {
        "version": 1,
        "mean": [float(value) for value in scaler.mean_],
        "std": [float(value) for value in scaler.scale_],
        "rows": rows,
        "features": FEATURE_COLUMNS,
        "tiers": ANIMAL_TIERS,
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = ARTIFACTS_DIR / "animal.json"

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)

    print(f"Wrote {output_path} ({len(payload['rows'])} rows)")


if __name__ == "__main__":
    main()
