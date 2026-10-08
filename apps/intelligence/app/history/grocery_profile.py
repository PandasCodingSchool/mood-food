"""Grocery item profiles: what a product is and what it says about cooking at home.

JEV (batched): category, cooking role and cuisine hint (shuffled Choices) plus a
healthiness Score; keyword rules when JEV is unavailable. Cached in
``item_profiles`` under an ``im:`` key so groceries never collide with dishes.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass
from typing import Optional

from app.lab import trace
from app.learning import store

logger = logging.getLogger("history")

CATEGORIES = {
    "fresh_produce": "Fresh fruit or vegetables / herbs", "dairy": "Milk, curd, paneer, butter, cheese",
    "staples": "Atta, rice, dal, pulses, oil, ghee, sugar, salt", "spices_condiments": "Spices, masalas, sauces, pickles, spreads",
    "proteins": "Eggs, meat, fish, tofu", "bakery": "Bread, buns, cakes", "breakfast": "Cereal, oats, muesli",
    "snacks": "Chips, namkeen, biscuits, chocolate", "beverages": "Tea, coffee, juice, soft drinks, water",
    "ready_to_eat": "Instant noodles, ready meals, frozen snacks, heat-and-eat", "frozen": "Frozen vegetables / ice cream",
    "sweets_desserts": "Sweets, desserts", "non_food": "Household, cleaning, personal care, baby or pet items",
}
COOKING_ROLES = {
    "scratch_ingredient": "Used to cook a meal from scratch (vegetables, atta, dal, spices, raw meat)",
    "quick_cook": "Needs a little cooking or assembly (pasta, eggs, bread, frozen parathas)",
    "ready_to_eat": "Eaten as is or just heated (instant meals, ready snacks)",
    "snack_drink": "A snack or drink, not part of a meal", "non_food": "Not food",
}
CUISINE_HINTS = {"indian": "Indian home cooking", "asian": "Chinese / East or South-East Asian", "western": "Western / continental / baking",
                 "neutral": "Used in any cuisine or none"}
HEALTH_LEVELS = ["very indulgent", "indulgent", "neutral", "healthy", "very healthy"]
JEV_BATCH = 10

_RULES = [
    (r"\b(milk|curd|dahi|paneer|butter|cheese|yogurt|ghee)\b", "dairy", "scratch_ingredient"),
    (r"\b(atta|rice|dal|toor|moong|chana|rajma|besan|oil|sugar|salt|poha|suji|rava)\b", "staples", "scratch_ingredient"),
    (r"\b(onion|tomato|potato|aloo|ginger|garlic|chilli|coriander|spinach|banana|apple|lemon|capsicum|carrot)\b", "fresh_produce", "scratch_ingredient"),
    (r"\b(egg|eggs|chicken|mutton|fish|prawn|tofu)\b", "proteins", "scratch_ingredient"),
    (r"\b(masala|turmeric|haldi|jeera|cumin|sauce|ketchup|pickle|spice)\b", "spices_condiments", "scratch_ingredient"),
    (r"\b(bread|bun|pav|cake)\b", "bakery", "quick_cook"),
    (r"\b(maggi|noodles|instant|ready to eat|frozen)\b", "ready_to_eat", "ready_to_eat"),
    (r"\b(chips|namkeen|biscuit|cookie|chocolate|bhujia)\b", "snacks", "snack_drink"),
    (r"\b(tea|coffee|juice|cola|soda|water)\b", "beverages", "snack_drink"),
    (r"\b(detergent|soap|shampoo|tissue|cleaner|toothpaste|diaper|repellent)\b", "non_food", "non_food"),
    (r"\b(dog|cat|pet|puppy|kitten|pedigree|whiskas|drools)\b", "non_food", "non_food"),
]


@dataclass
class GroceryProfile:
    category: str = "snacks"
    cooking_role: str = "snack_drink"
    cuisine_hint: str = "neutral"
    healthiness: float = 0.5    # 0 very indulgent – 1 very healthy
    veg: Optional[str] = None
    method: str = "rules"
    confidence: float = 0.0

    @property
    def is_food(self) -> bool:
        return self.category != "non_food"


def _key(name: str) -> str:
    return "im:" + re.sub(r"\s+", " ", name.strip().lower())


def _rules(name: str, veg: Optional[str]) -> GroceryProfile:
    low = name.lower()
    for pattern, category, role in sorted(_RULES, key=lambda r: r[1] != "non_food"):
        if re.search(pattern, low):
            return GroceryProfile(category=category, cooking_role=role, veg=veg, method="rules", confidence=0.3)
    return GroceryProfile(veg=veg, method="rules", confidence=0.0)


async def profile_groceries(items: list[tuple[str, Optional[str], Optional[str]]]) -> dict[str, GroceryProfile]:
    """(name, brand, veg) -> profile by name; cached, JEV-first."""
    from app.decisions import jev

    meta = {n: (brand, veg) for n, brand, veg in items}
    out: dict[str, GroceryProfile] = {}
    for n in meta:
        row = store.fetchone("SELECT profile_json FROM item_profiles WHERE item_key = ?", (_key(n),))
        if row:
            out[n] = GroceryProfile(**json.loads(row["profile_json"]))
    pending = [n for n in meta if n not in out]
    cached = len(out)
    client = jev.get_client()
    for start in range(0, len(pending), JEV_BATCH):
        batch = pending[start: start + JEV_BATCH]
        decision = None
        if client is not None:
            from typesafe_sdk import Score

            state = {f"p{i + 1}": {"product": n, **({"brand": meta[n][0]} if meta[n][0] else {})} for i, n in enumerate(batch)}
            questions = {}
            for i, n in enumerate(batch):
                k = f"p{i + 1}"
                questions[f"{k}_category"] = jev.shuffled_choice(f"Which grocery category is `{k}`?", CATEGORIES, seed=f"gc:{n}")
                questions[f"{k}_role"] = jev.shuffled_choice(f"How is `{k}` typically used at home?", COOKING_ROLES, seed=f"gr:{n}")
                questions[f"{k}_cuisine"] = jev.shuffled_choice(f"Which kind of cooking is `{k}` mostly used in?", CUISINE_HINTS, seed=f"gu:{n}")
                questions[f"{k}_health"] = Score(instructions=f"How healthy is `{k}` as food?", criteria=HEALTH_LEVELS)
            decision = await client.decide("grocery_profile", state, questions)
        for i, n in enumerate(batch):
            k = f"p{i + 1}"
            if decision is not None and f"{k}_category" in decision.choices:
                ch, sc = decision.choices, decision.scores
                p = GroceryProfile(
                    category=ch[f"{k}_category"][0], cooking_role=ch.get(f"{k}_role", ("snack_drink",))[0],
                    cuisine_hint=ch.get(f"{k}_cuisine", ("neutral",))[0],
                    healthiness=round(sc[f"{k}_health"][0] / (len(HEALTH_LEVELS) - 1), 3) if f"{k}_health" in sc else 0.5,
                    veg=meta[n][1], method="jev", confidence=round(min(ch[f"{k}_category"][2], ch.get(f"{k}_role", (0, 0, 0))[2]), 3),
                )
                if p.category == "non_food":
                    p.cooking_role, p.cuisine_hint = "non_food", "neutral"
            else:
                p = _rules(n, meta[n][1])
            out[n] = p
            store.execute(
                """INSERT INTO item_profiles (item_key, item_name, profile_json, method, updated_at)
                   VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT (item_key) DO UPDATE SET profile_json = excluded.profile_json, method = excluded.method,
                     updated_at = CURRENT_TIMESTAMP""",
                (_key(n), n, json.dumps(asdict(p)), p.method),
            )
    trace.emit("grocery.profiles", cached=cached, profiled=len(pending), jev_available=client is not None,
               items=[{"item": n, **asdict(p)} for n, p in out.items()])
    return out
