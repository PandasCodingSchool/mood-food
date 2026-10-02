"""Deterministic mood-axis cluster derivation for the "Tonight's Story" game.

Mirrors the 6 clusters authored client-side in
frontend/src/constants/moodJourney.ts (and its mobile mirror). Dishes are
NOT hand-tagged — cluster_of_dish() derives a cluster from existing
DishRecord attributes, the same pattern app.learning.mood_map.dish_archetype
uses for its 8 food archetypes, so the India-only static catalog never
needs a rewrite.
"""

from __future__ import annotations

from app.data.dishes import DISHES, DishRecord

CLUSTER_IDS = ["exhale", "rewind", "spark", "fuel", "gathering", "treat"]


def cluster_of_dish(dish: DishRecord) -> str:
    """Deterministic cluster from dish attributes. First matching rule wins."""
    tags = set(dish.mood_tags)
    social = set(dish.social_context_tags)
    category = dish.category

    if "nostalgic" in tags:
        return "rewind"
    if "adventurous" in tags or dish.adventurousness_score >= 7:
        return "spark"
    if category == "dessert" or (
        category == "indulgent" and social <= {"solo"}
    ):
        return "treat"
    if ("friends" in social or "family" in social) and (
        "celebratory" in tags or category in ("indulgent", "comfort_food", "street_food")
    ):
        return "gathering"
    if "healthy" in tags or dish.health_score >= 7 or category == "light_meal":
        return "fuel"
    return "exhale"


# Beverages and complimentary sides (breads, pickles, accompaniment salads) are
# never a standalone "what should I eat" pick — see recommender._MAIN_CATEGORIES /
# _course_group, which apply the same rule to swap candidates. Excluding them
# here stops e.g. a ₹30 Masala Chai from being boosted as a cluster-preferred
# headline recommendation.
def _is_standalone_meal(dish: DishRecord) -> bool:
    return dish.category != "beverage" and dish.tier != "complimentary"


_DISHES_BY_CLUSTER: dict[str, list[DishRecord]] = {cid: [] for cid in CLUSTER_IDS}
for _dish in DISHES:
    if _is_standalone_meal(_dish):
        _DISHES_BY_CLUSTER[cluster_of_dish(_dish)].append(_dish)


def dishes_for_cluster(cluster_id: str, limit: int = 10) -> list[DishRecord]:
    """Dishes deterministically assigned to a cluster, highest health_score first."""
    pool = _DISHES_BY_CLUSTER.get(cluster_id, [])
    return sorted(pool, key=lambda d: d.health_score, reverse=True)[:limit]


def dish_ids_for_cluster(cluster_id: str, limit: int = 10) -> list[str]:
    return [d.id for d in dishes_for_cluster(cluster_id, limit)]
