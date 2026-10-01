"""User tower: an online-updated taste vector in the dish-embedding space.

Two vectors per user: ``positive`` (what pulls them) and ``negative`` (the
reliably-rejected "negative space"). Retrieval score for a dish d is
``cos(v_u, v_d) - 0.5 * cos(v_u^-, v_d)``.

Update rule (pure fold — replay-safe):
    v <- normalize(v + eta_n * s * w * v_d)
    eta_n = 0.2 / (1 + 0.02 * n_events)
"""

from __future__ import annotations

import json
from typing import Optional

import numpy as np

from app.learning import embeddings, store

# Event weights (s = direction, w = magnitude)
ORDER_WEIGHT = 1.5
LIKE_WEIGHT = 1.0
VETO_RICHNESS_WEIGHT = 0.6


def _eta(n_events: int) -> float:
    return 0.2 / (1 + 0.02 * n_events)


def swipe_weight(reaction_time_ms: Optional[float]) -> float:
    """Snap judgments count more: w = clip(1500/rt, 0.5, 2.0)."""
    if not reaction_time_ms or reaction_time_ms <= 0:
        return 1.0
    return float(np.clip(1500.0 / reaction_time_ms, 0.5, 2.0))


def post_meal_weight(actual_score: float) -> float:
    """Signed: 5 -> +2.0, 3 -> 0, 1 -> -2.0."""
    return (actual_score - 3.0) / 2.0 * 2.0


def _normalize(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm else v


def load_vectors(user_id: str) -> tuple[Optional[np.ndarray], Optional[np.ndarray], int]:
    row = store.fetchone(
        "SELECT positive_json, negative_json, n_events FROM user_vectors WHERE user_id = ?",
        (user_id,),
    )
    if not row:
        return None, None, 0
    return (
        np.array(json.loads(row["positive_json"]), dtype=np.float32),
        np.array(json.loads(row["negative_json"]), dtype=np.float32),
        int(row["n_events"]),
    )


def _save_vectors(user_id: str, pos: np.ndarray, neg: np.ndarray, n_events: int) -> None:
    store.execute(
        """INSERT INTO user_vectors (user_id, positive_json, negative_json, n_events, model_version, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET
             positive_json = excluded.positive_json,
             negative_json = excluded.negative_json,
             n_events = excluded.n_events,
             model_version = excluded.model_version,
             updated_at = CURRENT_TIMESTAMP""",
        (
            user_id,
            json.dumps([round(float(x), 6) for x in pos]),
            json.dumps([round(float(x), 6) for x in neg]),
            n_events,
            embeddings.MODEL_VERSION,
        ),
    )


def _init_vectors() -> tuple[Optional[np.ndarray], Optional[np.ndarray]]:
    prior = embeddings.population_mean_vector()
    if prior is None:
        return None, None
    return prior.copy(), np.zeros_like(prior)


def update(
    user_id: str,
    dish_vector: Optional[np.ndarray],
    direction: float,
    weight: float = 1.0,
) -> None:
    """Apply one signed event to the user's taste vectors.

    direction > 0 pulls the positive vector toward the dish; direction < 0
    pushes it away AND pulls the negative vector toward the dish (the
    negative space is learned explicitly, not just as absence).
    """
    if dish_vector is None:
        return
    pos, neg, n = load_vectors(user_id)
    if pos is None:
        pos, neg = _init_vectors()
        if pos is None:
            return
    eta = _eta(n)
    step = eta * abs(direction) * weight
    if direction > 0:
        pos = _normalize(pos + step * dish_vector)
    else:
        pos = _normalize(pos - step * dish_vector)
        neg_norm = np.linalg.norm(neg)
        neg = (neg * neg_norm + step * dish_vector) if neg_norm else step * dish_vector
        neg = _normalize(neg)
    _save_vectors(user_id, pos, neg, n + 1)


def score_dish(user_id: str, dish_vector: np.ndarray) -> Optional[float]:
    pos, neg, _ = load_vectors(user_id)
    if pos is None:
        return None
    score = float(pos @ dish_vector)
    if neg is not None and np.linalg.norm(neg) > 0:
        score -= 0.5 * float(neg @ dish_vector)
    return score


def taste_vector_payload(user_id: str) -> Optional[dict]:
    """Shape mirrored into the Node taste_vector table."""
    pos, _, n = load_vectors(user_id)
    if pos is None:
        return None
    return {
        "embedding": [round(float(x), 6) for x in pos],
        "dim": int(pos.shape[0]),
        "model_version": embeddings.MODEL_VERSION,
        "n_events": n,
    }
