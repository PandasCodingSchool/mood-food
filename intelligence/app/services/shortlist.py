"""Deterministic hard-filter + contextual scoring for recommendation shortlists.

GPT may rank and explain candidates from this shortlist, but may not override
hard constraints (allergens, diet, budget, meal-time, explicit avoids).
"""

from __future__ import annotations

from typing import Optional

from app.data.dishes import DISHES, DISHES_BY_ID, DishRecord, get_character_dish_ids
from app.schemas.request import RecommendationConfig, UserContext

# Target shortlist size before live verification / GPT ranking.
DEFAULT_SHORTLIST_SIZE = 16

_SPICE_RANK = {"mild": 1, "medium": 2, "hot": 3, "very_hot": 4}

# Map frontend/game time labels onto dish.meal_time values.
_TIME_ALIASES = {
    "morning": "breakfast",
    "afternoon": "lunch",
    "evening": "dinner",
    "night": "late_night",
    "breakfast": "breakfast",
    "lunch": "lunch",
    "dinner": "dinner",
    "late_night": "late_night",
}


def _budget_max(ctx: UserContext) -> Optional[float]:
    sit = ctx.situational
    if sit and sit.budget and sit.budget.max is not None:
        return float(sit.budget.max)
    game = ctx.game_data
    if game and game.budget_tier:
        return float({"budget": 300, "moderate": 800, "splurge": 2000}[game.budget_tier])
    return None


def _restrictions(ctx: UserContext) -> list[str]:
    prefs = ctx.preferences
    if prefs and prefs.dietary_restrictions:
        return list(prefs.dietary_restrictions)
    game = ctx.game_data
    if game and game.diet_preference == "veg":
        return ["vegetarian"]
    if game and game.diet_preference == "non-veg":
        return ["non_veg"]
    return []


def _diet_allows(dish: DishRecord, restrictions: list[str]) -> bool:
    r = {x.lower() for x in (restrictions or [])}
    tags = {t.lower() for t in dish.dietary_tags}
    if r & {"vegetarian", "vegan"} and "non_veg" in tags:
        return False
    if "non_veg" in r and "non_veg" not in tags:
        return False
    return True


def _avoid_tokens(ctx: UserContext) -> set[str]:
    tokens: set[str] = set()
    hist = ctx.history
    if hist:
        for a in hist.avoid_these:
            tokens.update(w.lower() for w in a.split() if len(w) > 2)
    game = ctx.game_data
    if game:
        for a in game.disliked:
            tokens.update(w.lower() for w in a.split() if len(w) > 2)
        for s in game.swipes:
            if not s.liked:
                tokens.update(w.lower() for w in s.item.split() if len(w) > 2)
    for name in ctx.unavailable_dishes:
        tokens.update(w.lower() for w in name.split() if len(w) > 2)
    return tokens


def hard_filter(ctx: UserContext, dishes: Optional[list[DishRecord]] = None) -> list[DishRecord]:
    """Drop dishes that violate hard constraints."""
    pool = list(dishes if dishes is not None else DISHES)
    restrictions = _restrictions(ctx)
    allergies = {a.lower() for a in (ctx.preferences.allergies if ctx.preferences else [])}
    budget = _budget_max(ctx)
    avoid = _avoid_tokens(ctx)
    unavailable = {n.lower() for n in ctx.unavailable_dishes}

    sit = ctx.situational
    meal_time = None
    if sit and sit.time_of_day:
        meal_time = _TIME_ALIASES.get(sit.time_of_day, sit.time_of_day)

    out: list[DishRecord] = []
    for d in pool:
        if d.name.lower() in unavailable:
            continue
        if allergies & {a.lower() for a in d.allergens}:
            continue
        if not _diet_allows(d, restrictions):
            continue
        if budget is not None and d.price_inr > budget:
            continue
        if meal_time and d.meal_time and meal_time not in d.meal_time and "any" not in d.meal_time:
            # Soft: only hard-exclude when delivery preferred and dish is clearly wrong meal.
            if sit and sit.delivery_preferred:
                continue
        name_tokens = {w.lower() for w in d.name.split() if len(w) > 2}
        if avoid & name_tokens:
            continue
        if sit and sit.delivery_preferred and not d.delivery_friendly:
            continue
        out.append(d)
    return out


def score_dish(dish: DishRecord, ctx: UserContext) -> float:
    """Higher is better. Soft signals only — hard filters already applied."""
    score = 0.0
    mood = ctx.mood
    prefs = ctx.preferences
    sit = ctx.situational
    game = ctx.game_data

    if mood.primary and mood.primary.lower() in {t.lower() for t in dish.mood_tags}:
        score += 8.0
    # Energy proximity (closer = better)
    score += max(0.0, 4.0 - abs(dish.energy_requirement - mood.energy_level) * 0.6)
    if mood.social_context and mood.social_context in dish.social_context_tags:
        score += 2.0

    if sit and sit.weather and (sit.weather in dish.weather_tags or "any" in dish.weather_tags):
        score += 1.5
    if sit and sit.time_of_day:
        mt = _TIME_ALIASES.get(sit.time_of_day, sit.time_of_day)
        if mt in dish.meal_time:
            score += 1.5

    if prefs:
        cuisines = {c.lower() for c in prefs.cuisine_types}
        if dish.cuisine.lower() in cuisines or any(c in dish.name.lower() for c in cuisines):
            score += 5.0
        if prefs.spice_tolerance:
            want = _SPICE_RANK.get(prefs.spice_tolerance, 2)
            have = _SPICE_RANK.get(dish.spice_level, 2)
            score += max(0.0, 3.0 - abs(want - have))

    if game:
        positives = [*(game.liked or []), *(game.cravings or []), *(game.cuisines or [])]
        name_l = dish.name.lower()
        for i, p in enumerate(positives):
            pl = p.lower()
            if pl in name_l or pl == dish.cuisine.lower() or pl in dish.category.lower():
                # Earlier cravings weigh more.
                score += max(1.0, 4.0 - i * 0.4)
        if game.slider_values:
            if game.slider_values.adventurous is not None:
                score += max(0.0, 3.0 - abs(dish.adventurousness_score - game.slider_values.adventurous) * 0.4)
            if game.slider_values.health_conscious is not None:
                target = game.slider_values.health_conscious
                score += max(0.0, 3.0 - abs(dish.health_score - target) * 0.35)
        if game.character:
            preferred = set(get_character_dish_ids(game.character.id))
            if dish.id in preferred:
                score += 10.0

    # Mild diversity bias toward mains over complimentary leftovers.
    if dish.tier == "main":
        score += 0.5
    elif dish.tier == "complimentary":
        score -= 5.0

    return score


def diversify(scored: list[tuple[float, DishRecord]], limit: int, diversity: str = "medium") -> list[DishRecord]:
    """Greedy pick that spreads cuisine/category when diversity != low."""
    if diversity == "low" or limit <= 1:
        return [d for _, d in scored[:limit]]

    picked: list[DishRecord] = []
    used_cuisines: set[str] = set()
    used_categories: set[str] = set()
    remaining = list(scored)

    while remaining and len(picked) < limit:
        best_i = 0
        best_adj = float("-inf")
        for i, (base, d) in enumerate(remaining):
            adj = base
            if d.cuisine in used_cuisines:
                adj -= 3.0 if diversity == "high" else 1.5
            if d.category in used_categories:
                adj -= 2.0 if diversity == "high" else 1.0
            if adj > best_adj:
                best_adj = adj
                best_i = i
        _, chosen = remaining.pop(best_i)
        picked.append(chosen)
        used_cuisines.add(chosen.cuisine)
        used_categories.add(chosen.category)

    return picked


def build_shortlist(
    ctx: UserContext,
    config: Optional[RecommendationConfig] = None,
    size: int = DEFAULT_SHORTLIST_SIZE,
    user_id: Optional[str] = None,
) -> list[DishRecord]:
    """Embedding retrieval → hard-filter → score → diversify → top N.

    The retrieval stage blends the learned taste/craving/mood session vector
    into scoring (weight 12, matching the strongest heuristic signals). With
    no learned state it contributes nothing and behavior is unchanged.
    """
    config = config or RecommendationConfig()
    from app.learning.retrieval import retrieval_scores

    retrieval = retrieval_scores(user_id, ctx)

    pool = hard_filter(ctx)
    if not pool:
        # Absolute last resort: diet-only filter on full catalog.
        pool = [d for d in DISHES if _diet_allows(d, _restrictions(ctx))]
    scored = sorted(
        ((score_dish(d, ctx) + 12.0 * retrieval.get(d.id, 0.0), d) for d in pool),
        key=lambda x: x[0],
        reverse=True,
    )
    # Prefer enough candidates for live matching + ranking.
    target = max(size, config.count * 4)
    return diversify(scored, min(target, len(scored)), diversity=config.diversity or "medium")


def dishes_for_prompt(dishes: list[DishRecord]) -> str:
    """Compact attribute-rich lines for a candidate subset."""
    lines = []
    for d in dishes:
        aliases = f" | aliases={d.swiggy_aliases}" if d.swiggy_aliases else ""
        lines.append(
            f"{d.id}: {d.name} ({d.cuisine}) | "
            f"mood={d.mood_tags} | spice={d.spice_level} | "
            f"diet={d.dietary_tags} | allergens={d.allergens} | "
            f"energy_req={d.energy_requirement} | price=₹{d.price_inr} | "
            f"weather={d.weather_tags} | meal_time={d.meal_time} | "
            f"delivery={d.delivery_friendly} | adventurousness={d.adventurousness_score}"
            f"{aliases}"
        )
    return "\n".join(lines)


def dish_ids(dishes: list[DishRecord]) -> list[str]:
    return [d.id for d in dishes]


def resolve_dishes(ids: list[str]) -> list[DishRecord]:
    return [DISHES_BY_ID[i] for i in ids if i in DISHES_BY_ID]
