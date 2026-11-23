"""
Write docs/game_rules.json from ml/game_rules.py (the single source of truth).

JavaScript tools (tools/fake_live_game.js) read this file instead of copying
formulas by hand. The speed bonus is exported as a step table per level
(response time in whole ms -> bonus), so no JavaScript re-implements it.

    python ml/export_rules.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import game_rules as gr

OUT = Path(__file__).resolve().parent.parent / "docs" / "game_rules.json"


def bonus_steps(level: int) -> list[list[int]]:
    """[[from_ms, bonus], ...]: the bonus for a response of from_ms or more."""
    seq_len = gr.sequence_length(level)
    deadline = gr.deadline_seconds(level)
    steps: list[list[int]] = []
    for ms in range(0, math.ceil(seq_len * deadline * 1000) + 2):
        bonus = gr.speed_bonus(ms / 1000, seq_len, deadline)
        if not steps or steps[-1][1] != bonus:
            steps.append([ms, bonus])
    assert steps[-1][1] == 0, "the bonus must reach 0 within the table"
    return steps


def build() -> dict:
    return {
        "version": 1,
        "source": "ml/game_rules.py (written by ml/export_rules.py, do not edit by hand)",
        "start_lives": gr.START_LIVES,
        "max_level": gr.MAX_LEVEL,
        "buttons": [
            {"button": b, "color": gr.BUTTONS[b], "note": gr.BUTTON_NOTES[b]} for b in sorted(gr.BUTTONS)
        ],
        "min_deadline_ms": gr.MIN_DEADLINE_MS,
        "timing_ms": {
            "countdown_seconds": gr.COUNTDOWN_SECONDS,
            "countdown_step": gr.COUNTDOWN_STEP_MS,
            "go": gr.GO_MS,
            "retry_pause": gr.RETRY_PAUSE_MS,
            "next_level_pause": gr.NEXT_LEVEL_PAUSE_MS,
        },
        "levels": [
            {
                "level": level,
                "sequence_length": gr.sequence_length(level),
                "deadline_ms": gr.max_deadline_ms(level),
                "cue_ms": gr.cue_ms(level),
                "gap_ms": gr.gap_ms(level),
                "base_points": gr.points_for_pass(level, 0),
                "speed_bonus_steps": bonus_steps(level),
            }
            for level in range(1, gr.MAX_LEVEL + 1)
        ],
        "notes": [
            "deadline_ms is the LONGEST time per press at that level; it restarts after every correct press.",
            "Quick players get less: after a pass the box sets max(min_deadline_ms, min(next cap, current, (3 x current + 2 x average press + 300) / 4)).",
            "points for a pass = base_points + the speed bonus for the attempt's response_ms.",
            "A fail costs one life; the same level comes back with a NEW random pattern.",
            "Every attempt: 1 2 3 GO!, the sequence plays, 1 2 3 BEGIN!, then the player's turn.",
            "START pressed during a game resets it to idle (no hold).",
        ],
    }


def main() -> None:
    data = build()
    OUT.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    # Self-check: the table gives exactly what game_rules.speed_bonus gives.
    for level_data in data["levels"]:
        level = level_data["level"]
        for ms in (0, 1234, 4100, 9999):
            expected = gr.speed_bonus(ms / 1000, gr.sequence_length(level), gr.deadline_seconds(level))
            got = [b for start, b in level_data["speed_bonus_steps"] if start <= ms][-1]
            assert got == expected, (level, ms, got, expected)
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes, {len(data['levels'])} levels)")


if __name__ == "__main__":
    main()
