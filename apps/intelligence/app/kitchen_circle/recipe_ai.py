"""AI-written household recipes for dishes that aren't in the catalog, plus a fit check for adding/swapping a dish.

The model writes a structured recipe (numeric quantities in KitchenCircle units). Nothing it says about safety is
trusted on its own: dietary tags and allergens are re-derived from the ingredients and merged in, and the result is
checked against the household's hard constraints with the same rules auto-fill uses. The API stores it as an AI draft
that a member reviews before it can go on the plan.
"""

from __future__ import annotations

import logging
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.config import settings
from app.lab import trace
from app.llm import LLMUnavailable, parse_structured

from .planner import MEAT, Planner, _candidate, _mentions
from .schemas import AutofillRequest, PlannerMember, PlannerRecipe, PlannerRule, PlannerSlot

logger = logging.getLogger("kitchen_circle.recipe_ai")

Unit = Literal["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "piece", "clove", "bunch", "sprig", "to taste"]

# Ingredient words → allergen, so a missing allergen can't slip through.
ALLERGEN_WORDS = {
    "dairy": ["milk", "curd", "yogurt", "yoghurt", "dahi", "paneer", "ghee", "butter", "cream", "malai", "cheese", "khoya", "mawa", "buttermilk"],
    "gluten": ["wheat", "atta", "maida", "semolina", "rava", "sooji", "suji", "bread", "pasta", "noodles", "vermicelli", "seviyan", "barley", "pav"],
    "peanut": ["peanut", "groundnut", "moongphali"],
    "nuts": ["cashew", "kaju", "almond", "badam", "pistachio", "pista", "walnut", "akhrot"],
    "egg": ["egg", "eggs", "anda"],
    "shellfish": ["prawn", "prawns", "shrimp", "crab", "lobster"],
    "soy": ["soy", "soya", "tofu"],
    "sesame": ["sesame", "til"],
}
# "coconut milk", "peanut butter" and friends are plant-based, not dairy.
PLANT_DAIRY = {"coconut", "almond", "soy", "soya", "oat", "cashew", "peanut", "cocoa", "rice"}


class AiIngredient(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    quantity: float = Field(gt=0, le=20_000)
    unit: Unit
    optional: bool = False


class AiSubstitution(BaseModel):
    ingredient: str
    alternatives: list[str] = Field(min_length=1, max_length=4)


class AiRecipe(BaseModel):
    title: str = Field(min_length=2, max_length=80)
    cuisine: str = Field(min_length=2, max_length=40)
    effort: Literal["easy", "medium", "involved"]
    freshness_class: Literal["pantry", "fresh", "perishable"]
    prep_minutes: int = Field(ge=0, le=1_440)
    cook_minutes: int = Field(ge=0, le=1_440)
    default_servings: int = Field(ge=1, le=12)
    dietary_tags: list[Literal["vegetarian", "vegan", "eggetarian", "non_vegetarian", "jain", "gluten_free"]] = Field(default_factory=list)
    allergens: list[str] = Field(default_factory=list)
    ingredients: list[AiIngredient] = Field(min_length=2, max_length=40)
    steps: list[str] = Field(min_length=2, max_length=20)
    substitutions: list[AiSubstitution] = Field(default_factory=list, max_length=10)


class GenerateRequest(BaseModel):
    dish: str = Field(min_length=2, max_length=80)
    servings: int = Field(default=4, ge=1, le=12)
    notes: Optional[str] = Field(default=None, max_length=300)
    members: list[PlannerMember] = Field(default_factory=list)
    rules: list[PlannerRule] = Field(default_factory=list)
    known_ingredients: list[str] = Field(default_factory=list, max_length=600)


class GenerateResponse(BaseModel):
    recipe: AiRecipe
    warnings: list[str]
    added_allergens: list[str]


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower()))


def harden(recipe: AiRecipe) -> tuple[AiRecipe, list[str]]:
    """Re-derive safety facts from the ingredients; never trust the model's tags alone."""
    names = [i.name.lower() for i in recipe.ingredients]
    def has(allergen: str, words: list[str]) -> bool:
        return any(_words(n) & set(words) and not (allergen == "dairy" and _words(n) & PLANT_DAIRY) for n in names)

    found = {allergen for allergen, words in ALLERGEN_WORDS.items() if has(allergen, words)}
    declared = {a.strip().lower() for a in recipe.allergens if a.strip()}
    added = sorted(found - declared)
    tags = set(recipe.dietary_tags)
    meat = any(_mentions(names, m) for m in MEAT)
    egg = "egg" in found
    if meat:
        tags -= {"vegetarian", "vegan", "eggetarian", "jain"}
        tags.add("non_vegetarian")
    elif egg:
        tags -= {"vegetarian", "vegan", "jain"}
        tags.add("eggetarian")
    if found & {"dairy", "egg", "shellfish"} or meat:
        tags.discard("vegan")
    if "gluten" in found:
        tags.discard("gluten_free")
    if not tags & {"vegetarian", "vegan", "eggetarian", "non_vegetarian"}:
        tags.add("vegetarian")
    hardened = recipe.model_copy(update={"dietary_tags": sorted(tags), "allergens": sorted(declared | found)})
    return hardened, added


_PREP = re.compile(r"\s*(?:,|\(|\bfor\b|\bto\b\s+(?:taste|garnish|serve)).*$")
_ADJECTIVES = {"fresh", "small", "large", "medium", "big", "ripe", "finely", "chopped", "sliced", "minced", "grated", "boneless", "skinless", "whole", "dry", "dried"}
_ALIASES = {"ground cumin": "cumin powder", "ground coriander": "coriander powder", "ground turmeric": "turmeric powder", "turmeric": "turmeric powder",
            "kashmiri chilli powder": "kashmiri red chilli powder", "chilli powder": "red chilli powder", "lemon juice": "lemon", "cilantro": "coriander leaves",
            "coriander": "coriander leaves", "yogurt": "curd", "yoghurt": "curd", "cooking oil": "oil", "vegetable oil": "oil", "green chillies": "green chilli",
            "chickpea flour": "besan", "gram flour": "besan", "all purpose flour": "maida", "whole wheat flour": "wheat flour", "atta": "wheat flour"}


def canonical_ingredient(name: str, known: set[str]) -> str:
    """'Tomatoes, finely chopped' → 'tomato'; prefers names the catalog already uses so the grocery list merges them."""
    base = _PREP.sub("", name.lower()).strip()
    candidates = [base, " ".join(w for w in base.split() if w not in _ADJECTIVES)]
    for c in list(candidates):
        candidates += [_ALIASES.get(c, c), re.sub(r"(oes|ies|s)$", lambda m: {"oes": "o", "ies": "y", "s": ""}[m.group(1)], c)]
    for c in candidates:
        if c in known:
            return c
    return _ALIASES.get(candidates[1], candidates[1]) or base or name.lower().strip()


def tidy_ingredients(recipe: AiRecipe, known: list[str]) -> AiRecipe:
    """Canonical names, and one line per ingredient (same name + unit quantities are added up)."""
    vocab = {k.lower() for k in known}
    merged: dict[tuple[str, str], AiIngredient] = {}
    for item in recipe.ingredients:
        name = canonical_ingredient(item.name, vocab)
        key = (name, item.unit)
        if key in merged:
            merged[key] = merged[key].model_copy(update={"quantity": merged[key].quantity + item.quantity, "optional": merged[key].optional and item.optional})
        elif any(n == name for n, _ in merged):
            continue  # same ingredient in another unit: keep the first so the recipe stays valid
        else:
            merged[key] = item.model_copy(update={"name": name})
    return recipe.model_copy(update={"ingredients": list(merged.values())})


def _constraints(members: list[PlannerMember], rules: list[PlannerRule]) -> list[str]:
    """Household limits for the prompt — aggregated, never tied to a person."""
    hard = sorted({f"{p.category}: {p.value}" for m in members for p in m.preferences if p.strength in {"cannot_eat", "never_plan"}})
    hard += sorted({f"{r.category}: {r.constraint}" for r in rules if r.strength == "hard" and r.weekday is None})
    return hard


def fit_warnings(recipe: PlannerRecipe, members: list[PlannerMember], rules: list[PlannerRule], slot: Optional[PlannerSlot] = None) -> list[str]:
    """Same hard-constraint rules as auto-fill, phrased without naming anyone or their preferences."""
    probe = slot or PlannerSlot(slot_id="probe", planned_for="2026-01-05", weekday=0, state="blank", servings=recipe.default_servings)
    planner = Planner(AutofillRequest(members=members or [PlannerMember(user_id="x", role="owner")], rules=rules, slots=[probe], recipes=[recipe]))
    reason = planner.hard_block(_candidate(recipe), planner.day_context(probe))
    if reason == "cannot_eat":
        return ["Not safe for everyone eating — it conflicts with an allergy or diet at the table."]
    if reason == "never_plan":
        return ["Someone in the household asked never to plan this."]
    if reason == "hard_rule":
        return ["It breaks a household rule for that day."]
    return []


async def generate(req: GenerateRequest) -> GenerateResponse:
    limits = _constraints(req.members, req.rules)
    prompt = (
        "Write a home-cooking recipe for an Indian household's weekly meal plan. Use realistic Indian home quantities, "
        f"for {req.servings} servings, with measured ingredients in these units only: g, kg, ml, l, tsp, tbsp, cup, piece, "
        "clove, bunch, sprig — use 'to taste' only for optional seasoning and mark it optional. List every ingredient, "
        "including oil, spices and salt. 3–10 clear steps. Choose cuisine, effort (easy ≤30 min hands-on, medium, involved), "
        "freshness (pantry/fresh/perishable), dietary tags, and every allergen (dairy, gluten, peanut, nuts, egg, shellfish, soy, sesame). "
        "Suggest substitutions for hard-to-find ingredients. Ingredient names are grocery items only — lowercase, singular, no "
        "preparation (put 'finely chopped' etc. in the steps). "
        + (f"Prefer these names when it's the same ingredient: {', '.join(req.known_ingredients[:400])}. " if req.known_ingredients else "")
        + "Keep the dish true to its own cuisine (tacos stay Mexican, BBQ chicken stays BBQ) — don't Indianise it unless they ask. "
        "Use ingredients a home cook in an Indian city can buy, and put any hard-to-find ones in substitutions. Keep the title true to what they asked for. "
        + (f"Household limits to respect: {'; '.join(limits)}. If the dish can't respect them, adapt it and say so in a step. " if limits else "")
        + (f"Notes from the household: {req.notes}" if req.notes else "")
    )
    # Reasoning off: same structured recipe, about a third faster (measured 11.4 s → 7.7 s); safety is re-derived in code anyway.
    recipe: AiRecipe = await parse_structured("kitchen_circle_recipe", settings.openai_model,
                                              [{"role": "system", "content": prompt}, {"role": "user", "content": req.dish}], AiRecipe, temperature=0.3,
                                              reasoning_effort=settings.kitchen_circle_recipe_reasoning or None)
    recipe, added = harden(tidy_ingredients(recipe, req.known_ingredients))
    as_planner = PlannerRecipe(recipe_id="draft", version_id="draft", title=recipe.title, source="household", default_servings=recipe.default_servings,
                               cuisine=recipe.cuisine, effort=recipe.effort, prep_minutes=recipe.prep_minutes, cook_minutes=recipe.cook_minutes,
                               dietary_tags=recipe.dietary_tags, allergens=recipe.allergens, ingredients=[i.name for i in recipe.ingredients])
    warnings = fit_warnings(as_planner, req.members, [r for r in req.rules if r.weekday is None])
    if added:
        warnings.append(f"Added allergens the recipe didn't list: {', '.join(added)}.")
    trace.emit("kitchen_circle.recipe_ai", dish=req.dish, ingredients=len(recipe.ingredients), warnings=warnings)
    return GenerateResponse(recipe=recipe, warnings=warnings, added_allergens=added)


class FitRequest(BaseModel):
    recipe: PlannerRecipe
    members: list[PlannerMember]
    rules: list[PlannerRule] = Field(default_factory=list)
    slot: PlannerSlot


class FitResponse(BaseModel):
    safe: bool
    warnings: list[str]


def check_fit(req: FitRequest) -> FitResponse:
    rules = [r for r in req.rules if r.weekday is None or r.weekday == req.slot.weekday]
    warnings = fit_warnings(req.recipe, req.members, rules, req.slot.model_copy(update={"state": "blank"}))
    return FitResponse(safe=not warnings, warnings=warnings)


__all__ = ["generate", "check_fit", "harden", "GenerateRequest", "GenerateResponse", "FitRequest", "FitResponse", "LLMUnavailable"]
