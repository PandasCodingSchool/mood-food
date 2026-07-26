"""Adaptive persona archetypes (5.1): a human-legible summary of the model.

Users are assigned to the nearest of six hand-curated archetype centroids in
feature space (taste-vector-derived stats + trade-off weights + behavior). A
gpt-4o-mini blurb makes it fun; recomputed every ~10th signal batch.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from app.config import settings
from app.learning import calibration, store, tradeoffs, user_model

logger = logging.getLogger("learning")

# Feature order: [adventure_w, health_w, price_w, comfort_w, speed_w,
#                 late_night_ratio, wildcard_accept, order_frequency_norm]
ARCHETYPE_CENTROIDS: dict[str, list[float]] = {
    "The Comfort Seeker":       [0.10, 0.15, 0.20, 0.40, 0.15, 0.2, 0.2, 0.5],
    "The Adventurer":           [0.45, 0.15, 0.10, 0.10, 0.20, 0.3, 0.8, 0.6],
    "The Healthy-ish Realist":  [0.15, 0.45, 0.15, 0.15, 0.10, 0.1, 0.4, 0.5],
    "The 9pm Snacker":          [0.15, 0.10, 0.20, 0.25, 0.30, 0.9, 0.3, 0.7],
    "The Value Maximizer":      [0.10, 0.15, 0.50, 0.15, 0.10, 0.3, 0.3, 0.5],
    "The Social Feaster":       [0.25, 0.10, 0.10, 0.25, 0.30, 0.4, 0.5, 0.8],
}


def _features(user_id: str) -> Optional[list[float]]:
    _, _, n_events = user_model.load_vectors(user_id)
    if n_events < 5:
        return None
    weights = tradeoffs.get_weights(user_id)  # default bucket blend
    by_bucket = store.get_usage(user_id, "signals_by_bucket", {}) or {}
    total = sum(by_bucket.values()) or 1
    late_ratio = by_bucket.get("late_night", 0) / total
    wildcard = store.get_usage(user_id, "wildcard_stats", {"n": 0, "accepted": 0})
    wildcard_rate = wildcard["accepted"] / wildcard["n"] if wildcard["n"] else 0.3
    n_signals = store.get_usage(user_id, "n_signals", 0) or 0
    return [
        weights.get("adventure", 0.2),
        weights.get("health", 0.2),
        weights.get("price", 0.2),
        weights.get("comfort", 0.2),
        weights.get("speed", 0.2),
        late_ratio,
        wildcard_rate,
        min(1.0, n_signals / 100.0),
    ]


def _nearest_archetype(features: list[float]) -> str:
    best, best_dist = None, float("inf")
    for name, centroid in ARCHETYPE_CENTROIDS.items():
        dist = sum((f - c) ** 2 for f, c in zip(features, centroid))
        if dist < best_dist:
            best, best_dist = name, dist
    return best or "The Comfort Seeker"


def _write_blurb(user_id: str, archetype: str, previous: Optional[str]) -> tuple[str, str]:
    """LLM blurb + drift line; deterministic fallback when no key."""
    drift = (
        f"You've shifted from {previous} to {archetype} lately."
        if previous and previous != archetype
        else "Holding steady — your taste identity is settling in."
    )
    if not settings.openai_api_key:
        return f"You're {archetype} — your picks tell the story.", drift
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        accuracy = calibration.rolling_accuracy(user_id)
        response = client.chat.completions.create(
            model=settings.openai_mini_model,
            max_tokens=120,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Write a fun, warm, 2-sentence food-personality blurb for a user whose "
                        f"archetype is '{archetype}'. Their AI mind-read accuracy is "
                        f"{accuracy['accuracy'] if accuracy else 'unknown'}. Second person, playful, "
                        f"no emojis, no lists."
                    ),
                }
            ],
        )
        return response.choices[0].message.content.strip(), drift
    except Exception as exc:  # noqa: BLE001
        logger.warning("Persona blurb generation failed: %s", exc)
        return f"You're {archetype} — your picks tell the story.", drift


def recompute(user_id: str, force: bool = False) -> Optional[dict]:
    """Recompute persona if due (every ~10th signal) or forced."""
    n_signals = store.get_usage(user_id, "n_signals", 0) or 0
    if not force and (n_signals < 5 or n_signals % 10 != 0):
        return get(user_id)
    features = _features(user_id)
    if features is None:
        return None
    row = store.fetchone("SELECT archetype FROM personas WHERE user_id = ?", (user_id,))
    previous = row["archetype"] if row else None
    archetype = _nearest_archetype(features)
    blurb, drift = _write_blurb(user_id, archetype, previous)
    store.execute(
        """INSERT INTO personas (user_id, archetype, blurb, drift_line, features_json, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET
             archetype = excluded.archetype, blurb = excluded.blurb,
             drift_line = excluded.drift_line, features_json = excluded.features_json,
             updated_at = CURRENT_TIMESTAMP""",
        (user_id, archetype, blurb, drift, json.dumps(features)),
    )
    return {"archetype": archetype, "blurb": blurb, "drift_line": drift}


def get(user_id: str) -> Optional[dict]:
    row = store.fetchone(
        "SELECT archetype, blurb, drift_line FROM personas WHERE user_id = ?",
        (user_id,),
    )
    if not row:
        return None
    return {"archetype": row["archetype"], "blurb": row["blurb"], "drift_line": row["drift_line"]}
