#!/usr/bin/env python3
"""
Rhythm Rush - single source of truth for game rules.

Every script that needs a game constant or formula must import it from here.
Never copy these numbers into another file. That way, if the game designer
changes a rule, we only change it in one place.

Run this file directly to check the formulas:
    python ml/game_rules.py
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Basic game constants
# ---------------------------------------------------------------------------

# Button number -> colour shown in the UI.
BUTTONS = {
    1: "Red",
    2: "Orange",
    3: "Yellow",
    4: "Green",
    5: "Blue",
    6: "Purple",
}

START_LIVES = 3          # a player starts with 3 lives
MAX_LEVEL = 15           # clearing level 15 wins the game
MAX_SPEED_BONUS = 50     # speed bonus is clamped to 0..50

# Deadline formula: deadline = max(1.5, 3.0 - 0.2 * (level - 1))
BASE_DEADLINE_SEC = 3.0
DEADLINE_REDUCTION_PER_LEVEL = 0.2
MIN_DEADLINE_SEC = 1.5

# Scoring formula: points = 100 * level + speed_bonus
POINTS_PER_LEVEL = 100

# Used when a finished game has no passed attempts.
DEFAULT_AVG_REACTION_SEC = 3.0


# ---------------------------------------------------------------------------
# Game formulas
# ---------------------------------------------------------------------------

def sequence_length(level: int) -> int:
    """How many buttons must be pressed at a level: level + 2."""
    return level + 2


def deadline_seconds(level: int) -> float:
    """Seconds allowed for each press at a level."""
    return max(
        MIN_DEADLINE_SEC,
        BASE_DEADLINE_SEC - DEADLINE_REDUCTION_PER_LEVEL * (level - 1),
    )


def speed_bonus(response_seconds: float, seq_len: int, deadline: float) -> int:
    """
    Speed bonus for a passed level, clamped to 0..50.

    response_seconds is the total time from the end of playback to the last
    correct press. seq_len * deadline is the slowest allowed total time.
    """
    raw_bonus = round(
        MAX_SPEED_BONUS * (1 - response_seconds / (seq_len * deadline))
    )
    return max(0, min(MAX_SPEED_BONUS, int(raw_bonus)))


def points_for_pass(level: int, bonus: int) -> int:
    """Points awarded for passing a level."""
    return POINTS_PER_LEVEL * level + bonus


def success_rate(successful_rounds: int, failed_attempts: int) -> float:
    """successful_rounds / all attempts, or 0 when there were no attempts."""
    total = successful_rounds + failed_attempts
    return successful_rounds / total if total else 0.0


def reaction_ratio(avg_reaction_sec: float, level: int) -> float:
    """
    Difficulty-model input: average reaction time divided by the deadline.

    A value below 1 means the player was faster than the deadline on average.
    This value is not clamped here; the difficulty bootstrap rule clamps it.
    """
    return avg_reaction_sec / deadline_seconds(level)


# ---------------------------------------------------------------------------
# Self-test (run: python ml/game_rules.py)
# ---------------------------------------------------------------------------

def _self_test() -> None:
    assert len(BUTTONS) == 6
    assert BUTTONS[1] == "Red"
    assert BUTTONS[6] == "Purple"

    assert sequence_length(1) == 3
    assert sequence_length(15) == 17

    assert deadline_seconds(1) == 3.0
    assert round(deadline_seconds(8), 3) == 1.6
    assert deadline_seconds(9) == 1.5
    assert deadline_seconds(15) == 1.5

    # A perfect instant response gets the maximum bonus.
    assert speed_bonus(0.0, 3, 3.0) == 50
    # Using the whole allowed time gets no bonus.
    assert speed_bonus(9.0, 3, 3.0) == 0
    # Too slow is still clamped to 0.
    assert speed_bonus(12.0, 3, 3.0) == 0

    assert points_for_pass(5, 25) == 525
    assert success_rate(3, 1) == 0.75
    assert success_rate(0, 0) == 0.0
    assert reaction_ratio(1.5, 9) == 1.0

    print("game_rules.py self-check passed")


if __name__ == "__main__":
    _self_test()
