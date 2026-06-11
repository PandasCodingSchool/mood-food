from __future__ import annotations

import hashlib
import json
import time
import uuid
from typing import Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.data.dishes import DISHES, DISHES_BY_ID, DishRecord, get_dishes_for_prompt

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
2. HARD EXCLUDE dishes that conflict with dietary_restrictions
3. HARD EXCLUDE dishes priced above budget.max (if provided)
4. RANK by: mood_tags match > spice_level vs spice_tolerance > \
energy_requirement vs energy_level > weather_tags match > adventurousness alignment > health_conscious alignment

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

    # Character context for personality-aligned recommendations
    character_context = ""
    if game and hasattr(game, "character") and game.character:
        char = game.character
        char_name = char.get("name", "unknown") if isinstance(char, dict) else getattr(char, "name", "unknown")
        char_dishes = char.get("characterDishes", []) if isinstance(char, dict) else getattr(char, "characterDishes", [])
        char_dishes_str = ", ".join(char_dishes[:5]) if char_dishes else "not specified"
        character_context = f"\nCHARACTER CONTEXT:\n  Personality: User matched as {char_name}\n  Typical dishes: {char_dishes_str}\n  This is a strong signal — prioritize these character-aligned recommendations.\n"

    return f"""PAYLOAD:
  mood={mood.primary} | energy={mood.energy_level}/10 | social={mood.social_context}
  time_of_day={sit.time_of_day if sit else None} | weather={sit.weather if sit else None} | budget={budget_str} | time_available={sit.time_available if sit else None}min | delivery={sit.delivery_preferred if sit else False}
  cuisines={prefs.cuisine_types if prefs else []} | restrictions={prefs.dietary_restrictions if prefs else []} | allergies={prefs.allergies if prefs else []} | spice_tolerance={prefs.spice_tolerance if prefs else None}
  adventurous_slider={sliders.adventurous if sliders else None}/10 | health_slider={sliders.health_conscious if sliders else None}/10 | spicy_slider={sliders.spicy if sliders else None}/10
  avoid={hist.avoid_these if hist else []}
{character_context}
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


def _build_fallback(count: int) -> list[DishRecord]:
    return sorted(DISHES, key=lambda d: d.health_score, reverse=True)[:count]


def get_recommendations(
    request: RecommendationRequest,
    llm: Optional[ChatOpenAI] = None,
) -> RecommendationResponse:
    key = _cache_key(request)
    if key in _CACHE:
        cached = _CACHE[key]
        meta = cached.ai_metadata.model_copy(update={"cache_hit": True}) if cached.ai_metadata else None
        return cached.model_copy(update={"ai_metadata": meta})

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
        return _fallback_response(str(exc), request.recommendation_config.count)

    elapsed = round(time.time() - start, 2)
    token_usage = result.response_metadata.get("token_usage", {})

    try:
        data = json.loads(result.content)
    except json.JSONDecodeError:
        return _fallback_response("Invalid JSON from model", request.recommendation_config.count)

    ranked = data.get("ranked_dishes", [])
    restaurant_pool: list[dict] = data.get("restaurant_suggestions", [])

    recommendations: list[Recommendation] = []
    for i, item in enumerate(ranked):
        dish = DISHES_BY_ID.get(item.get("dish_id", ""))
        if dish is None:
            continue

        rest_data = restaurant_pool[i] if i < len(restaurant_pool) else {
            "name": "Local Kitchen", "rating": 4.0,
            "distance_km": 2.0, "delivery_time_min": 30, "is_open": True,
        }

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
            alternatives=[
                Alternative(
                    dish_id=_healthier_swap(dish).id,
                    type="healthier_swap",
                    name=_healthier_swap(dish).name,
                    reason="Lower calories, similar comfort profile",
                ),
                Alternative(
                    dish_id=_budget_swap(dish).id,
                    type="budget_swap",
                    name=_budget_swap(dish).name,
                    reason="More wallet-friendly, same cuisine",
                ),
            ] if request.recommendation_config.include_alternatives else [],
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
    _CACHE[key] = response
    return response


def _healthier_swap(dish: DishRecord) -> DishRecord:
    return max(
        (d for d in DISHES if d.cuisine == dish.cuisine and d.id != dish.id),
        key=lambda d: d.health_score,
        default=dish,
    )


def _budget_swap(dish: DishRecord) -> DishRecord:
    return min(
        (d for d in DISHES if d.cuisine == dish.cuisine and d.id != dish.id and d.price_inr < dish.price_inr),
        key=lambda d: d.price_inr,
        default=dish,
    )


def get_dish_detail(dish_id: str) -> DishDetailResponse:
    dish = DISHES_BY_ID.get(dish_id)
    if dish is None:
        return DishDetailResponse(success=False, error=f"Dish '{dish_id}' not found.")

    healthier = _healthier_swap(dish)
    budget = _budget_swap(dish)

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
        alternatives=[
            Alternative(
                dish_id=healthier.id,
                type="healthier_swap",
                name=healthier.name,
                reason="Lower calories, similar comfort profile",
            ),
            Alternative(
                dish_id=budget.id,
                type="budget_swap",
                name=budget.name,
                reason="More wallet-friendly, same cuisine",
            ),
        ],
        pairing_suggestions=[_pairing_for(dish)],
    )


def _fallback_response(error: str, count: int) -> RecommendationResponse:
    fallback_dishes = _build_fallback(count)
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
