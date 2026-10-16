"""Question builders for JEV — pure functions, unit-tested without the network.

Design rules from the Jev 1.13 docs (docs.typesafe.ai/model-jaggedness/jev-1.13):
numbers become named buckets (prices, energy), state holds only what the
question needs, and every instruction names the exact state field it is about.
"""

from __future__ import annotations

from typing import Any, Optional

from typesafe_sdk import Noul

from app.data.dishes import DishRecord
from app.schemas.request import UserContext
from app.services import diet
from app.services.shortlist import _budget_max


def _level(v: Optional[int]) -> Optional[str]:
    if v is None:
        return None
    return "low" if v <= 3 else "medium" if v <= 6 else "high"


def price_band(price: float) -> str:
    return "budget" if price <= 250 else "mid-range" if price <= 500 else "premium"


def _budget_label(ctx: UserContext) -> Optional[str]:
    budget = _budget_max(ctx)
    return None if budget is None else f"{price_band(budget)} or cheaper"


def person_state(ctx: UserContext) -> dict[str, Any]:
    """The user's situation in words (no raw numbers), dropping empty fields."""
    rules = diet.rules_for(ctx)
    mood, sit, game = ctx.mood, ctx.situational, ctx.game_data
    person = {
        "mood": mood.primary,
        "energy": _level(mood.energy_level),
        "hunger": _level(mood.hunger_level),
        "stress": _level(mood.stress_level),
        "company": mood.social_context,
        "meal": sit.time_of_day if sit else None,
        "weather": sit.weather if sit else None,
        "occasion": sit.occasion if sit else None,
        "budget": _budget_label(ctx),
        "diet": sorted(rules.restrictions) or None,
        "allergies": sorted(rules.excluded_allergens) or None,
        "cravings": (list(game.craving_tags) + list(game.cravings)) if game else None,
        "dislikes": list(game.disliked) if game and game.disliked else None,
        "favourite_cuisines": list(ctx.preferences.cuisine_types) if ctx.preferences else None,
        "habits": list(ctx.habits)[:8] or None,
    }
    return {k: v for k, v in person.items() if v not in (None, [], "")}


def dish_card(d: DishRecord) -> dict[str, Any]:
    return {
        "name": d.name,
        "cuisine": d.cuisine,
        "category": d.category.replace("_", " "),
        "spice": d.spice_level.replace("_", " "),
        "diet": d.dietary_tags,
        "price": price_band(d.price_inr),
        "suits_moods": d.mood_tags,
    }


def candidate_key(i: int) -> str:
    return f"c{i + 1}"


def ranking_state(ctx: UserContext, candidates: list[DishRecord]) -> dict[str, Any]:
    return {
        "person": person_state(ctx),
        "candidates": {candidate_key(i): dish_card(d) for i, d in enumerate(candidates)},
    }


def candidate_fit_nouls(candidates: list[DishRecord]) -> dict[str, Noul]:
    """One yes/no per candidate (the docs' re-ranking pattern); sort by probability."""
    return {
        f"fit_{candidate_key(i)}": Noul(
            instructions=(
                f"Would `candidates.{candidate_key(i)}` be a great thing for `person` to eat right now, "
                "given their mood, energy, meal, weather, cravings and budget?"
            ),
            criteria={
                "true": "A natural, appealing fit for how they feel and their situation right now.",
                "false": "A poor fit right now: wrong mood, wrong meal, against a dislike, or off-budget.",
            },
        )
        for i, _ in enumerate(candidates)
    }


def same_dish_noul(target: DishRecord, item_name: str, item_description: str = "") -> tuple[dict, dict[str, Noul]]:
    """Menu scout: is a restaurant's menu item the dish we're recommending?"""
    state = {
        "target_dish": {"name": target.name, "cuisine": target.cuisine, "diet": target.dietary_tags},
        "menu_item": {"name": item_name, "description": item_description or None},
    }
    return state, {
        "same_dish": Noul(
            instructions="Is `menu_item` the same dish as `target_dish` or a genuine close variant of it?",
            criteria={
                "true": "Same dish or a close variant someone ordering the target would happily accept.",
                "false": "A different dish, a different protein, or veg vs non-veg mismatch.",
            },
        )
    }
