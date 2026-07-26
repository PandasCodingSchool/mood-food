"""Anti-rut detector (5.3): entropy over recent pick archetypes.

When the last-N picks collapse into few archetypes (Shannon entropy below
threshold), flag a wildcard: a dish moderately similar to the taste vector
(cos in [0.55, 0.75]) from an archetype outside the recent set — safe but
fresh. Wildcard accept rate is tracked to tune how far to push.
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Optional

from app.data.dishes import DISHES
from app.learning import mood_map, store, user_model, embeddings

WINDOW = 20
ENTROPY_THRESHOLD = 1.2  # nats
SIMILARITY_BAND = (0.55, 0.75)


def record_pick(user_id: str, signal_id: int, dish_id: Optional[str], kind: str) -> None:
    archetype = mood_map.archetype_of_dish_id(dish_id)
    store.execute(
        """INSERT OR IGNORE INTO recent_picks (user_id, signal_id, dish_id, archetype, kind)
           VALUES (?, ?, ?, ?, ?)""",
        (user_id, signal_id, dish_id, archetype, kind),
    )


def _recent_archetypes(user_id: str) -> list[str]:
    rows = store.fetchall(
        """SELECT archetype FROM recent_picks
           WHERE user_id = ? AND archetype IS NOT NULL
           ORDER BY signal_id DESC LIMIT ?""",
        (user_id, WINDOW),
    )
    return [row["archetype"] for row in rows]


def order_entropy(user_id: str) -> Optional[float]:
    archetypes = _recent_archetypes(user_id)
    if len(archetypes) < 5:
        return None  # not enough data to call a rut
    counts = Counter(archetypes)
    total = len(archetypes)
    return -sum((c / total) * math.log(c / total) for c in counts.values())


def in_rut(user_id: str) -> bool:
    entropy = order_entropy(user_id)
    return entropy is not None and entropy < ENTROPY_THRESHOLD


def wildcard_candidates(user_id: str, limit: int = 5) -> list[str]:
    """Safe-but-fresh dish ids: similarity band + unexplored archetype."""
    matrix, ids = embeddings.load_dish_matrix()
    if matrix is None:
        return []
    recent = set(_recent_archetypes(user_id))
    picks: list[tuple[str, float]] = []
    for dish in DISHES:
        if mood_map.dish_archetype(dish) in recent:
            continue
        vec = embeddings.get_dish_vector(dish.id)
        if vec is None:
            continue
        score = user_model.score_dish(user_id, vec)
        if score is None:
            continue
        if SIMILARITY_BAND[0] <= score <= SIMILARITY_BAND[1]:
            picks.append((dish.id, score))
    picks.sort(key=lambda pair: -pair[1])
    return [dish_id for dish_id, _ in picks[:limit]]


def record_wildcard_verdict(user_id: str, accepted: bool) -> None:
    stats = store.get_usage(user_id, "wildcard_stats", {"n": 0, "accepted": 0})
    stats["n"] += 1
    stats["accepted"] += 1 if accepted else 0
    store.set_usage(user_id, "wildcard_stats", stats)
