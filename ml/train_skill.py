#!/usr/bin/env python3
"""
Rhythm Rush - Phase B: train the Skill Classifier.

Target label: player_type from players_hidden.csv
Input features: ONLY the 4 gameplay features below.
Forbidden columns (skill_label, player_type, hidden_skill, hidden_speed,
next_level_steps) are never model inputs.

Run from the project root:
    python ml/train_skill.py

Export:
    backend/artifacts/skill.json
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier, export_text

# The exact feature order required by the export format in AGENTS.md.
FEATURE_COLUMNS = [
    "final_score",
    "avg_reaction_sec",
    "highest_sequence_length",
    "success_rate",
]

# These columns contain labels or hidden simulator values. They must never be
# passed to the model as inputs.
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


def load_data() -> pd.DataFrame:
    """Load games, attach hidden labels, and keep one row per session."""
    games = pd.read_csv(DATA_DIR / "games.csv")
    hidden = pd.read_csv(DATA_DIR / "players_hidden.csv")

    data = games.merge(
        hidden,
        on="session_id",
        how="inner",
        validate="one_to_one",
    )
    # Sorting makes the split reproducible even if a CSV row order changes.
    data = data.sort_values("session_id").reset_index(drop=True)

    assert len(data) == len(games) == len(hidden), "join must keep every game"
    return data


def tree_to_export(model: DecisionTreeClassifier) -> dict:
    """Convert sklearn's tree into the JSON format used by Express."""
    tree = model.tree_
    nodes = []

    for node_id in range(tree.node_count):
        left = int(tree.children_left[node_id])
        right = int(tree.children_right[node_id])

        if left == -1 and right == -1:
            # Leaf node: store the class name, not a feature check.
            class_index = int(np.argmax(tree.value[node_id][0]))
            nodes.append(
                {
                    "id": node_id,
                    "leaf": str(model.classes_[class_index]),
                }
            )
        else:
            # Internal node: go left when value <= threshold.
            nodes.append(
                {
                    "id": node_id,
                    "feature": int(tree.feature[node_id]),
                    "threshold": float(tree.threshold[node_id]),
                    "left": left,
                    "right": right,
                }
            )

    return {
        "version": 1,
        "features": FEATURE_COLUMNS,
        "nodes": nodes,
    }


def main() -> None:
    data = load_data()

    # The target is the simulator's hidden skill class, not a score percentile.
    y = data["player_type"]

    # Print class counts first, as required by Phase B.
    print("Class counts (target = player_type):")
    print(y.value_counts().sort_index().to_string())
    print()

    # Select ONLY the 4 allowed features. This is the input matrix.
    X = data[FEATURE_COLUMNS]

    # Explicit guard: no label or hidden column may enter the model.
    assert list(X.columns) == FEATURE_COLUMNS, "inputs must be the 4 features"
    assert set(FEATURE_COLUMNS) == {
        "final_score",
        "avg_reaction_sec",
        "highest_sequence_length",
        "success_rate",
    }, "unexpected feature list"
    assert not any(
        column in X.columns for column in FORBIDDEN_INPUT_COLUMNS
    ), "forbidden label/hidden columns must never be model inputs"

    # 80/20 split, stratified, fixed seed 42.
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    print(f"Train rows: {len(X_train)}")
    print(f"Test rows: {len(X_test)}")
    print()

    model = DecisionTreeClassifier(max_depth=3, random_state=RANDOM_STATE)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    labels = list(model.classes_)
    matrix = confusion_matrix(y_test, y_pred, labels=labels)

    print(f"Accuracy: {accuracy:.4f} ({accuracy * 100:.2f}%)")
    print()
    print("Confusion matrix (rows = true, columns = predicted):")
    print(pd.DataFrame(matrix, index=labels, columns=labels).to_string())
    print()
    print("Decision tree rules:")
    print(export_text(model, feature_names=FEATURE_COLUMNS))

    payload = tree_to_export(model)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = ARTIFACTS_DIR / "skill.json"

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)

    print(f"Wrote {output_path} ({len(payload['nodes'])} nodes)")


if __name__ == "__main__":
    main()
