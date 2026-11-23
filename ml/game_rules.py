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

# All rules below are copied from the box's firmware, RhythmRushGame.h
# (rr_default_config, rr_next_deadline, rr_pass, rr_cue_ms, rr_gap_ms).
START_LIVES = 3          # a player starts with 3 lives
MAX_LEVEL = 7            # clearing level 7 wins the game
MAX_SPEED_BONUS = 50     # speed bonus is clamped to 0..50

# Time per press. Level 1 gives 3000 ms. After every PASSED level the box
# sets the next limit (rr_next_deadline): never above the level cap
# (3000 - 200 x (level - 1)), never above the current limit, and lower for
# quick players: (3 x current + 2 x average press + 300) / 4. Never below
# 1000 ms. A fail keeps the same limit.
BASE_DEADLINE_MS = 3000
DEADLINE_DROP_MS = 200
MIN_DEADLINE_MS = 1000

# Scoring formula: points = 100 * level + speed_bonus
POINTS_PER_LEVEL = 100

# Used when a finished game has no passed attempts.
DEFAULT_AVG_REACTION_SEC = 3.0

# ---------------------------------------------------------------------------
# Hardware timing (ESP32 panel; also drives the live web mirror and the fake
# live device through docs/game_rules.json, written by ml/export_rules.py)
# ---------------------------------------------------------------------------
BUTTON_NOTES = {1: "C5", 2: "D5", 3: "E5", 4: "F5", 5: "G5", 6: "A5"}  # rr_note: 523..880 Hz
# The lights get faster every level: one cue (LED lit) and the dark gap after it.
CUE_MS = 500             # level 1
CUE_DROP_MS = 45         # per level
MIN_CUE_MS = 180
CUE_GAP_MS = 200         # level 1
GAP_DROP_MS = 15         # per level
MIN_GAP_MS = 80
# Every attempt: "1 2 3 GO!" -> the sequence plays -> "1 2 3 BEGIN!" -> the
# player's turn. Retries and new levels count again too.
COUNTDOWN_SECONDS = 3    # 1, 2, 3 (counting up, as on the LCD)
COUNTDOWN_STEP_MS = 1000
GO_MS = 500              # word_ms: "Go!" before a sequence, "Begin!" before a turn
RETRY_PAUSE_MS = 2000    # result_ms: "Wrong sequence!" / "Time is up!", then a NEW pattern
NEXT_LEVEL_PAUSE_MS = 2000   # result_ms: "Correct!" + points gained, then the next level
# The box has one control, START: a press starts a game from idle, game over
# or a win; a press DURING a game resets it to idle (no hold needed).


# ---------------------------------------------------------------------------
# Game formulas
# ---------------------------------------------------------------------------

def sequence_length(level: int) -> int:
    """How many buttons must be pressed at a level: level + 2."""
    return level + 2


def max_deadline_ms(level: int) -> int:
    """The LONGEST time per press at a level (the cap; quick players get less)."""
    drop = DEADLINE_DROP_MS * (level - 1)
    return BASE_DEADLINE_MS - drop if BASE_DEADLINE_MS > drop else MIN_DEADLINE_MS


def deadline_seconds(level: int) -> float:
    """The longest seconds per press at a level (max_deadline_ms in seconds)."""
    return max_deadline_ms(level) / 1000


def next_deadline_ms(passed_level: int, current_ms: int, total_ms: int, seq_len: int) -> int:
    """
    Time per press for the level after `passed_level` (the box's rr_next_deadline).

    total_ms is the passed attempt's total response time, so total_ms // seq_len
    is the player's average press. Integer maths, exactly like the C code.
    """
    average = total_ms // seq_len
    adapted = (3 * current_ms + 2 * average + 300) // 4
    return max(MIN_DEADLINE_MS, min(max_deadline_ms(passed_level + 1), current_ms, adapted))


def cue_ms(level: int) -> int:
    """How long one cue (LED) is lit at a level."""
    return max(MIN_CUE_MS, CUE_MS - CUE_DROP_MS * (level - 1))


def gap_ms(level: int) -> int:
    """The dark gap after each cue at a level."""
    return max(MIN_GAP_MS, CUE_GAP_MS - GAP_DROP_MS * (level - 1))


def speed_bonus(response_seconds: float, seq_len: int, deadline: float) -> int:
    """
    Speed bonus for a passed level, 0..50 (the box's rr_pass).

    response_seconds is the total time of the player's turn; seq_len *
    deadline is the slowest allowed total. The box rounds half up in whole ms:
    (50 x unused + available / 2) / available.
    """
    total = int(round(response_seconds * 1000))
    available = int(round(seq_len * deadline * 1000))
    if available <= 0:
        return 0
    unused = max(0, available - total)
    return min(MAX_SPEED_BONUS, (MAX_SPEED_BONUS * unused + available // 2) // available)


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
    assert max_deadline_ms(MAX_LEVEL) == 1800
    assert max_deadline_ms(20) == MIN_DEADLINE_MS  # the floor
    # Slow player (average press 1.5 s): only the level cap applies.
    assert next_deadline_ms(1, 3000, 4500, 3) == 2800
    # Quick player (average press 0.5 s): (3 x 3000 + 2 x 500 + 300) / 4 = 2575.
    assert next_deadline_ms(1, 3000, 1500, 3) == 2575
    # Never below 1 second.
    assert next_deadline_ms(6, 1000, 900, 8) == MIN_DEADLINE_MS
    assert (cue_ms(1), gap_ms(1), cue_ms(7), gap_ms(7)) == (500, 200, 230, 110)
    assert cue_ms(20) == MIN_CUE_MS and gap_ms(20) == MIN_GAP_MS
    # Half rounds up, like the C code: 50 x 0.3 of the time unused = 15.
    assert speed_bonus(6.3, 3, 3.0) == 15
    assert speed_bonus(0.09, 3, 3.0) == 50  # 49.5 rounds up

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
