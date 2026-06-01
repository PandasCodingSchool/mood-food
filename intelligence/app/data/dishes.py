from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

_DISHES_JSON = Path(__file__).parent / "dishes.json"


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


def _load_dishes() -> list[DishRecord]:
    with _DISHES_JSON.open() as f:
        return [DishRecord(**record) for record in json.load(f)]


DISHES: list[DishRecord] = _load_dishes()
DISHES_BY_ID: dict[str, DishRecord] = {d.id: d for d in DISHES}


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
