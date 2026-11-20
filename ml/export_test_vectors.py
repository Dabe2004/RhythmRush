#!/usr/bin/env python3
"""
Rhythm Rush - Phase G: export test vectors for the JavaScript models.

backend/src/services/ml.js must reproduce the exported models exactly. This
script writes fixed test cases so vitest can check the JS against Python.

The model walkers are IMPORTED from check_exports.py, never copied:
    walk_tree, percentile_to_animal, standardize, nearest_example,
    difficulty_prediction, round_and_clamp_steps

Run from the project root:
    python ml/export_test_vectors.py

Output:
    backend/tests/fixtures/ml_vectors.json
"""

from __future__ import annotations

import json
import random
from pathlib import Path

# Reuse the plain-Python walkers from check_exports.py (this is the Python
# twin of backend/src/services/ml.js).
from check_exports import (
    ARTIFACTS_DIR,
    DATA_DIR,
    FEATURE_COLUMNS,
    RANDOM_STATE,
    difficulty_prediction,
    load_artifacts,
    load_data,
    nearest_example,
    percentile_to_animal,
    round_and_clamp_steps,
    standardize,
    walk_tree,
)

from game_rules import reaction_ratio

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "backend" / "tests" / "fixtures" / "ml_vectors.json"

SKILL_COUNT = 40
DIFFICULTY_RANDOM_COUNT = 16
ANIMAL_COUNT = 25


def as_dict(row) -> dict:
    """One games.csv row -> the 4-feature input object used by the models."""
    return {
        "final_score": float(row["final_score"]),
        "avg_reaction_sec": float(row["avg_reaction_sec"]),
        "highest_sequence_length": int(row["highest_sequence_length"]),
        "success_rate": float(row["success_rate"]),
    }


def build_skill_cases(data, skill: dict, picker: random.Random) -> list[dict]:
    """40 real games: 4 features in, expected class label out."""
    nodes = {int(node["id"]): node for node in skill["nodes"]}
    indices = picker.sample(range(len(data)), SKILL_COUNT)

    cases = []
    for index in indices:
        row = data.iloc[index]
        features = as_dict(row)
        values = [features[name] for name in FEATURE_COLUMNS]

        cases.append(
            {
                "input": features,
                "expected": walk_tree(nodes, values),
            }
        )

    return cases


def accuracy_for_raw(target: float, rr: float, level: int, difficulty: dict) -> float:
    """Solve the exported linear model for the accuracy that gives `target`."""
    weights = difficulty["weights"]
    return (
        target
        - float(difficulty["intercept"])
        - float(weights["reactionRatio"]) * rr
        - float(weights["level"]) * level
    ) / float(weights["accuracy"])


def solve_case(target: float, difficulty: dict, rr_choices, level_choices):
    """Find (accuracy, rr, level) inside 0..1 accuracy for a target raw value."""
    for rr in rr_choices:
        for level in level_choices:
            accuracy = accuracy_for_raw(target, rr, level, difficulty)
            if 0.0 <= accuracy <= 1.0:
                return (
                    {
                        "accuracy": float(accuracy),
                        "reaction_ratio": float(rr),
                        "level": int(level),
                    },
                    float(target),
                )
    raise RuntimeError(f"no valid inputs found for raw target {target}")


def build_difficulty_cases(data, difficulty: dict, picker: random.Random) -> list[dict]:
    """Real games plus hard cases around .5 and outside the 0..2 clamp."""
    inputs: list[tuple[dict, float | None]] = []

    # 1. Real games: accuracy = success_rate, level = final level attempted.
    for index in picker.sample(range(len(data)), DIFFICULTY_RANDOM_COUNT):
        row = data.iloc[index]
        level = int(row["final_level_attempted"])
        inputs.append(
            (
                {
                    "accuracy": float(row["success_rate"]),
                    "reaction_ratio": float(
                        reaction_ratio(float(row["avg_reaction_sec"]), level)
                    ),
                    "level": level,
                },
                None,  # raw computed below with difficulty_prediction()
            )
        )

    # 2. Cases exactly at and just around .5, where floor(raw + 0.5) flips.
    half_targets = [
        0.5,
        0.5 - 1e-7,
        0.5 + 1e-7,
        1.5,
        1.5 - 1e-7,
        1.5 + 1e-7,
    ]
    for offset, target in enumerate(half_targets):
        case, _ = solve_case(
            target,
            difficulty,
            rr_choices=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
            level_choices=[1, 4, 8, 12, 15],
        )
        inputs.append((case, None))

    # 3. Raw below 0 and above 2, where the clamp matters.
    below = [
        {"accuracy": 0.0, "reaction_ratio": 1.5, "level": 1},
        {"accuracy": 0.0, "reaction_ratio": 1.8, "level": 2},
        {"accuracy": 0.1, "reaction_ratio": 2.0, "level": 1},
        {"accuracy": 0.0, "reaction_ratio": 1.2, "level": 3},
    ]
    above = [
        {"accuracy": 1.0, "reaction_ratio": 0.0, "level": 15},
        {"accuracy": 1.0, "reaction_ratio": 0.2, "level": 15},
        {"accuracy": 0.95, "reaction_ratio": 0.0, "level": 14},
        {"accuracy": 1.0, "reaction_ratio": 0.4, "level": 15},
    ]
    for case in below + above:
        inputs.append((case, None))

    # 4. Extreme but valid inputs.
    extras = [
        {"accuracy": 0.0, "reaction_ratio": 0.0, "level": 1},
        {"accuracy": 1.0, "reaction_ratio": 0.0, "level": 1},
        {"accuracy": 0.0, "reaction_ratio": 2.0, "level": 15},
        {"accuracy": 1.0, "reaction_ratio": 2.0, "level": 15},
        {"accuracy": 0.5, "reaction_ratio": 1.0, "level": 7},
        {"accuracy": 0.75, "reaction_ratio": 0.5, "level": 10},
    ]
    for case in extras:
        inputs.append((case, None))

    # 40 cases in total: 16 + 6 + 8 + 6 = 36, so add 4 more real games.
    for index in picker.sample(range(len(data)), 4):
        row = data.iloc[index]
        level = int(row["final_level_attempted"])
        inputs.append(
            (
                {
                    "accuracy": float(row["success_rate"]),
                    "reaction_ratio": float(
                        reaction_ratio(float(row["avg_reaction_sec"]), level)
                    ),
                    "level": level,
                },
                None,
            )
        )

    cases = []
    for case, _ in inputs:
        raw = difficulty_prediction(
            difficulty,
            case["accuracy"],
            case["reaction_ratio"],
            float(case["level"]),
        )
        cases.append(
            {
                "input": case,
                "expected_raw": float(raw),
                "expected_steps": round_and_clamp_steps(float(raw)),
            }
        )

    return cases


def build_animal_cases(data, animal: dict, difficulty_unused, picker: random.Random) -> list[dict]:
    """25 jittered games, matched against the reference rows only."""
    rows = animal["rows"]
    mean = [float(value) for value in animal["mean"]]
    std = [float(value) for value in animal["std"]]
    tiers = animal["tiers"]

    examples = [[float(value) for value in row["features"]] for row in rows]
    scaled_examples = [standardize(example, mean, std) for example in examples]

    # Same idea as check_exports.py: small noise on real games so the query
    # is not an exact copy of a stored row.
    raw_std = data[FEATURE_COLUMNS].std(ddof=0).to_numpy()

    cases = []
    for index in picker.sample(range(len(data)), ANIMAL_COUNT):
        original = data.iloc[index][FEATURE_COLUMNS].to_numpy(dtype=float)
        noisy = [
            float(original[column] + picker.gauss(0.0, 0.10) * raw_std[column])
            for column in range(len(FEATURE_COLUMNS))
        ]

        query = standardize(noisy, mean, std)
        matched_index, distance = nearest_example(query, scaled_examples)
        matched = rows[matched_index]
        percentile = float(matched["score_percentile"])

        cases.append(
            {
                "features": noisy,
                "expected": {
                    "id": str(matched["id"]),
                    "distance": float(distance),
                    "percentile": percentile,
                    "animal": percentile_to_animal(tiers, percentile),
                },
            }
        )

    return cases


def main() -> None:
    data = load_data()
    skill, animal, difficulty = load_artifacts()

    # One picker with the project seed keeps the file reproducible.
    picker = random.Random(RANDOM_STATE)

    payload = {
        "seed": RANDOM_STATE,
        "skill": build_skill_cases(data, skill, picker),
        "difficulty": build_difficulty_cases(data, difficulty, picker),
        "animal": build_animal_cases(data, animal, difficulty, picker),
    }

    assert len(payload["skill"]) == SKILL_COUNT
    assert len(payload["difficulty"]) == 40, len(payload["difficulty"])
    assert len(payload["animal"]) == ANIMAL_COUNT

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Wrote {OUTPUT_PATH}")
    print(f"  skill cases:      {len(payload['skill'])}")
    print(f"  difficulty cases: {len(payload['difficulty'])}")
    print(f"  animal cases:     {len(payload['animal'])}")

    steps = [case["expected_steps"] for case in payload["difficulty"]]
    raws = [case["expected_raw"] for case in payload["difficulty"]]
    print(
        f"  difficulty raw range: {min(raws):.4f} .. {max(raws):.4f} "
        f"(clamped to {min(steps)}..{max(steps)})"
    )


if __name__ == "__main__":
    main()
