"""Item profiles: what an ordered item *is*, even when it isn't a catalog dish.

Real orders are often outside the catalog (measured: 0/5 of a test account's
recent items mapped — JEV correctly said "none of these"). The brain still
needs to know their cuisine, protein, form, spice and heaviness, so each item
name gets a profile:

- JEV (batched): three shuffled Choices (cuisine, protein, form) and two Scores
  (spice, heaviness) per item;
- catalog attributes when the item maps to a dish and JEV is unavailable;
- keyword rules as the last resort.

Profiles are cached by normalised name (``item_profiles``).
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

CUISINES = {
    "north_indian": "North Indian / Punjabi / Mughlai", "south_indian": "South Indian (Tamil, Kerala, Andhra, Karnataka)",
    "west_indian": "Maharashtrian / Gujarati / Goan / Rajasthani", "east_indian": "Bengali / Odia / North-East",
    "indian_street": "Indian street food / chaat", "indo_chinese": "Indo-Chinese", "chinese": "Chinese",
    "japanese": "Japanese", "korean": "Korean", "thai_se_asian": "Thai / South-East Asian", "italian": "Italian",
    "american": "American (burgers, fried chicken, steakhouse)", "mexican": "Mexican / Tex-Mex",
    "mediterranean": "Mediterranean / Middle Eastern", "continental": "Continental / European",
    "healthy": "Healthy bowls / salads", "bakery_desserts": "Bakery / desserts / ice cream", "beverages": "Beverages",
    "other": "None of these",
}
PROTEINS = {
    "chicken": "Chicken", "mutton": "Mutton / lamb / goat", "beef_buff": "Beef / buff", "pork": "Pork",
    "fish": "Fish", "seafood": "Prawns / other seafood", "egg": "Egg", "paneer": "Paneer / cheese-led",
    "legumes": "Dal / beans / chickpeas / lentils", "tofu_soy": "Tofu / soy", "veg": "Vegetables / grains only",
    "none": "No main protein (dessert, drink, bread)",
}
FORMS = {
    "curry_gravy": "Curry / gravy", "rice_biryani": "Biryani / pulao / fried rice", "bowl": "Rice or grain bowl",
    "bread_wrap": "Roll / wrap / paratha / bread dish", "burger_sandwich": "Burger / sandwich", "pizza": "Pizza",
    "pasta_noodles": "Pasta / noodles", "grill_kebab_steak": "Grill / kebab / tikka / steak",
    "snack_starter": "Snack / starter / fried bites", "breakfast": "Breakfast dish (poha, dosa, eggs…)",
    "salad": "Salad", "soup": "Soup", "thali_combo": "Thali / meal combo", "dessert": "Dessert", "beverage": "Beverage",
}
SPICE_LEVELS = ["not spicy", "mild", "medium", "hot", "very hot"]
HEAVY_LEVELS = ["very light", "light", "moderate", "filling", "very heavy"]
# Profile cuisine -> catalog cuisine (for scoring against dishes.json).
CATALOG_CUISINE = {
    "north_indian": "indian", "south_indian": "indian", "west_indian": "indian", "east_indian": "indian",
    "indian_street": "indian", "indo_chinese": "chinese", "chinese": "chinese", "japanese": "japanese",
    "korean": "korean", "thai_se_asian": "thai", "italian": "italian", "american": "american", "mexican": "mexican",
    "mediterranean": "mediterranean", "continental": "american", "healthy": "mediterranean",
}
JEV_BATCH = 8


@dataclass
class ItemProfile:
    cuisine: str = "other"
    protein: str = "none"
    form: str = "snack_starter"
    spice: float = 0.5          # 0-1
    heaviness: float = 0.5      # 0-1
    veg: Optional[bool] = None
    method: str = "rules"
    confidence: float = 0.0

    @property
    def catalog_cuisine(self) -> Optional[str]:
        return CATALOG_CUISINE.get(self.cuisine)


def _key(name: str) -> str:
    from app.food_graph.mapping import normalise

    return normalise(name) or name.strip().lower()


def _cached(keys: list[str]) -> dict[str, ItemProfile]:
    out = {}
    for k in set(keys):
        row = store.fetchone("SELECT profile_json FROM item_profiles WHERE item_key = ?", (k,))
        if row:
            out[k] = ItemProfile(**json.loads(row["profile_json"]))
    return out


def _remember(name: str, p: ItemProfile) -> None:
    store.execute(
        """INSERT INTO item_profiles (item_key, item_name, profile_json, method, updated_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (item_key) DO UPDATE SET profile_json = excluded.profile_json, method = excluded.method,
             updated_at = CURRENT_TIMESTAMP""",
        (_key(name), name, json.dumps(asdict(p)), p.method),
    )


_PROTEIN_WORDS = [("chicken", "chicken"), ("mutton", "mutton"), ("lamb", "mutton"), ("goat", "mutton"), ("beef", "beef_buff"),
                  ("buff", "beef_buff"), ("pork", "pork"), ("fish", "fish"), ("prawn", "seafood"), ("shrimp", "seafood"),
                  ("egg", "egg"), ("paneer", "paneer"), ("dal", "legumes"), ("chana", "legumes"), ("rajma", "legumes"),
                  ("tofu", "tofu_soy")]


def _from_catalog_or_rules(name: str, veg: Optional[bool], dish_id: Optional[str]) -> ItemProfile:
    from app.data.dishes import DISHES_BY_ID

    d = DISHES_BY_ID.get(dish_id or "")
    if d:
        s = d.sensory or {}
        return ItemProfile(cuisine="north_indian" if d.cuisine == "indian" else d.cuisine if d.cuisine in CUISINES else "other",
                           protein=d.protein if d.protein in PROTEINS else "veg" if "non_veg" not in d.dietary_tags else "none",
                           spice=s.get("spicy", 0.5), heaviness=s.get("heavy", 0.5),
                           veg="non_veg" not in d.dietary_tags if veg is None else veg, method="catalog", confidence=0.6)
    low = name.lower()
    protein = next((p for w, p in _PROTEIN_WORDS if re.search(rf"\b{w}", low)), "veg" if veg else "none")
    return ItemProfile(protein=protein, veg=veg, method="rules", confidence=0.2)


async def profile_items(items: list[tuple[str, Optional[bool], Optional[str]]]) -> dict[str, ItemProfile]:
    """(item_name, is_veg, dish_id) -> profile by item name; cached, JEV-first."""
    from app.decisions import jev

    names = {n: (veg, dish) for n, veg, dish in items}
    cache = _cached([_key(n) for n in names])
    out = {n: cache[_key(n)] for n in names if _key(n) in cache}
    pending = [n for n in names if n not in out]
    client = jev.get_client()
    for start in range(0, len(pending), JEV_BATCH):
        batch = pending[start: start + JEV_BATCH]
        decision = None
        if client is not None:
            from typesafe_sdk import Score

            state = {f"i{i + 1}": {"menu_item": n, **({"diet": "veg" if names[n][0] else "non-veg"} if names[n][0] is not None else {})}
                     for i, n in enumerate(batch)}
            questions = {}
            for i, n in enumerate(batch):
                k = f"i{i + 1}"
                questions[f"{k}_cuisine"] = jev.shuffled_choice(f"Which cuisine is `{k}.menu_item` from?", CUISINES, seed=f"c:{n}")
                questions[f"{k}_protein"] = jev.shuffled_choice(f"What is the main protein in `{k}.menu_item`?", PROTEINS, seed=f"p:{n}")
                questions[f"{k}_form"] = jev.shuffled_choice(f"What kind of dish is `{k}.menu_item`?", FORMS, seed=f"f:{n}")
                questions[f"{k}_spice"] = Score(instructions=f"How spicy is `{k}.menu_item` usually?", criteria=SPICE_LEVELS)
                questions[f"{k}_heavy"] = Score(instructions=f"How heavy or filling is `{k}.menu_item` as a meal?", criteria=HEAVY_LEVELS)
            decision = await client.decide("item_profile", state, questions)
        for i, n in enumerate(batch):
            k = f"i{i + 1}"
            if decision is not None and f"{k}_cuisine" in decision.choices:
                ch = decision.choices
                sc = decision.scores
                p = ItemProfile(
                    cuisine=ch[f"{k}_cuisine"][0], protein=ch.get(f"{k}_protein", ("none",))[0],
                    form=ch.get(f"{k}_form", ("snack_starter",))[0],
                    spice=round(sc[f"{k}_spice"][0] / (len(SPICE_LEVELS) - 1), 3) if f"{k}_spice" in sc else 0.5,
                    heaviness=round(sc[f"{k}_heavy"][0] / (len(HEAVY_LEVELS) - 1), 3) if f"{k}_heavy" in sc else 0.5,
                    veg=names[n][0], method="jev",
                    confidence=round(min(ch[f"{k}_cuisine"][2], ch.get(f"{k}_protein", (0, 0, 0))[2], ch.get(f"{k}_form", (0, 0, 0))[2]), 3),
                )
            else:
                p = _from_catalog_or_rules(n, *names[n])
            out[n] = p
            _remember(n, p)
    trace.emit("history.profiles", cached=len(cache), profiled=len(pending), jev_available=client is not None,
               items=[{"item": n, **asdict(p)} for n, p in out.items()])
    return out
