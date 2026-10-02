"""Bradley-Terry trade-off weights per context bucket.

Each this-or-that duel probes one dimension (price / health / speed /
adventure / comfort). The winner's theta rises via an online logistic step:

    theta_dim <- theta_dim + lambda * (y - sigmoid(theta_a - theta_b))

Weights are stored per context bucket because rainy-evening trade-offs differ
from sunny-lunch ones.
"""

from __future__ import annotations

import math
from typing import Optional

from app.learning import store

DIMENSIONS = ["price", "health", "speed", "adventure", "comfort"]
LAMBDA = 0.4


def context_bucket(context: Optional[dict]) -> str:
    ctx = context or {}
    if str(ctx.get("weather", "")).lower() in ("rainy", "rain", "storm"):
        return "rainy"
    if ctx.get("is_weekend"):
        return "weekend"
    tod = str(ctx.get("time_of_day", "")).lower()
    if tod == "late_night":
        return "late_night"
    if tod in ("breakfast", "lunch"):
        return "weekday_lunch"
    return "weekday_dinner"


def _get_theta(user_id: str, bucket: str, dimension: str) -> tuple[float, int]:
    row = store.fetchone(
        """SELECT theta, n_duels FROM tradeoff_weights
           WHERE user_id = ? AND context_bucket = ? AND dimension = ?""",
        (user_id, bucket, dimension),
    )
    return (float(row["theta"]), int(row["n_duels"])) if row else (0.0, 0)


def _set_theta(user_id: str, bucket: str, dimension: str, theta: float, n: int) -> None:
    store.execute(
        """INSERT INTO tradeoff_weights (user_id, context_bucket, dimension, theta, n_duels, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id, context_bucket, dimension) DO UPDATE SET
             theta = excluded.theta, n_duels = excluded.n_duels, updated_at = CURRENT_TIMESTAMP""",
        (user_id, bucket, dimension, theta, n),
    )


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def observe_duel(
    user_id: str,
    dimension_a: str,
    dimension_b: str,
    winner: str,
    context: Optional[dict] = None,
) -> None:
    """One duel between two dimensions; winner must equal one of them."""
    if dimension_a not in DIMENSIONS or dimension_b not in DIMENSIONS:
        return
    bucket = context_bucket(context)
    theta_a, n_a = _get_theta(user_id, bucket, dimension_a)
    theta_b, n_b = _get_theta(user_id, bucket, dimension_b)
    y = 1.0 if winner == dimension_a else 0.0
    p = _sigmoid(theta_a - theta_b)
    delta = LAMBDA * (y - p)
    _set_theta(user_id, bucket, dimension_a, theta_a + delta, n_a + 1)
    _set_theta(user_id, bucket, dimension_b, theta_b - delta, n_b + 1)


def adjust_theta(user_id: str, dimension: str, delta: float, context: Optional[dict] = None) -> None:
    """Direct nudge from non-duel evidence (e.g. a 'too pricey' veto)."""
    if dimension not in DIMENSIONS:
        return
    bucket = context_bucket(context)
    theta, n = _get_theta(user_id, bucket, dimension)
    _set_theta(user_id, bucket, dimension, theta + delta, n)


def get_weights(user_id: str, context: Optional[dict] = None) -> dict[str, float]:
    """Softmax-normalized weights over dimensions for the given context."""
    bucket = context_bucket(context)
    thetas = {d: _get_theta(user_id, bucket, d)[0] for d in DIMENSIONS}
    max_theta = max(thetas.values())
    exps = {d: math.exp(t - max_theta) for d, t in thetas.items()}
    total = sum(exps.values())
    return {d: e / total for d, e in exps.items()}


def sample_count(user_id: str, context: Optional[dict] = None) -> int:
    bucket = context_bucket(context)
    row = store.fetchone(
        "SELECT COALESCE(SUM(n_duels), 0) AS n FROM tradeoff_weights WHERE user_id = ? AND context_bucket = ?",
        (user_id, bucket),
    )
    return int(row["n"]) if row else 0


def config_knobs(user_id: str, context: Optional[dict] = None) -> dict:
    """Map adventure weight to diversity/temperature recommendation knobs."""
    weights = get_weights(user_id, context)
    adventure = weights.get("adventure", 0.2)
    if adventure >= 0.3:
        return {"diversity": "high", "temperature": 0.9}
    if adventure <= 0.12:
        return {"diversity": "low", "temperature": 0.5}
    return {"diversity": "medium", "temperature": 0.7}
