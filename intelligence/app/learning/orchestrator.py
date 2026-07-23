"""Adaptive question budget (5.5): decide which games (if any) to run.

Each game covers uncertainty axes with a fixed gain profile. Expected
information gain = sum(coverage * uncertainty). Games run in descending EIG
while EIG exceeds the game's friction cost and the question budget allows.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from app.learning import calibration, confidence, store, tradeoffs, user_model

# game -> (friction_cost, {axis: coverage})
GAME_PROFILES: dict[str, tuple[float, dict[str, float]]] = {
    "mood_checkin": (0.10, {"state": 1.0}),
    "swipe": (0.25, {"taste": 1.0, "craving": 0.2}),
    "this_or_that": (0.20, {"tradeoffs": 1.0}),
    "craving_radar": (0.10, {"craving": 1.0, "state": 0.2}),
    "budget_vibe": (0.05, {"tradeoffs": 0.3, "state": 0.3}),
    "day_story": (0.30, {"state": 0.7, "taste": 0.3}),
}

AXES = ["state", "taste", "tradeoffs", "calibration", "craving"]


def _axis_uncertainty(user_id: str, context: Optional[dict]) -> dict[str, float]:
    today = date.today().isoformat()

    # state: did we get a mood check-in today?
    checkin = store.fetchone(
        "SELECT 1 FROM mood_checkins WHERE user_id = ? AND day = ? LIMIT 1",
        (user_id, today),
    )
    state = 0.15 if checkin else 1.0

    # taste: swipe volume + vector stability
    _, _, n_events = user_model.load_vectors(user_id)
    taste = max(0.1, 1.0 - n_events / 60.0)

    # tradeoffs: BT duel count for this context bucket
    n_duels = tradeoffs.sample_count(user_id, context)
    tradeoff_unc = max(0.1, 1.0 - n_duels / 12.0)

    # calibration: unresolved prediction backlog means we're flying blind
    pending = store.get_calibration(user_id, "pending", {})
    accuracy = calibration.rolling_accuracy(user_id)
    calib = 0.8 if not accuracy else max(0.1, 1.0 - accuracy["n"] / 20.0)
    if len(pending) > 3:
        calib = min(1.0, calib + 0.2)

    # craving: session-scoped — no craving tags seen today
    craving_day = store.get_usage(user_id, "last_craving_day")
    craving = 0.2 if craving_day == today else 0.7

    return {
        "state": state,
        "taste": taste,
        "tradeoffs": tradeoff_unc,
        "calibration": calib,
        "craving": craving,
    }


def question_budget(user_id: str, context: Optional[dict] = None) -> tuple[int, float]:
    """(budget, confidence). Confidence gates mind-reader; SOS use lowers the floor."""
    conf = confidence.compute(user_id, context)
    if conf > 0.8:
        budget = 0
    elif conf > 0.6:
        budget = 1
    elif conf > 0.4:
        budget = 2
    else:
        budget = 3

    sos = store.get_usage(user_id, "sos_count", 0) or 0
    automation = store.get_usage(user_id, "automation_pref", "balanced")
    if sos >= 5 or automation == "hands_off":
        budget = min(budget, 1)
    return budget, conf


def game_plan(user_id: str, context: Optional[dict] = None) -> dict:
    """Ordered plan of games worth running right now."""
    budget, conf = question_budget(user_id, context)
    uncertainty = _axis_uncertainty(user_id, context)

    scored = []
    for game, (friction, coverage) in GAME_PROFILES.items():
        eig = sum(coverage.get(axis, 0.0) * uncertainty.get(axis, 0.0) for axis in AXES)
        if eig > friction:
            scored.append({"game": game, "eig": round(eig, 3)})
    scored.sort(key=lambda item: -item["eig"])

    mode = "mind_reader" if budget == 0 else "standard"
    return {
        "question_budget": budget,
        "confidence": conf,
        "mode": mode,
        "games": scored[:budget] if budget else [],
        "uncertainty": {axis: round(value, 3) for axis, value in uncertainty.items()},
    }
