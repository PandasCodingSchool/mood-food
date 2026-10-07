"""Deterministic hard-filter + contextual scoring for recommendation shortlists.

GPT may rank and explain candidates from this shortlist, but may not override
hard constraints (allergens, diet, budget, meal-time, explicit avoids).
"""

from __future__ import annotations

from typing import Optional

from app.data.dishes import DISHES, DISHES_BY_ID, DishRecord
from app.services import diet
from app.services.mood_clusters import dish_ids_for_cluster
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

# Meal slots a dish may come from when delivery is preferred. Neighbouring
# slots stay eligible (a 9pm dinner can be a late-night dish and vice versa);
# the exact slot still earns the meal-time score bonus.
_MEAL_WINDOWS = {
    "breakfast": {"breakfast"},
    "lunch": {"lunch", "dinner"},
    "dinner": {"dinner", "lunch", "late_night"},
    "late_night": {"late_night", "dinner"},
}

# Client mood labels that don't exist verbatim in dish.mood_tags → the catalog
# tags that express them. Unknown moods match themselves.
MOOD_ALIASES: dict[str, set[str]] = {
    "celebrating": {"celebratory"},
    "celebration": {"celebratory"},
    "tired": {"comfort", "relaxed"},
    "exhausted": {"comfort", "relaxed"},
    "sleepy": {"comfort", "relaxed"},
    "anxious": {"stressed", "comfort"},
    "overwhelmed": {"stressed", "comfort"},
    "chill": {"relaxed"},
    "calm": {"relaxed"},
    "excited": {"energetic", "celebratory"},
    "lonely": {"comfort", "nostalgic"},
    "unwell": {"sick"},
    "ill": {"sick"},
    "down": {"sad", "comfort"},
}


def mood_tags_for(primary: Optional[str]) -> set[str]:
    if not primary:
        return set()
    key = primary.strip().lower()
    return MOOD_ALIASES.get(key, {key})


def _budget_max(ctx: UserContext) -> Optional[float]:
    sit = ctx.situational
    if sit and sit.budget and sit.budget.max is not None:
        return float(sit.budget.max)
    game = ctx.game_data
    if game and game.budget_tier:
        return float({"budget": 300, "moderate": 800, "splurge": 2000}[game.budget_tier])
    return None


def _restrictions(ctx: UserContext) -> diet.DietRules:
    return diet.rules_for(ctx)


_diet_allows = diet.allows


_DISH_NAMES = {d.name.lower(): d.id for d in DISHES}


def _avoid_entries(ctx: UserContext) -> list[str]:
    entries: list[str] = []
    if ctx.history:
        entries.extend(ctx.history.avoid_these)
    game = ctx.game_data
    if game:
        entries.extend(game.disliked)
        entries.extend(s.item for s in game.swipes if not s.liked)
    entries.extend(ctx.unavailable_dishes)
    return [e.strip().lower() for e in entries if e and e.strip()]


def _avoid_tokens(ctx: UserContext) -> tuple[set[str], set[str]]:
    """(dish ids to exclude, keyword tokens to exclude).

    An avoid entry naming a catalog dish excludes only that dish — disliking
    "Chicken Burger" must not ban every chicken dish. Free keywords ("chicken",
    "mushroom") still exclude any dish whose name contains them.
    """
    ids: set[str] = set()
    tokens: set[str] = set()
    for entry in _avoid_entries(ctx):
        if entry in _DISH_NAMES:
            ids.add(_DISH_NAMES[entry])
        else:
            tokens.update(w for w in entry.split() if len(w) > 2)
    return ids, tokens


def hard_filter(ctx: UserContext, dishes: Optional[list[DishRecord]] = None) -> list[DishRecord]:
    """Drop dishes that violate hard constraints."""
    pool = list(dishes if dishes is not None else DISHES)
    rules = _restrictions(ctx)
    budget = _budget_max(ctx)
    avoid_ids, avoid = _avoid_tokens(ctx)
    unavailable = {n.lower() for n in ctx.unavailable_dishes}

    sit = ctx.situational
    meal_time = None
    if sit and sit.time_of_day:
        meal_time = _TIME_ALIASES.get(sit.time_of_day, sit.time_of_day)

    out: list[DishRecord] = []
    for d in pool:
        if d.name.lower() in unavailable or d.id in avoid_ids:
            continue
        if not diet.allows(d, rules):
            continue
        if budget is not None and d.price_inr > budget:
            continue
        if meal_time and d.meal_time and "any" not in d.meal_time:
            window = _MEAL_WINDOWS.get(meal_time, {meal_time})
            # Only hard-exclude clearly wrong meals, and only for delivery.
            if sit and sit.delivery_preferred and not window & set(d.meal_time):
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

    if mood_tags_for(mood.primary) & {t.lower() for t in dish.mood_tags}:
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
        if game.cluster:
            preferred = set(dish_ids_for_cluster(game.cluster.id))
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
        pool = [d for d in DISHES if diet.allows(d, _restrictions(ctx))]
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
