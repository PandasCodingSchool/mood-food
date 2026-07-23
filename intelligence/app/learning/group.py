"""Group consensus (3.6): maximize the minimum satisfaction across members.

score(d) = min over members of (cos(v_m, v_d) - 0.5*cos(v_m^-, v_d)) — so
nobody is miserable. Guests without profiles get cold-start vectors built
from their lobby swipes only.
"""

from __future__ import annotations

import numpy as np

from app.data.dishes import DISHES_BY_ID
from app.learning import embeddings, user_model


def _guest_vectors(guest_swipes: list[dict]) -> list[tuple[np.ndarray, np.ndarray]]:
    """Build (positive, negative) vectors per guest from raw lobby swipes."""
    by_guest: dict[str, list[dict]] = {}
    for swipe in guest_swipes:
        by_guest.setdefault(str(swipe.get("guest_id", "anon")), []).append(swipe)

    vectors = []
    for swipes in by_guest.values():
        liked, disliked = [], []
        for s in swipes:
            vec = embeddings.get_dish_vector(str(s.get("dish_id", "")))
            if vec is None:
                vec = embeddings.get_dish_vector_by_name(str(s.get("item", "")))
            if vec is None:
                continue
            (liked if s.get("liked") else disliked).append(vec)
        if not liked and not disliked:
            continue
        pos = np.mean(liked, axis=0) if liked else embeddings.population_mean_vector()
        neg = np.mean(disliked, axis=0) if disliked else np.zeros_like(pos)
        pos_norm = np.linalg.norm(pos)
        neg_norm = np.linalg.norm(neg)
        vectors.append(
            (
                pos / pos_norm if pos_norm else pos,
                neg / neg_norm if neg_norm else neg,
            )
        )
    return vectors


def consensus(
    member_ids: list[str],
    guest_swipes: list[dict] | None = None,
    count: int = 3,
) -> list[dict]:
    """Top dishes by maximin satisfaction, with per-member match scores."""
    members: list[tuple[np.ndarray, np.ndarray]] = []
    labels: list[str] = []

    for member_id in member_ids:
        pos, neg, _ = user_model.load_vectors(member_id)
        if pos is not None:
            members.append((pos, neg if neg is not None else np.zeros_like(pos)))
            labels.append(member_id)

    for i, pair in enumerate(_guest_vectors(guest_swipes or [])):
        members.append(pair)
        labels.append(f"guest_{i + 1}")

    if not members:
        return []

    matrix, dish_ids = embeddings.load_dish_matrix()
    if matrix is None:
        return []

    results = []
    for idx, dish_id in enumerate(dish_ids):
        dish_vec = matrix[idx]
        member_scores = [
            float(pos @ dish_vec) - 0.5 * float(neg @ dish_vec) for pos, neg in members
        ]
        results.append(
            {
                "dish_id": dish_id,
                "dish_name": DISHES_BY_ID[dish_id].name if dish_id in DISHES_BY_ID else dish_id,
                "min_score": min(member_scores),
                "member_match": {
                    label: round(max(0.0, min(1.0, (s + 1) / 2)) * 100)
                    for label, s in zip(labels, member_scores)
                },
            }
        )
    results.sort(key=lambda item: -item["min_score"])
    return results[:count]
