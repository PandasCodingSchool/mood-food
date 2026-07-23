"""Calibration loop: predicted vs actual enjoyment.

The single most valuable signal — post-meal resolutions update every upstream
model AND the meta-stats that keep confidence honest (per-band accept rates,
rolling accuracy, per-cuisine user-vs-AI error for blind bets).
"""

from __future__ import annotations

from typing import Optional

from app.data.dishes import DISHES_BY_ID
from app.learning import store

ROLLING_WINDOW = 50  # observations kept for the rolling accuracy meter


def record_prediction(user_id: str, rec_id: str, dish_id: str, predicted_score: float, confidence: float) -> None:
    pending = store.get_calibration(user_id, "pending", {})
    pending[f"{rec_id}:{dish_id}"] = {
        "predicted": predicted_score,
        "confidence": confidence,
    }
    # Bound growth: keep the most recent ~100 outstanding predictions.
    if len(pending) > 100:
        for key in list(pending.keys())[: len(pending) - 100]:
            pending.pop(key, None)
    store.set_calibration(user_id, "pending", pending)


def resolve(user_id: str, rec_id: str, dish_id: Optional[str], predicted_score: Optional[float], actual_score: float) -> None:
    """Fold one post-meal outcome into the rolling stats."""
    pending = store.get_calibration(user_id, "pending", {})
    entry = pending.pop(f"{rec_id}:{dish_id}", None)
    store.set_calibration(user_id, "pending", pending)

    predicted = entry["predicted"] if entry else predicted_score
    confidence = entry["confidence"] if entry else None

    # Rolling accuracy: an outcome counts as a "hit" when actual >= 4 (nailed
    # it / good) — the user-facing "mind-read %" meter.
    history = store.get_calibration(user_id, "outcomes", [])
    history.append({"actual": actual_score, "predicted": predicted})
    history = history[-ROLLING_WINDOW:]
    store.set_calibration(user_id, "outcomes", history)

    hits = sum(1 for h in history if h["actual"] >= 4)
    store.set_calibration(
        user_id,
        "rolling_accuracy",
        {"accuracy": round(hits / len(history), 3), "n": len(history)},
    )

    # Per-confidence-band accept rates (calibrating the calibrator, 4.3).
    if confidence is not None:
        band = f"band_{min(int(confidence * 5), 4)}"  # 0-0.2 ... 0.8-1.0
        stats = store.get_calibration(user_id, band, {"n": 0, "hits": 0})
        stats["n"] += 1
        stats["hits"] += 1 if actual_score >= 4 else 0
        store.set_calibration(user_id, band, stats)


def record_blind_bet(user_id: str, dish_id: Optional[str], user_predicted_score: float) -> None:
    """Store the user's own bet so the eventual post-meal score grades BOTH."""
    bets = store.get_calibration(user_id, "blind_bets", {})
    if dish_id:
        bets[dish_id] = user_predicted_score
        store.set_calibration(user_id, "blind_bets", bets)


def grade_blind_bet(user_id: str, dish_id: Optional[str], actual_score: float) -> None:
    """On post-meal resolve, compare the user's bet per cuisine (2.4)."""
    if not dish_id:
        return
    bets = store.get_calibration(user_id, "blind_bets", {})
    bet = bets.pop(dish_id, None)
    store.set_calibration(user_id, "blind_bets", bets)
    if bet is None:
        return
    dish = DISHES_BY_ID.get(dish_id)
    cuisine = dish.cuisine.lower() if dish else "unknown"
    key = f"cuisine_{cuisine}"
    stats = store.get_calibration(user_id, key, {"n": 0, "user_abs_err": 0.0})
    stats["n"] += 1
    stats["user_abs_err"] += abs(bet - actual_score)
    store.set_calibration(user_id, key, stats)


def rolling_accuracy(user_id: str) -> Optional[dict]:
    return store.get_calibration(user_id, "rolling_accuracy")


def poorly_calibrated_cuisines(user_id: str, threshold: float = 1.5) -> list[str]:
    """Cuisines where the user misjudges their own enjoyment -> lean into discovery."""
    rows = store.fetchall(
        "SELECT key, value_json FROM calibration_stats WHERE user_id = ? AND key LIKE 'cuisine_%'",
        (user_id,),
    )
    import json as _json

    result = []
    for row in rows:
        stats = _json.loads(row["value_json"])
        if stats.get("n", 0) >= 3 and stats["user_abs_err"] / stats["n"] >= threshold:
            result.append(row["key"].removeprefix("cuisine_"))
    return result
