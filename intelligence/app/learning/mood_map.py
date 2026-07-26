"""Personal mood -> food-archetype map with empirical-Bayes shrinkage.

``mood_key`` buckets a check-in (energy/stress/hunger terciles x social).
``food_archetype`` is one of a small curated set derived deterministically
from dish attributes. Weights start at a hand-authored population prior and
shrink toward the individual as post-meal observations accrue:

    weight = (n * mean_user_score + K * prior) / (n + K),  K = 5
"""

from __future__ import annotations

from typing import Optional

from app.data.dishes import DISHES_BY_ID, DishRecord
from app.learning import store

SHRINKAGE_K = 5

ARCHETYPES = [
    "comfort_carb",
    "fresh_light",
    "protein_hearty",
    "spicy_bold",
    "soupy_warm",
    "sweet_treat",
    "snacky",
    "festive_rich",
]

# Population prior: mood bucket -> {archetype: prior score in [0,1]}.
# Hand-authored; only non-default entries listed (default prior = 0.5).
_PRIORS: dict[str, dict[str, float]] = {
    "lowE_highS": {"comfort_carb": 0.85, "soupy_warm": 0.75, "sweet_treat": 0.7, "fresh_light": 0.3},
    "lowE_lowS": {"comfort_carb": 0.7, "snacky": 0.65, "soupy_warm": 0.6},
    "highE_highS": {"fresh_light": 0.7, "snacky": 0.65, "spicy_bold": 0.6},
    "highE_lowS": {"spicy_bold": 0.7, "protein_hearty": 0.65, "festive_rich": 0.6},
    "midE_midS": {"protein_hearty": 0.6, "comfort_carb": 0.55},
}


def _tercile(value: Optional[float], low: float = 4, high: float = 7) -> str:
    if value is None:
        return "mid"
    return "low" if value <= low else "high" if value >= high else "mid"


def mood_key(energy: Optional[float], stress: Optional[float], social: Optional[float] = None) -> str:
    key = f"{_tercile(energy)}E_{_tercile(stress)}S"
    if social is not None and social >= 7:
        key += "_social"
    return key


def dish_archetype(dish: DishRecord) -> str:
    """Deterministic archetype from dish attributes."""
    name_cat = f"{dish.name} {dish.category}".lower()
    if dish.category.lower() in ("dessert", "sweet") or "dessert" in name_cat or dish.mood_tags and "indulgent" in dish.mood_tags and dish.health_score <= 3:
        return "sweet_treat"
    if any(k in name_cat for k in ("soup", "broth", "ramen", "rasam", "stew")):
        return "soupy_warm"
    if dish.spice_level in ("hot", "very_hot"):
        return "spicy_bold"
    if dish.health_score >= 7:
        return "fresh_light"
    if dish.tier == "starter" or dish.calories <= 300:
        return "snacky"
    if dish.price_inr >= 500 or "biryani" in name_cat or "festive" in " ".join(dish.mood_tags):
        return "festive_rich"
    if any(k in name_cat for k in ("chicken", "mutton", "fish", "paneer", "egg", "kebab", "tikka")):
        return "protein_hearty"
    return "comfort_carb"


def archetype_of_dish_id(dish_id: Optional[str]) -> Optional[str]:
    dish = DISHES_BY_ID.get(dish_id or "")
    return dish_archetype(dish) if dish else None


def _prior(key: str, archetype: str) -> float:
    base = _PRIORS.get(key.replace("_social", ""), {})
    return base.get(archetype, 0.5)


def observe(user_id: str, key: str, archetype: str, actual_score: float) -> None:
    """Record one resolved post-meal observation (score 1-5 -> [0,1])."""
    normalized = (actual_score - 1.0) / 4.0
    store.execute(
        """INSERT INTO user_mood_map (user_id, mood_key, food_archetype, score_sum, n_obs, updated_at)
           VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id, mood_key, food_archetype) DO UPDATE SET
             score_sum = score_sum + excluded.score_sum,
             n_obs = n_obs + 1,
             updated_at = CURRENT_TIMESTAMP""",
        (user_id, key, archetype, normalized),
    )


def weight(user_id: str, key: str, archetype: str) -> float:
    """Shrunk weight in [0,1] for (mood bucket, archetype)."""
    row = store.fetchone(
        """SELECT score_sum, n_obs FROM user_mood_map
           WHERE user_id = ? AND mood_key = ? AND food_archetype = ?""",
        (user_id, key, archetype),
    )
    prior = _prior(key, archetype)
    if not row or row["n_obs"] == 0:
        return prior
    n = row["n_obs"]
    user_mean = row["score_sum"] / n
    return (n * user_mean + SHRINKAGE_K * prior) / (n + SHRINKAGE_K)


def top_archetypes(user_id: str, key: str, count: int = 3) -> list[tuple[str, float]]:
    ranked = sorted(
        ((a, weight(user_id, key, a)) for a in ARCHETYPES),
        key=lambda pair: -pair[1],
    )
    return ranked[:count]
