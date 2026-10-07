"""Mood → sensory target: what food should *feel* like right now.

Each situation (energy, stress, hunger, weather, mood, cravings, meal) pulls
some sensory dimensions toward a target with a weight. A dish's fit is the
weighted closeness of its sensory profile (catalog v2) to that target.
Priors are hand-authored from everyday food psychology (rainy evening →
warm and crunchy; low energy → warm, soft, filling; heat → light and tangy).
"""

from __future__ import annotations

from typing import Optional

from app.data.dishes import DishRecord
from app.schemas.request import UserContext

DIMS = ("sweet", "salty", "sour", "spicy", "umami", "rich", "crunchy", "creamy", "warm", "heavy")

# Pull = (dimension, target 0-1, weight)
Pull = tuple[str, float, float]

CRAVING_PULLS: dict[str, list[Pull]] = {
    "crunchy": [("crunchy", 1.0, 1.0)],
    "crispy": [("crunchy", 0.9, 1.0)],
    "creamy": [("creamy", 1.0, 1.0)],
    "cheesy": [("creamy", 0.8, 0.7), ("rich", 0.8, 0.7), ("salty", 0.7, 0.4)],
    "melty": [("creamy", 0.9, 0.8), ("rich", 0.7, 0.6)],
    "spicy": [("spicy", 0.9, 1.0)],
    "brothy": [("warm", 1.0, 0.8), ("heavy", 0.3, 0.6), ("umami", 0.7, 0.5)],
    "fresh": [("heavy", 0.1, 0.8), ("sour", 0.4, 0.4), ("warm", 0.2, 0.4)],
    "sweet": [("sweet", 1.0, 1.0)],
    "tangy": [("sour", 0.8, 1.0)],
    "smoky": [("umami", 0.8, 0.6), ("rich", 0.6, 0.4)],
    "juicy": [("umami", 0.7, 0.6), ("rich", 0.6, 0.4)],
    # game_assist craving vocabulary
    "comfort": [("warm", 0.8, 0.6), ("creamy", 0.6, 0.4), ("heavy", 0.6, 0.4)],
    "healthy": [("heavy", 0.2, 0.7), ("rich", 0.2, 0.6)],
    "light": [("heavy", 0.1, 0.8), ("rich", 0.2, 0.4)],
    "indulgent": [("rich", 0.9, 0.8), ("heavy", 0.8, 0.5)],
}

MOOD_PULLS: dict[str, list[Pull]] = {
    "tired": [("warm", 0.8, 0.6), ("heavy", 0.6, 0.4), ("creamy", 0.6, 0.3)],
    "stressed": [("creamy", 0.7, 0.5), ("warm", 0.8, 0.4), ("rich", 0.7, 0.4)],
    "sad": [("sweet", 0.6, 0.4), ("creamy", 0.7, 0.5), ("warm", 0.7, 0.4)],
    "celebrating": [("rich", 0.8, 0.6), ("sweet", 0.5, 0.2)],
    "celebratory": [("rich", 0.8, 0.6), ("sweet", 0.5, 0.2)],
    "adventurous": [("spicy", 0.6, 0.3), ("sour", 0.5, 0.3), ("umami", 0.7, 0.3)],
    "sick": [("warm", 0.9, 1.0), ("heavy", 0.2, 0.8), ("spicy", 0.1, 0.6), ("rich", 0.2, 0.5)],
    "relaxed": [("heavy", 0.5, 0.2)],
}

WEATHER_PULLS: dict[str, list[Pull]] = {
    "rainy": [("warm", 1.0, 1.0), ("spicy", 0.6, 0.3), ("crunchy", 0.6, 0.3)],
    "cold": [("warm", 1.0, 1.0), ("rich", 0.7, 0.3)],
    "hot": [("warm", 0.1, 1.0), ("heavy", 0.2, 0.5), ("sour", 0.5, 0.3)],
    "sunny": [("warm", 0.3, 0.5), ("heavy", 0.3, 0.3)],
}


def target_pulls(ctx: UserContext) -> list[Pull]:
    """All sensory pulls the situation implies (empty = no opinion)."""
    pulls: list[Pull] = []
    mood, sit, game = ctx.mood, ctx.situational, ctx.game_data
    if mood.energy_level <= 3:
        pulls += [("warm", 0.9, 0.6), ("heavy", 0.7, 0.4), ("creamy", 0.6, 0.3)]
    elif mood.energy_level >= 7:
        pulls += [("heavy", 0.3, 0.4), ("crunchy", 0.6, 0.2)]
    if mood.stress_level is not None and mood.stress_level >= 7:
        pulls += MOOD_PULLS["stressed"]
    if mood.hunger_level is not None:
        if mood.hunger_level >= 8:
            pulls.append(("heavy", 0.8, 0.7))
        elif mood.hunger_level <= 3:
            pulls.append(("heavy", 0.2, 0.7))
    pulls += MOOD_PULLS.get((mood.primary or "").lower(), [])
    if sit and sit.weather:
        pulls += WEATHER_PULLS.get(sit.weather, [])
    if sit and sit.time_of_day == "breakfast":
        pulls.append(("heavy", 0.4, 0.3))
    if game:
        for tag in [*game.craving_tags, *game.cravings]:
            # Cravings are acute and explicit: they outweigh inferred pulls.
            pulls += [(d, t, w * 1.5) for d, t, w in CRAVING_PULLS.get(tag.lower(), [])]
    return pulls


def fit(dish: DishRecord, pulls: list[Pull]) -> Optional[float]:
    """Weighted closeness 0-1 of the dish to the target; None without data."""
    if not pulls or not dish.sensory:
        return None
    total = sum(w for _, _, w in pulls)
    close = sum(w * (1 - abs(t - dish.sensory.get(d, 0.5))) for d, t, w in pulls)
    return close / total if total else None


def strongest_matches(dish: DishRecord, pulls: list[Pull], k: int = 2) -> list[str]:
    """Dimensions where the dish delivers what the moment pulls toward (for copy)."""
    if not pulls or not dish.sensory:
        return []
    weight: dict[tuple[str, bool], float] = {}
    for d, t, w in pulls:
        high = t >= 0.5
        value = dish.sensory.get(d, 0.5)
        if (value >= 0.6) if high else (value <= 0.35):
            weight[(d, high)] = weight.get((d, high), 0) + w
    ranked = sorted(weight, key=weight.get, reverse=True)
    return [describe(d, high) for d, high in ranked[:k]]


_WORDS = {
    ("sweet", True): "sweet", ("salty", True): "savoury", ("sour", True): "tangy",
    ("spicy", True): "spicy", ("umami", True): "deeply savoury", ("rich", True): "rich",
    ("crunchy", True): "crunchy", ("creamy", True): "creamy", ("warm", True): "warm",
    ("heavy", True): "filling", ("heavy", False): "light", ("warm", False): "cooling",
    ("spicy", False): "mild", ("rich", False): "clean-tasting", ("sweet", False): "not too sweet",
}


def describe(dim: str, high: bool) -> str:
    return _WORDS.get((dim, high), dim if high else f"low-{dim}")


def similarity(a: DishRecord, b: DishRecord) -> float:
    """0-1 sensory similarity (1 - mean absolute difference)."""
    if not a.sensory or not b.sensory:
        return 0.0
    return 1 - sum(abs(a.sensory.get(d, 0.5) - b.sensory.get(d, 0.5)) for d in DIMS) / len(DIMS)
