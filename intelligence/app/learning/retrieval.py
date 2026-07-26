"""Embedding retrieval stage for the recommendation pipeline.

Builds a session vector v_s = normalize(a*v_u + b*craving_vec + g*mood_vec)
(a=1; b=1.5 when craving tags are present — acute craving overrides baseline;
g=0.5 from the mood map's top archetype) and scores the catalogue by cosine,
minus the learned negative space. Returns per-dish retrieval scores that
``shortlist.score_dish`` blends in; absent a learned vector the stage is a
no-op and the pipeline behaves exactly as before.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

import numpy as np

from app.learning import embeddings, mood_map, store, user_model
from app.schemas.request import UserContext

logger = logging.getLogger("learning")

ALPHA_USER = 1.0
BETA_CRAVING = 1.5
GAMMA_MOOD = 0.5
RETRIEVAL_TOP_K = 50
RECENCY_PENALTY_DAYS = 7

_ARCHETYPE_ANCHOR_TEXT = {
    "comfort_carb": "warm comforting carb-heavy food like dal rice, pasta, khichdi",
    "fresh_light": "fresh light healthy food like salads, grilled bowls, fruit",
    "protein_hearty": "hearty protein-rich food like chicken, paneer, kebabs",
    "spicy_bold": "spicy bold intensely flavoured food",
    "soupy_warm": "warm soupy brothy food like soup, ramen, stew",
    "sweet_treat": "sweet indulgent dessert treats",
    "snacky": "light crunchy snacky finger food",
    "festive_rich": "rich festive celebratory food like biryani and feasts",
}


def _mood_archetype_vector(user_id: str, ctx: UserContext) -> Optional[np.ndarray]:
    mood = ctx.mood
    key = mood_map.mood_key(
        mood.energy_level if mood else None,
        mood.stress_level if mood else None,
    )
    top = mood_map.top_archetypes(user_id, key, count=1)
    if not top:
        return None
    archetype, weight = top[0]
    if weight < 0.55:  # no meaningful pull for this mood bucket
        return None
    anchor = _ARCHETYPE_ANCHOR_TEXT.get(archetype)
    return embeddings.embed_text(anchor) if anchor else None


def session_vector(user_id: str, ctx: UserContext) -> Optional[np.ndarray]:
    pos, _, _ = user_model.load_vectors(user_id)
    parts = []
    if pos is not None:
        parts.append(ALPHA_USER * pos)

    craving_tags = list(ctx.game_data.craving_tags) if ctx.game_data else []
    if craving_tags:
        craving_vec = embeddings.embed_tags(craving_tags)
        if craving_vec is not None:
            parts.append(BETA_CRAVING * craving_vec)

    mood_vec = _mood_archetype_vector(user_id, ctx)
    if mood_vec is not None:
        parts.append(GAMMA_MOOD * mood_vec)

    if not parts:
        return None
    combined = np.sum(parts, axis=0)
    norm = np.linalg.norm(combined)
    return combined / norm if norm else None


def _recency_penalties(user_id: str) -> dict[str, float]:
    """'Had it recently' vetoes: temporary penalty, never a permanent one."""
    penalties = store.get_usage(user_id, "recency_penalties", {}) or {}
    cutoff = (date.today() - timedelta(days=RECENCY_PENALTY_DAYS)).isoformat()
    return {dish_id: -6.0 for dish_id, day in penalties.items() if day and day >= cutoff}


def retrieval_scores(user_id: Optional[str], ctx: UserContext) -> dict[str, float]:
    """Per-dish blend bonus for shortlist scoring. Empty dict = stage skipped."""
    if not user_id:
        return {}
    try:
        vector = session_vector(user_id, ctx)
        scores: dict[str, float] = {}
        if vector is not None:
            _, neg, _ = user_model.load_vectors(user_id)
            matrix, dish_ids = embeddings.load_dish_matrix()
            if matrix is not None:
                sims = matrix @ vector
                if neg is not None and np.linalg.norm(neg) > 0:
                    sims = sims - 0.5 * (matrix @ neg)
                order = np.argsort(-sims)[:RETRIEVAL_TOP_K]
                scores = {dish_ids[i]: float(sims[i]) for i in order}
        for dish_id, penalty in _recency_penalties(user_id).items():
            scores[dish_id] = scores.get(dish_id, 0.0) + penalty
        return scores
    except Exception:  # noqa: BLE001 — retrieval must never break recommendations
        logger.exception("Retrieval stage failed; continuing without it")
        return {}
