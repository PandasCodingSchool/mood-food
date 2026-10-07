"""Single source of truth for dietary + allergen hard constraints.

Every path that can surface a dish (shortlist, GPT post-filter, backfill,
alternatives, fallbacks) must go through ``allows`` so a vegan or a
nut-allergic user is protected identically everywhere.

Catalog vocabulary (``app/data/dishes.json``):
  dietary_tags: vegetarian, vegan, non_veg
  allergens:    dairy, gluten, eggs, nuts, shellfish
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional, Union

from app.data.dishes import DishRecord
from app.schemas.request import UserContext

# Free-text restriction / allergy labels → canonical form.
_RESTRICTION_ALIASES = {
    "veg": "vegetarian",
    "veggie": "vegetarian",
    "vegetarian": "vegetarian",
    "vegan": "vegan",
    "plant_based": "vegan",
    "non_veg": "non_veg",
    "nonveg": "non_veg",
    "non_vegetarian": "non_veg",
}

# "X-free" restrictions are enforced as allergen exclusions.
_FREE_FROM = {
    "gluten_free": "gluten",
    "dairy_free": "dairy",
    "lactose_free": "dairy",
    "egg_free": "eggs",
    "eggless": "eggs",
    "nut_free": "nuts",
    "shellfish_free": "shellfish",
}

_ALLERGEN_ALIASES = {
    "dairy": "dairy",
    "milk": "dairy",
    "lactose": "dairy",
    "gluten": "gluten",
    "wheat": "gluten",
    "egg": "eggs",
    "eggs": "eggs",
    "nut": "nuts",
    "nuts": "nuts",
    "peanut": "nuts",
    "peanuts": "nuts",
    "tree_nuts": "nuts",
    "shellfish": "shellfish",
    "seafood": "shellfish",
    "prawn": "shellfish",
    "prawns": "shellfish",
    "shrimp": "shellfish",
}

# Animal products a vegan dish must not contain.
_VEGAN_EXCLUDED_ALLERGENS = {"dairy", "eggs", "shellfish"}


def _norm(label: str) -> str:
    return label.strip().lower().replace("-", "_").replace(" ", "_")


@dataclass(frozen=True)
class DietRules:
    """Normalized hard constraints for one request."""

    restrictions: frozenset[str] = frozenset()  # vegetarian | vegan | non_veg
    excluded_allergens: frozenset[str] = frozenset()

    @property
    def is_empty(self) -> bool:
        return not self.restrictions and not self.excluded_allergens


RulesLike = Union[DietRules, Iterable[str], None]


def make_rules(restrictions: Iterable[str] = (), allergies: Iterable[str] = ()) -> DietRules:
    diets: set[str] = set()
    excluded: set[str] = set()
    for raw in restrictions or ():
        key = _norm(raw)
        if key in _FREE_FROM:
            excluded.add(_FREE_FROM[key])
        elif key in _RESTRICTION_ALIASES:
            diets.add(_RESTRICTION_ALIASES[key])
    for raw in allergies or ():
        key = _norm(raw)
        excluded.add(_ALLERGEN_ALIASES.get(key, key))
    return DietRules(frozenset(diets), frozenset(excluded))


def as_rules(rules: RulesLike) -> DietRules:
    """Accept a ready DietRules or a plain restriction list (legacy callers)."""
    if isinstance(rules, DietRules):
        return rules
    return make_rules(restrictions=list(rules or []))


def rules_for(ctx: Optional[UserContext]) -> DietRules:
    """Explicit preferences win; otherwise fall back to the game's diet choice."""
    if ctx is None:
        return DietRules()
    prefs = ctx.preferences
    restrictions: list[str] = list(prefs.dietary_restrictions) if prefs else []
    if not restrictions and ctx.game_data and ctx.game_data.diet_preference:
        restrictions = [ctx.game_data.diet_preference]
    allergies = list(prefs.allergies) if prefs else []
    return make_rules(restrictions, allergies)


def allows(dish: DishRecord, rules: RulesLike) -> bool:
    r = as_rules(rules)
    if r.is_empty:
        return True
    tags = {t.lower() for t in dish.dietary_tags}
    allergens = {a.lower() for a in dish.allergens}

    if r.excluded_allergens & allergens:
        return False
    # Vegan needs the explicit tag: ghee/butter/honey aren't always listed as
    # allergens, so "vegetarian minus dairy/eggs" is not a safe inference.
    if "vegan" in r.restrictions and (
        "vegan" not in tags or allergens & _VEGAN_EXCLUDED_ALLERGENS
    ):
        return False
    if "vegetarian" in r.restrictions and "non_veg" in tags:
        return False
    if "non_veg" in r.restrictions and "non_veg" not in tags:
        return False
    return True
