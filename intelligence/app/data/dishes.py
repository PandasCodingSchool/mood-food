from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

_DISHES_JSON = Path(__file__).parent / "dishes.json"
_CHARACTER_MAPPING_JSON = Path(__file__).parent / "character_dish_mapping.json"

# Focused Swiggy search hints for dishes that otherwise fall into the wrong
# category (e.g. Indian cuisine → "Biryani") or need synonym matching.
_SWIGGY_HINTS: dict[str, dict] = {
    "in_023": {  # Mutton Curry — must not match rajmah / paneer curry
        "aliases": ["Mutton Curry", "Goat Curry", "Lamb Curry", "Mutton Rogan Josh"],
        "search_category": "North Indian",
    },
    "in_027": {  # Paneer Tikka Masala — reject rolls/wraps
        "aliases": ["Paneer Tikka Masala", "Paneer Butter Masala", "Paneer Makhani"],
        "search_category": "North Indian",
    },
    "in_028": {  # Andhra Biryani — compatible chicken/andhra biryani aliases OK
        "aliases": [
            "Andhra Biryani",
            "Andhra Chicken Biryani",
            "Spicy Andhra Biryani",
            "Andhra Chicken Biryani Thali",
        ],
        "search_category": "Biryani",
    },
}


@dataclass
class DishRecord:
    id: str
    name: str
    cuisine: str
    category: str
    # --- payload-aligned attributes ---
    mood_tags: list[str]              # mirrors mood.primary
    dietary_tags: list[str]           # mirrors preferences.dietary_restrictions
    allergens: list[str]              # mirrors preferences.allergies
    spice_level: str                  # mild | medium | hot | very_hot — mirrors preferences.spice_tolerance
    energy_requirement: int           # 1-10; low=delivery-ready, high=cook-from-scratch — mirrors mood.energy_level
    social_context_tags: list[str]    # solo | date | friends | family — mirrors mood.social_context
    weather_tags: list[str]           # rainy | cold | hot | sunny | any — mirrors situational.weather
    meal_time: list[str]              # breakfast | lunch | dinner | late_night — mirrors situational.time_of_day
    delivery_friendly: bool           # mirrors situational.delivery_preferred
    adventurousness_score: int        # 1-10; 1=very familiar, 10=exotic — mirrors game_data.slider_values.adventurous
    # --- practical details ---
    price_inr: int
    calories: int
    prep_time_min: int
    health_score: float               # 1-10
    image_url: str
    img_processed: bool = False
    # main | starter | complimentary — see app/services/dish_tier.py. Complimentary
    # items (breads, pickles, accompaniment salads) are never swap targets.
    tier: str = "main"
    # Optional Swiggy matching hints (from JSON or _SWIGGY_HINTS overlay).
    swiggy_aliases: list[str] = field(default_factory=list)
    swiggy_search_category: Optional[str] = None


def _load_dishes() -> list[DishRecord]:
    with _DISHES_JSON.open() as f:
        raw = json.load(f)
    dishes: list[DishRecord] = []
    for record in raw:
        hint = _SWIGGY_HINTS.get(record.get("id", ""), {})
        if hint.get("aliases") and not record.get("swiggy_aliases"):
            record = {**record, "swiggy_aliases": list(hint["aliases"])}
        if hint.get("search_category") and not record.get("swiggy_search_category"):
            record = {**record, "swiggy_search_category": hint["search_category"]}
        known = {f.name for f in DishRecord.__dataclass_fields__.values()}  # type: ignore[attr-defined]
        dishes.append(DishRecord(**{k: v for k, v in record.items() if k in known}))
    return dishes


DISHES: list[DishRecord] = _load_dishes()
DISHES_BY_ID: dict[str, DishRecord] = {d.id: d for d in DISHES}

with _CHARACTER_MAPPING_JSON.open() as _f:
    CHARACTER_DISH_MAPPING: dict[str, list[str]] = json.load(_f)


def get_dishes_for_prompt() -> str:
    """Returns compact, attribute-rich dish lines for the AI prompt."""
    lines = []
    for d in DISHES:
        lines.append(
            f"{d.id}: {d.name} ({d.cuisine}) | "
            f"mood={d.mood_tags} | spice={d.spice_level} | "
            f"diet={d.dietary_tags} | allergens={d.allergens} | "
            f"energy_req={d.energy_requirement} | price=₹{d.price_inr} | "
            f"weather={d.weather_tags} | meal_time={d.meal_time} | "
            f"delivery={d.delivery_friendly} | adventurousness={d.adventurousness_score}"
        )
    return "\n".join(lines)


def get_character_dish_ids(character_id: str) -> list[str]:
    """Returns dish IDs preferred by a specific character."""
    return CHARACTER_DISH_MAPPING.get(character_id.lower(), [])
