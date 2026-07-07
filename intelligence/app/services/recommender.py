from __future__ import annotations

import hashlib
import json
import time
import uuid
from typing import Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.data.dishes import DISHES, DISHES_BY_ID, DishRecord, get_dishes_for_prompt, get_character_dish_ids

# (drink, reason) keyed by cuisine
_DRINK_PAIRINGS: dict[str, tuple[str, str]] = {
    "indian":         ("Mango Lassi",       "Cools the palate and complements bold spices"),
    "italian":        ("Sparkling Water",   "Cleanses the palate between bites"),
    "mexican":        ("Horchata",          "Sweet rice milk balances the heat perfectly"),
    "japanese":       ("Matcha Green Tea",  "Earthy bitterness cuts through rich umami flavours"),
    "american":       ("Fresh Lemonade",    "Bright acidity lifts heavy comfort food"),
    "mediterranean":  ("Mint Lemonade",     "Refreshing and herbal, complements light flavours"),
    "chinese":        ("Jasmine Tea",       "Floral and light, cleanses rich sauces"),
    "thai":           ("Coconut Water",     "Natural sweetness offsets chilli heat"),
}

# Override for dessert category regardless of cuisine
_DESSERT_DRINK = ("Espresso",  "Bitter contrast sharpens sweet flavours")


def _pairing_for(dish: DishRecord) -> PairingSuggestion:
    if dish.category == "dessert":
        name, reason = _DESSERT_DRINK
    else:
        name, reason = _DRINK_PAIRINGS.get(dish.cuisine, ("Still Water", "Always a safe companion"))
    return PairingSuggestion(type="drink", name=name, reason=reason)
from app.schemas.request import RecommendationRequest, UserContext, RecommendationConfig
from app.schemas.response import (
    AiMetadata, AiReasoning, Alternative, DishDetailResponse, DishSummary, Insights,
    PairingSuggestion, PracticalDetails, Recommendation, RecommendationResponse, Restaurant,
)

_SYSTEM_PROMPT = """\
You are a food psychologist AI. Your job is to select dishes from the provided list that \
best match the user's emotional state, situational context, and constraints.

Each dish has explicit attributes. Match them precisely against the user's payload.

RANKING RULES (in priority order):
1. HARD EXCLUDE dishes whose allergens overlap with user's allergies
2. IF dietary_restrictions contains "vegetarian" or "vegan": HARD EXCLUDE non_veg dishes
   IF dietary_restrictions contains "non_veg": STRONGLY PREFER dishes with non_veg dietary_tag; exclude purely vegetarian/vegan dishes unless nothing else fits
3. HARD EXCLUDE dishes priced above budget.max (if provided)
4. IF CHARACTER CONTEXT PROVIDED: Strongly boost char_* prefixed dishes (they're personality-aligned favorites)
5. RANK by: mood_tags match > spice_level vs spice_tolerance > \
energy_requirement vs energy_level > weather_tags match > adventurousness alignment > health_conscious alignment
6. DIVERSITY: unless diversity is "low", the selected dishes must span different \
dish types — never return multiple variants of the same dish (e.g. three fried-chicken \
dishes). Vary category and preparation across the set.

Return ONLY valid JSON, no markdown fences, no extra text."""


def _build_user_message(ctx: UserContext, config: RecommendationConfig) -> str:
    mood = ctx.mood
    prefs = ctx.preferences
    sit = ctx.situational
    game = ctx.game_data
    hist = ctx.history

    sliders = (game.slider_values if game and game.slider_values else None)
    budget_max = (sit.budget.max if sit and sit.budget else None)
    budget_str = f"₹{budget_max}" if budget_max else "not specified"

    # Character context: look up dish IDs from the mapping and inject into prompt
    character_context = ""
    if game and hasattr(game, "character") and game.character:
        char = game.character
        char_id = char.get("id", "") if isinstance(char, dict) else getattr(char, "id", "")
        char_name = char.get("name", "unknown") if isinstance(char, dict) else getattr(char, "name", "unknown")

        preferred_ids = get_character_dish_ids(char_id)
        preferred_lines = []
        for dish_id in preferred_ids:
            dish = DISHES_BY_ID.get(dish_id)
            if dish:
                preferred_lines.append(f"  - {dish_id}: {dish.name} ({dish.cuisine})")

        if preferred_lines:
            character_context = (
                f"\nCHARACTER CONTEXT:\n"
                f"  User matched as: {char_name}\n"
                f"  This character's preferred dishes (STRONGLY PREFER these dish IDs):\n"
                + "\n".join(preferred_lines) + "\n"
                f"  Rank these dishes above others when they satisfy hard constraints.\n"
            )

    # Game-specific context lines
    game_context = ""
    if game:
        if game.selections:
            game_context += f"  game_selections={game.selections}\n"
        if game.swipes:
            liked = [s.item for s in game.swipes if s.liked]
            disliked = [s.item for s in game.swipes if not s.liked]
            if liked or disliked:
                game_context += f"  swipe_liked={liked} | swipe_disliked={disliked}\n"

    unavailable_block = ""
    if ctx.unavailable_dishes:
        names = "\n".join(f"  - {d}" for d in ctx.unavailable_dishes)
        unavailable_block = (
            "\nCRITICAL — the following dishes are NOT available for delivery near the user. "
            "Do NOT recommend them or anything similar:\n"
            + names
            + "\nChoose completely different alternatives.\n"
        )

    return f"""PAYLOAD:
  mood={mood.primary} | energy={mood.energy_level}/10 | social={mood.social_context}
  time_of_day={sit.time_of_day if sit else None} | weather={sit.weather if sit else None} | budget={budget_str} | time_available={sit.time_available if sit else None}min | delivery={sit.delivery_preferred if sit else False}
  cuisines={prefs.cuisine_types if prefs else []} | restrictions={prefs.dietary_restrictions if prefs else []} | allergies={prefs.allergies if prefs else []} | spice_tolerance={prefs.spice_tolerance if prefs else None}
  adventurous_slider={sliders.adventurous if sliders else None}/10 | health_slider={sliders.health_conscious if sliders else None}/10 | spicy_slider={sliders.spicy if sliders else None}/10
  avoid={hist.avoid_these if hist else []}
{game_context}{character_context}{unavailable_block}
DISH LIST (id: name | mood_tags | spice | diet | allergens | energy_req | price | weather | meal_time | delivery | adventurousness):
{get_dishes_for_prompt()}

Return exactly {config.count} dishes as JSON:
{{
  "ranked_dishes": [
    {{
      "dish_id": "...",
      "confidence": 0.0,
      "mood_match": "one sentence",
      "context_fit": "one sentence",
      "psychological_hook": "one sentence",
      "nostalgia_factor": "one sentence or null"
    }}
  ],
  "mood_profile": "one sentence describing the user's emotional state",
  "preference_evolution": "one sentence prediction",
  "restaurant_suggestions": [
    {{"name": "...", "rating": 4.2, "distance_km": 1.5, "delivery_time_min": 25, "is_open": true}}
  ]
}}"""


_CACHE: dict[str, RecommendationResponse] = {}


def _cache_key(request: RecommendationRequest) -> str:
    """SHA-256 of the canonical request JSON — same inputs always hit the same bucket."""
    canonical = request.model_dump_json(exclude_none=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _dish_to_summary(dish: DishRecord) -> DishSummary:
    return DishSummary(
        id=dish.id,
        name=dish.name,
        cuisine=dish.cuisine,
        category=dish.category,
        tags=dish.dietary_tags + dish.mood_tags,
    )


def _build_fallback(count: int, restrictions: Optional[list[str]] = None) -> list[DishRecord]:
    pool = [d for d in DISHES if _diet_allows(d, restrictions or [])]
    return sorted(pool, key=lambda d: d.health_score, reverse=True)[:count]


def get_recommendations(
    request: RecommendationRequest,
    llm: Optional[ChatOpenAI] = None,
) -> RecommendationResponse:
    key = _cache_key(request)
    # Skip cache on retry calls (unavailable_dishes set) — must hit GPT fresh
    if not request.user_context.unavailable_dishes and key in _CACHE:
        cached = _CACHE[key]
        meta = cached.ai_metadata.model_copy(update={"cache_hit": True}) if cached.ai_metadata else None
        return cached.model_copy(update={"ai_metadata": meta})

    restrictions = _restrictions_of(request)

    if llm is None:
        llm = ChatOpenAI(
            model=settings.openai_model,
            temperature=request.recommendation_config.temperature,
            model_kwargs={"response_format": {"type": "json_object"}},
        )

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=_build_user_message(
            request.user_context, request.recommendation_config
        )),
    ]

    start = time.time()
    try:
        result = llm.invoke(messages)
    except Exception as exc:
        return _fallback_response(str(exc), request.recommendation_config.count, restrictions)

    elapsed = round(time.time() - start, 2)
    token_usage = result.response_metadata.get("token_usage", {})

    try:
        data = json.loads(result.content)
    except json.JSONDecodeError:
        return _fallback_response("Invalid JSON from model", request.recommendation_config.count, restrictions)

    ranked = _apply_diet_filter(
        data.get("ranked_dishes", []), restrictions, request.recommendation_config.count
    )
    restaurant_pool: list[dict] = data.get("restaurant_suggestions", [])

    recommendations: list[Recommendation] = []
    used_swap_ids: set[str] = set()
    for i, item in enumerate(ranked):
        dish = DISHES_BY_ID.get(item.get("dish_id", ""))
        if dish is None:
            continue

        rest_data = restaurant_pool[i] if i < len(restaurant_pool) else {
            "name": "Local Kitchen", "rating": 4.0,
            "distance_km": 2.0, "delivery_time_min": 30, "is_open": True,
        }

        alts = (
            _build_alternatives(dish, restrictions, used_swap_ids)
            if request.recommendation_config.include_alternatives else []
        )
        for a in alts:
            used_swap_ids.add(a.dish_id)

        recommendations.append(Recommendation(
            id=f"rec_{uuid.uuid4().hex[:8]}",
            rank=i + 1,
            confidence=float(item.get("confidence", 0.7)),
            dish=_dish_to_summary(dish),
            image_url=dish.image_url,
            ai_reasoning=AiReasoning(
                mood_match=item.get("mood_match", ""),
                context_fit=item.get("context_fit", ""),
                psychological_hook=item.get("psychological_hook", ""),
                nostalgia_factor=item.get("nostalgia_factor"),
            ),
            practical_details=PracticalDetails(
                estimated_price=dish.price_inr,
                preparation_time=dish.prep_time_min,
                calories=dish.calories,
                health_score=dish.health_score,
            ),
            restaurant=Restaurant(
                name=rest_data.get("name", "Local Kitchen"),
                rating=float(rest_data.get("rating", 4.0)),
                distance_km=float(rest_data.get("distance_km", 2.0)),
                delivery_time_min=int(rest_data.get("delivery_time_min", 30)),
                is_open=bool(rest_data.get("is_open", True)),
            ),
            alternatives=alts,
            pairing_suggestions=[
                _pairing_for(dish),
            ] if request.recommendation_config.include_explanations else [],
        ))

    response = RecommendationResponse(
        success=True,
        recommendations=recommendations,
        ai_metadata=AiMetadata(
            model_used=settings.openai_model,
            tokens_used=token_usage.get("total_tokens"),
            response_time_s=elapsed,
        ),
        insights=Insights(
            detected_mood_profile=data.get("mood_profile", ""),
            preference_evolution=data.get("preference_evolution"),
        ),
    )
    if not request.user_context.unavailable_dishes:
        _CACHE[key] = response
    return response


# Categories that count as a "main course" — a swap for a main must stay a main
# (never a drink/dessert). Non-main originals swap within their own group.
_MAIN_CATEGORIES = {"comfort_food", "indulgent", "light_meal", "street_food"}


def _course_group(dish: DishRecord) -> set[str]:
    """The set of categories a swap for this dish is allowed to come from."""
    return _MAIN_CATEGORIES if dish.category in _MAIN_CATEGORIES else {dish.category}


def _diet_allows(dish: DishRecord, restrictions: list[str]) -> bool:
    """Whether a dish satisfies the user's veg/non-veg preference."""
    r = {x.lower() for x in (restrictions or [])}
    tags = {t.lower() for t in dish.dietary_tags}
    if r & {"vegetarian", "vegan"} and "non_veg" in tags:
        return False
    if "non_veg" in r and "non_veg" not in tags:
        return False
    return True


def _swap_candidates(dish: DishRecord, restrictions: list[str]) -> list[DishRecord]:
    """Same-course, diet-appropriate candidates — same cuisine first, else any."""
    group = _course_group(dish)
    eligible = [
        d for d in DISHES
        if d.id != dish.id and d.category in group and _diet_allows(d, restrictions)
    ]
    same_cuisine = [d for d in eligible if d.cuisine == dish.cuisine]
    return same_cuisine or eligible


def _healthier_swap(dish: DishRecord, restrictions: Optional[list[str]] = None) -> DishRecord:
    candidates = [c for c in _swap_candidates(dish, restrictions or []) if c.health_score > dish.health_score]
    return max(candidates, key=lambda d: d.health_score, default=dish)


def _budget_swap(dish: DishRecord, restrictions: Optional[list[str]] = None) -> DishRecord:
    candidates = [c for c in _swap_candidates(dish, restrictions or []) if c.price_inr < dish.price_inr]
    return min(candidates, key=lambda d: d.price_inr, default=dish)


def _restrictions_of(request: RecommendationRequest) -> list[str]:
    prefs = request.user_context.preferences
    return list(prefs.dietary_restrictions) if prefs and prefs.dietary_restrictions else []


def _apply_diet_filter(ranked: list[dict], restrictions: list[str], count: int) -> list[dict]:
    """Deterministically drop diet-violating dishes and backfill to `count`.

    GPT is instructed to exclude but isn't reliable — this guarantees veg-only /
    non-veg-only when a preference is set. Empty restrictions => unchanged (mixed).
    """
    if not restrictions:
        return ranked

    def ok(item: dict) -> bool:
        d = DISHES_BY_ID.get(item.get("dish_id", ""))
        return d is not None and _diet_allows(d, restrictions)

    filtered = [it for it in ranked if ok(it)]
    if len(filtered) >= count:
        return filtered

    used = {it.get("dish_id") for it in filtered}
    for d in DISHES:
        if len(filtered) >= count:
            break
        if d.id in used or not _diet_allows(d, restrictions):
            continue
        filtered.append({
            "dish_id": d.id, "confidence": 0.6,
            "mood_match": "Fits your dietary preference", "context_fit": "",
            "psychological_hook": "A solid pick for what you're in the mood for.",
        })
        used.add(d.id)
    return filtered


def _build_alternatives(
    dish: DishRecord,
    restrictions: list[str],
    exclude_ids: "set[str] | frozenset[str]" = frozenset(),
) -> list[Alternative]:
    """Always offer BOTH a healthier and a second swap when possible.

    - healthier    = healthiest same-course, diet-ok alternative not already used
                     by another recommendation.
    - budget_swap  = cheapest option strictly cheaper than the dish.
    - popular_pick = fallback when nothing is cheaper — closest-priced alternative,
                     used so budget dishes still show two swap tiles.
    """
    pool = [d for d in _swap_candidates(dish, restrictions) if d.id not in exclude_ids]
    if not pool:
        return []

    alts: list[Alternative] = []
    healthier = max(pool, key=lambda d: d.health_score)
    alts.append(_make_alternative(healthier, "healthier_swap", "Lighter pick, similar vibe"))

    cheaper = [d for d in pool if d.price_inr < dish.price_inr and d.id != healthier.id]
    if cheaper:
        budget = min(cheaper, key=lambda d: d.price_inr)
        alts.append(_make_alternative(budget, "budget_swap", "Cheaper, same course"))
    else:
        others = [d for d in pool if d.id != healthier.id]
        if others:
            popular = min(others, key=lambda d: abs(d.price_inr - dish.price_inr))
            alts.append(_make_alternative(popular, "popular_pick", "Fan favourite, similar price"))
    return alts


def _make_alternative(swap: DishRecord, swap_type: str, reason: str) -> Alternative:
    return Alternative(
        dish_id=swap.id,
        type=swap_type,
        name=swap.name,
        reason=reason,
        cuisine=swap.cuisine,
        category=swap.category,
        tags=swap.dietary_tags + swap.mood_tags,
        image_url=swap.image_url,
        practical_details=PracticalDetails(
            estimated_price=swap.price_inr,
            preparation_time=swap.prep_time_min,
            calories=swap.calories,
            health_score=swap.health_score,
        ),
    )


def get_dish_detail(dish_id: str) -> DishDetailResponse:
    dish = DISHES_BY_ID.get(dish_id)
    if dish is None:
        return DishDetailResponse(success=False, error=f"Dish '{dish_id}' not found.")

    return DishDetailResponse(
        success=True,
        dish=_dish_to_summary(dish),
        image_url=dish.image_url,
        practical_details=PracticalDetails(
            estimated_price=dish.price_inr,
            preparation_time=dish.prep_time_min,
            calories=dish.calories,
            health_score=dish.health_score,
        ),
        restaurant=Restaurant(
            name="Popular Eats",
            rating=4.2,
            distance_km=1.5,
            delivery_time_min=25,
            is_open=True,
        ),
        alternatives=_build_alternatives(dish, []),
        pairing_suggestions=[_pairing_for(dish)],
    )


def _fallback_response(
    error: str, count: int, restrictions: Optional[list[str]] = None
) -> RecommendationResponse:
    fallback_dishes = _build_fallback(count, restrictions)
    recs = [
        Recommendation(
            id=f"rec_{uuid.uuid4().hex[:8]}",
            rank=i + 1,
            confidence=0.5,
            dish=_dish_to_summary(d),
            image_url=d.image_url,
            ai_reasoning=AiReasoning(
                mood_match="Highly rated comfort pick",
                context_fit="Suitable for most occasions",
                psychological_hook="A crowd-pleasing choice to lift your mood",
            ),
            practical_details=PracticalDetails(
                estimated_price=d.price_inr,
                preparation_time=d.prep_time_min,
                calories=d.calories,
                health_score=d.health_score,
            ),
            restaurant=Restaurant(
                name="Popular Eats",
                rating=4.2,
                distance_km=1.5,
                delivery_time_min=25,
                is_open=True,
            ),
        )
        for i, d in enumerate(fallback_dishes)
    ]
    return RecommendationResponse(
        success=False,
        recommendations=recs,
        error=f"AI unavailable — showing top-rated fallbacks. ({error})",
    )
