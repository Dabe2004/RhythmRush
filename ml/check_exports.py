#!/usr/bin/env python3
"""
Rhythm Rush - Phase B/C: verify the exported JSON models.

This script does two things:
1. Applies skill.json, animal.json, and difficulty.json in plain Python
   (no sklearn prediction code, no pickle), exactly like Express will later
   do it.
2. Compares those plain-Python predictions with sklearn on 100 random games.

Run from the project root:
    python ml/check_exports.py

Exits with an error if anything does not match.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

from game_rules import reaction_ratio

FEATURE_COLUMNS = [
    "final_score",
    "avg_reaction_sec",
    "highest_sequence_length",
    "success_rate",
]

DIFFICULTY_FEATURES = [
    "accuracy",
    "reaction_ratio",
    "level",
]

FORBIDDEN_INPUT_COLUMNS = [
    "skill_label",
    "player_type",
    "hidden_skill",
    "hidden_speed",
    "next_level_steps",
]

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "ml" / "data"
ARTIFACTS_DIR = PROJECT_ROOT / "backend" / "artifacts"

RANDOM_STATE = 42
CHECK_COUNT = 100
TOLERANCE = 1e-9


# ---------------------------------------------------------------------------
# Plain-Python model code (this is what production/Express will mirror)
# ---------------------------------------------------------------------------

def walk_tree(nodes_by_id: dict, feature_values: list[float]) -> str:
    """Walk the exported decision tree. Left when value <= threshold."""
    node = nodes_by_id[0]

    while "leaf" not in node:
        feature_value = feature_values[node["feature"]]
        if feature_value <= node["threshold"]:
            node = nodes_by_id[node["left"]]
        else:
            node = nodes_by_id[node["right"]]

    return str(node["leaf"])


def percentile_to_animal(tiers: list[dict], percentile: float) -> str:
    """Map a score percentile to the first matching animal tier."""
    for tier in tiers:
        if percentile >= float(tier["percentile_min"]):
            return str(tier["animal"])
    raise ValueError(f"no animal tier for percentile {percentile}")


def standardize(
    feature_values: list[float], mean: list[float], std: list[float]
) -> list[float]:
    """Apply the saved scaler: (value - mean) / std."""
    return [
        (value - feature_mean) / feature_std
        for value, feature_mean, feature_std in zip(feature_values, mean, std)
    ]


def nearest_example(
    query: list[float], examples: list[list[float]]
) -> tuple[int, float]:
    """Find the nearest stored example with a plain Euclidean distance."""
    best_index = -1
    best_distance = math.inf

    for index, example in enumerate(examples):
        squared = 0.0
        for query_value, example_value in zip(query, example):
            difference = query_value - example_value
            squared += difference * difference
        distance = math.sqrt(squared)

        if distance < best_distance:
            best_index = index
            best_distance = distance

    return best_index, best_distance


def difficulty_prediction(
    export: dict,
    accuracy: float,
    reaction_ratio_value: float,
    level: float,
) -> float:
    """Apply the exported difficulty intercept and weights in plain Python."""
    weights = export["weights"]
    return (
        float(export["intercept"])
        + float(weights["accuracy"]) * accuracy
        + float(weights["reactionRatio"]) * reaction_ratio_value
        + float(weights["level"]) * level
    )


def round_and_clamp_steps(value: float) -> int:
    """Round half up and clamp to the allowed 0..2 range."""
    rounded = int(math.floor(value + 0.5))
    return max(0, min(2, rounded))


# ---------------------------------------------------------------------------
# Data and checks
# ---------------------------------------------------------------------------

def load_data() -> pd.DataFrame:
    """Load games and hidden labels in the same order the trainers use."""
    games = pd.read_csv(DATA_DIR / "games.csv")
    hidden = pd.read_csv(DATA_DIR / "players_hidden.csv")

    data = games.merge(
        hidden,
        on="session_id",
        how="inner",
        validate="one_to_one",
    )
    data = data.sort_values("session_id").reset_index(drop=True)

    assert len(data) == len(games) == len(hidden), "join must keep every game"
    return data


def load_artifacts() -> tuple[dict, dict, dict]:
    """Load and sanity-check the three exported JSON files."""
    skill = json.loads((ARTIFACTS_DIR / "skill.json").read_text(encoding="utf-8"))
    animal = json.loads(
        (ARTIFACTS_DIR / "animal.json").read_text(encoding="utf-8")
    )
    difficulty = json.loads(
        (ARTIFACTS_DIR / "difficulty.json").read_text(encoding="utf-8")
    )

    assert {"version", "features", "nodes"} <= set(
        skill
    ), "skill.json is missing required fields"
    assert {"version", "mean", "std", "rows"} <= set(
        animal
    ), "animal.json is missing required fields"

    # "features" and "tiers" are extra metadata, so they are checked too.
    assert skill["features"] == FEATURE_COLUMNS, "bad skill feature order"
    assert animal["features"] == FEATURE_COLUMNS, "bad animal feature order"
    assert set(FEATURE_COLUMNS).isdisjoint(
        FORBIDDEN_INPUT_COLUMNS
    ), "forbidden columns leaked into the feature list"

    assert int(skill["version"]) == 1, "skill.json version must be 1"
    assert int(animal["version"]) == 1, "animal.json version must be 1"

    nodes = {int(node["id"]): node for node in skill["nodes"]}
    assert 0 in nodes, "skill tree needs a root node 0"
    for node in nodes.values():
        if "leaf" in node:
            # Required export shape: leaves have "leaf", not "feature".
            assert "feature" not in node, "leaf nodes must not have a feature"
        else:
            assert {"feature", "threshold", "left", "right"} <= set(
                node
            ), "internal nodes need feature, threshold, left, and right"
            assert node["left"] in nodes, "tree points to a missing left child"
            assert node["right"] in nodes, "tree points to a missing right child"
            assert 0 <= int(node["feature"]) < len(
                FEATURE_COLUMNS
            ), "tree feature index out of range"

    animal_mean = animal["mean"]
    animal_std = animal["std"]
    assert len(animal_mean) == len(FEATURE_COLUMNS), "bad mean length"
    assert len(animal_std) == len(FEATURE_COLUMNS), "bad std length"
    assert all(value > 0 for value in animal_std), "std must be positive"

    animal_rows = animal["rows"]
    assert len(animal_rows) > 0, "animal rows must not be empty"
    for row in animal_rows:
        assert {"id", "features", "score_percentile"} <= set(
            row
        ), "each animal row needs id, features, and score_percentile"
        assert len(row["features"]) == len(
            FEATURE_COLUMNS
        ), "animal row feature length is wrong"
        assert 0.0 <= float(row["score_percentile"]) <= 1.0, (
            "animal row score_percentile must be 0-1"
        )
    assert len(animal["tiers"]) == 5, "expected 5 animal tiers"

    # Required difficulty export shape from AGENTS.md.
    assert set(difficulty) == {
        "version",
        "intercept",
        "weights",
    }, "difficulty.json has unexpected fields"
    assert int(difficulty["version"]) == 1, "difficulty.json version must be 1"
    assert set(difficulty["weights"]) == {
        "accuracy",
        "reactionRatio",
        "level",
    }, "difficulty.json weights have unexpected fields"
    for name in ("accuracy", "reactionRatio", "level"):
        float(difficulty["weights"][name])

    return skill, animal, difficulty


def main() -> None:
    data = load_data()
    skill, animal, difficulty = load_artifacts()

    n_rows = len(data)
    assert len(animal["rows"]) == n_rows, "animal rows must cover games"

    print(f"Loaded {ARTIFACTS_DIR / 'skill.json'}")
    print(f"Loaded {ARTIFACTS_DIR / 'animal.json'}")
    print(f"Loaded {ARTIFACTS_DIR / 'difficulty.json'}")
    print()

    # Pick the same 100 random games every run.
    picker = random.Random(RANDOM_STATE)
    indices = picker.sample(range(n_rows), CHECK_COUNT)
    check_rows = data.iloc[indices].reset_index(drop=True)
    feature_values = [
        [float(value) for value in row]
        for row in check_rows[FEATURE_COLUMNS].itertuples(
            index=False, name=None
        )
    ]

    print(f"Checking {CHECK_COUNT} random games (seed {RANDOM_STATE})...")

    # ----- Skill tree: plain Python vs sklearn -----------------------------
    X = data[FEATURE_COLUMNS]
    y = data["player_type"]
    X_train, _, y_train, _ = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=y,
    )
    reference_tree = DecisionTreeClassifier(
        max_depth=3, random_state=RANDOM_STATE
    )
    reference_tree.fit(X_train, y_train)
    sklearn_skill = [str(value) for value in reference_tree.predict(check_rows[FEATURE_COLUMNS])]

    nodes = {int(node["id"]): node for node in skill["nodes"]}
    exported_skill = [
        walk_tree(nodes, values) for values in feature_values
    ]

    skill_matches = sum(
        expected == actual
        for expected, actual in zip(sklearn_skill, exported_skill)
    )
    assert skill_matches == CHECK_COUNT, (
        f"skill tree mismatch: {CHECK_COUNT - skill_matches}/{CHECK_COUNT}"
    )
    print(
        f"Skill tree: {skill_matches}/{CHECK_COUNT} predictions match sklearn "
        f"({skill_matches / CHECK_COUNT:.2%})."
    )

    # ----- Adaptive difficulty: plain Python vs sklearn --------------------
    difficulty_X = pd.DataFrame(
        {
            "accuracy": data["success_rate"].astype(float),
            "reaction_ratio": [
                reaction_ratio(avg_reaction, int(level))
                for avg_reaction, level in zip(
                    data["avg_reaction_sec"],
                    data["final_level_attempted"],
                )
            ],
            "level": data["final_level_attempted"].astype(float),
        }
    )
    assert list(
        difficulty_X.columns
    ) == DIFFICULTY_FEATURES, "wrong difficulty feature order"

    d_train, _, d_train_y, _ = train_test_split(
        difficulty_X,
        data["next_level_steps"].astype(int),
        test_size=0.20,
        random_state=RANDOM_STATE,
    )
    reference_difficulty = LinearRegression()
    reference_difficulty.fit(d_train, d_train_y)

    exported_weights = difficulty["weights"]
    weight_diff = max(
        abs(
            float(difficulty["intercept"])
            - float(reference_difficulty.intercept_)
        ),
        abs(
            float(exported_weights["accuracy"])
            - float(reference_difficulty.coef_[0])
        ),
        abs(
            float(exported_weights["reactionRatio"])
            - float(reference_difficulty.coef_[1])
        ),
        abs(
            float(exported_weights["level"])
            - float(reference_difficulty.coef_[2])
        ),
    )
    assert weight_diff <= TOLERANCE, "difficulty weights differ from sklearn"
    print(f"Difficulty weights: match sklearn (max diff {weight_diff:.2e}).")

    difficulty_check = difficulty_X.iloc[indices]
    sklearn_difficulty = reference_difficulty.predict(difficulty_check)
    plain_difficulty = [
        difficulty_prediction(
            difficulty,
            float(row["accuracy"]),
            float(row["reaction_ratio"]),
            float(row["level"]),
        )
        for _, row in difficulty_check.iterrows()
    ]

    raw_matches = 0
    step_matches = 0
    max_raw_diff = 0.0
    for expected, actual in zip(sklearn_difficulty, plain_difficulty):
        difference = abs(float(expected) - float(actual))
        max_raw_diff = max(max_raw_diff, difference)
        if difference <= TOLERANCE:
            raw_matches += 1
        if round_and_clamp_steps(float(expected)) == round_and_clamp_steps(
            float(actual)
        ):
            step_matches += 1

    assert raw_matches == CHECK_COUNT, "difficulty raw predictions differ"
    assert step_matches == CHECK_COUNT, "difficulty rounded steps differ"
    print(
        f"Difficulty: {raw_matches}/{CHECK_COUNT} raw predictions and "
        f"{step_matches}/{CHECK_COUNT} rounded steps match sklearn "
        f"(max raw diff {max_raw_diff:.2e})."
    )

    # ----- Animal mean/std and stored rows ---------------------------------
    scaler = StandardScaler()
    scaler.fit(X)
    mean_diff = float(
        np.max(np.abs(scaler.mean_ - np.array(animal["mean"])))
    )
    std_diff = float(
        np.max(np.abs(scaler.scale_ - np.array(animal["std"])))
    )
    assert mean_diff <= TOLERANCE, "animal mean differs from sklearn"
    assert std_diff <= TOLERANCE, "animal std differs from sklearn"
    print(
        "Animal mean/std: matches sklearn "
        f"(mean diff {mean_diff:.2e}, std diff {std_diff:.2e})."
    )

    rows = animal["rows"]
    row_ids = [str(row["id"]) for row in rows]
    assert row_ids == data["session_id"].tolist(), (
        "animal row ids must match games.csv in session_id order"
    )

    examples = [
        [float(value) for value in row["features"]] for row in rows
    ]
    example_diff = float(
        np.max(np.abs(np.array(examples) - X.to_numpy()))
    )
    assert example_diff <= TOLERANCE, "animal row features differ from games.csv"
    print(f"Animal rows: {len(rows)} ids and features match games.csv.")

    expected_percentiles = data["final_score"].rank(
        pct=True, method="average"
    )
    exported_percentiles = [
        float(row["score_percentile"]) for row in rows
    ]
    percentile_diff = float(
        np.max(
            np.abs(
                np.array(exported_percentiles)
                - expected_percentiles.to_numpy()
            )
        )
    )
    assert percentile_diff <= TOLERANCE, "exported percentiles are wrong"
    print(
        "Animal percentiles: match pandas score percentiles "
        f"(max diff {percentile_diff:.2e})."
    )

    # ----- Nearest neighbor: plain Python vs sklearn -----------------------
    mean = [float(value) for value in animal["mean"]]
    std = [float(value) for value in animal["std"]]

    scaled_examples = [
        standardize(example, mean, std) for example in examples
    ]
    reference_nn = NearestNeighbors(n_neighbors=1)
    reference_nn.fit(scaled_examples)

    queries = [standardize(values, mean, std) for values in feature_values]
    sklearn_distances, sklearn_indices = reference_nn.kneighbors(
        queries, n_neighbors=1
    )

    index_matches = 0
    distance_matches = 0
    equal_distance_ties = 0
    max_distance_diff = 0.0

    for query, sklearn_index, sklearn_distance in zip(
        queries, sklearn_indices[:, 0], sklearn_distances[:, 0]
    ):
        plain_index, plain_distance = nearest_example(query, scaled_examples)
        max_distance_diff = max(
            max_distance_diff, abs(plain_distance - float(sklearn_distance))
        )

        if abs(plain_distance - float(sklearn_distance)) <= TOLERANCE:
            distance_matches += 1
        if plain_index == int(sklearn_index):
            index_matches += 1
        elif abs(plain_distance - float(sklearn_distance)) <= TOLERANCE:
            # Same distance, different index: both points are equally close.
            equal_distance_ties += 1

    assert distance_matches == CHECK_COUNT, "NN distances differ from sklearn"
    assert index_matches + equal_distance_ties == CHECK_COUNT, (
        "NN index differs from sklearn without an equal-distance tie"
    )
    # Duplicate feature rows are legitimate: two games can have the same
    # final_score, avg_reaction_sec, highest_sequence_length, and success_rate.
    # In that case either row is a correct nearest neighbor because the
    # feature vector (and therefore the score percentile) is identical.
    print(
        f"Nearest neighbor: {distance_matches}/{CHECK_COUNT} distances match "
        f"sklearn (max diff {max_distance_diff:.2e}); "
        f"{index_matches} exact index matches, "
        f"{equal_distance_ties} equal-distance ties."
    )

    # ----- Animal tiers cover every percentile -----------------------------
    tiers = animal["tiers"]
    thresholds = [float(tier["percentile_min"]) for tier in tiers]
    assert thresholds == sorted(
        thresholds, reverse=True
    ), "tiers must be ordered best-first"
    assert thresholds[0] == 0.90, "top tier must start at 0.90"
    assert thresholds[-1] == 0.00, "last tier must start at 0.00"

    for index, tier in enumerate(tiers):
        boundary = float(tier["percentile_min"])
        assert (
            percentile_to_animal(tiers, boundary) == tier["animal"]
        ), "tier boundary maps to the wrong animal"
        if index + 1 < len(tiers):
            just_below = boundary - 1e-9
            assert (
                percentile_to_animal(tiers, just_below)
                == tiers[index + 1]["animal"]
            ), "percentile just below a boundary maps to the wrong animal"

    for row in animal["rows"]:
        percentile_to_animal(tiers, float(row["score_percentile"]))

    print(
        f"Animal tiers: {len(tiers)} boundaries valid and all "
        f"{n_rows} percentiles map to an animal."
    )

    # ----- Extra check: queries not present in the stored examples ---------
    # Random games are stored examples, so their nearest distance is 0.
    # Jittering them creates new, unseen-style queries with non-zero distance.
    jitter = random.Random(RANDOM_STATE + 1)
    raw_std = X.std(ddof=0).to_numpy()
    jittered_queries = []
    for row_index in indices:
        original = data.iloc[row_index][FEATURE_COLUMNS].to_numpy(dtype=float)
        noisy = [
            float(original[column] + jitter.gauss(0.0, 0.10) * raw_std[column])
            for column in range(len(FEATURE_COLUMNS))
        ]
        jittered_queries.append(standardize(noisy, mean, std))

    jittered_distances, jittered_indices = reference_nn.kneighbors(
        jittered_queries, n_neighbors=1
    )
    jitter_matches = 0
    jitter_max_diff = 0.0
    for query, sklearn_distance in zip(
        jittered_queries, jittered_distances[:, 0]
    ):
        _, plain_distance = nearest_example(query, scaled_examples)
        difference = abs(plain_distance - float(sklearn_distance))
        jitter_max_diff = max(jitter_max_diff, difference)
        if difference <= TOLERANCE:
            jitter_matches += 1

    assert jitter_matches == CHECK_COUNT, "jittered NN distances differ"
    print(
        f"Jittered queries: {jitter_matches}/{CHECK_COUNT} NN distances match "
        f"sklearn (max diff {jitter_max_diff:.2e})."
    )

    print()
    print("ALL CHECKS PASSED: exported JSON matches sklearn.")


if __name__ == "__main__":
    main()
