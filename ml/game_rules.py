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

# Button number -> colour shown in the UI. Copied from the real box: buttons
# 1-3 are the top row and 4-6 the bottom row, left to right. Two colours repeat
# (only these buttons were available); a green LED above each button lights
# the sequence, because the buttons cannot light up themselves.
BUTTONS = {
    1: "Red",
    2: "Orange",
    3: "Blue",
    4: "Blue",
    5: "Yellow",
    6: "Red",
}

START_LIVES = 3          # a player starts with 3 lives
MAX_LEVEL = 7            # clearing level 7 wins the game (the hardware sketch)
MAX_SPEED_BONUS = 50     # speed bonus is clamped to 0..50

# Deadline formula: deadline = max(1.0, 3.0 - 0.2 * (level - 1))
# 3.0 and 1.0 match the sketch's initial_deadline_ms / minimum_deadline_ms.
# shortcut: the 0.2 s per level step is still our own guess; copy the real
# step from the firmware's RhythmRushGame.h once we have that file.
BASE_DEADLINE_SEC = 3.0
DEADLINE_REDUCTION_PER_LEVEL = 0.2
MIN_DEADLINE_SEC = 1.0

# Scoring formula: points = 100 * level + speed_bonus
POINTS_PER_LEVEL = 100

# Used when a finished game has no passed attempts.
DEFAULT_AVG_REACTION_SEC = 3.0

# ---------------------------------------------------------------------------
# Hardware timing (ESP32 panel; also drives the live web mirror and the fake
# live device through docs/game_rules.json, written by ml/export_rules.py)
# ---------------------------------------------------------------------------
BUTTON_NOTES = {1: "C4", 2: "D4", 3: "E4", 4: "F4", 5: "G4", 6: "A4"}
CUE_MS = 500             # one cue: LED ring lit + tone
CUE_GAP_MS = 200         # dark gap after each cue
# Every attempt: "1 2 3 GO!" -> the sequence plays -> "1 2 3 BEGIN!" -> the
# player's turn. Retries and new levels count again too.
COUNTDOWN_SECONDS = 3    # 1, 2, 3 (counting up, as on the LCD)
COUNTDOWN_STEP_MS = 1000
GO_MS = 600              # "GO!" before a sequence, "BEGIN!" before a turn
GET_READY_MS = 350       # optional pause before every playback
RETRY_PAUSE_MS = 1000    # life lost, shown before the NEW pattern of the same level
NEXT_LEVEL_PAUSE_MS = 1000   # "NICE! +points" before the next level
RESTART_MS = 500         # "GAME STOPPED" after RESET, then idle
RESET_HOLD_MS = 2000     # START held this long during a game = RESET to idle (the box has no RESET button)


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
    assert BUTTONS[6] == "Red"

    assert sequence_length(1) == 3
    assert sequence_length(MAX_LEVEL) == 9

    assert deadline_seconds(1) == 3.0
    assert round(deadline_seconds(MAX_LEVEL), 3) == 1.8
    assert deadline_seconds(11) == 1.0  # the floor (beyond the last level today)

    # A perfect instant response gets the maximum bonus.
    assert speed_bonus(0.0, 3, 3.0) == 50
    # Using the whole allowed time gets no bonus.
    assert speed_bonus(9.0, 3, 3.0) == 0
    # Too slow is still clamped to 0.
    assert speed_bonus(12.0, 3, 3.0) == 0

    assert points_for_pass(5, 25) == 525
    assert success_rate(3, 1) == 0.75
    assert success_rate(0, 0) == 0.0
    assert reaction_ratio(3.0, 1) == 1.0

    print("game_rules.py self-check passed")


if __name__ == "__main__":
    _self_test()
