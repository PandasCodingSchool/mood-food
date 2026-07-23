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
from app.services.shortlist import build_shortlist, dishes_for_prompt as shortlist_prompt

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
5. NEGATIVE SIGNALS: strongly demote dishes whose category, cuisine, or name matches \
any keyword in the AVOID/disliked lists — never rank them in the top results unless \
nothing else satisfies the hard constraints.
6. RANK by: POSITIVE SIGNALS (liked/cravings/cuisines keyword match) > mood_tags match > \
spice_level vs spice_tolerance > energy_requirement vs energy_level > weather_tags match > \
adventurousness alignment > health_conscious alignment
7. DIVERSITY: unless diversity is "low", the selected dishes must span different \
dish types — never return multiple variants of the same dish (e.g. three fried-chicken \
dishes). Vary category and preparation across the set.
8. INDIA AVAILABILITY: prefer dishes realistically available for delivery in Indian \
cities (Indian, and India-adapted Chinese/Italian/American/Mexican/Thai/Japanese/ \
Mediterranean fusion). Avoid dishes centered on beef, pork, or rare/luxury \
preparations (foie gras, caviar, oysters, wagyu) — they are not deliverable via \
Swiggy in India.
9. context_tags: for each dish, generate 2-3 short tags (1-2 words each) that describe \
WHY this dish fits the user's current emotional state and context — NOT generic dish \
descriptors. Examples for stressed+comfort: ["Stress Relief", "Soul Food", "Comfort Pick"]. \
Tags must be personalized to THIS user's mood, NOT reused from the dish's own mood_tags.

Return ONLY valid JSON, no markdown fences, no extra text."""


def _build_user_message(
    ctx: UserContext,
    config: RecommendationConfig,
    candidates: Optional[list[DishRecord]] = None,
    live_facts: Optional[dict[str, dict]] = None,
) -> str:
    mood = ctx.mood
    prefs = ctx.preferences
    sit = ctx.situational
    game = ctx.game_data
    hist = ctx.history

    sliders = (game.slider_values if game and game.slider_values else None)
    budget_max = (sit.budget.max if sit and sit.budget else None)
    # No explicit budget: synthesize from the game's budget tier.
    if budget_max is None and game and game.budget_tier:
        budget_max = {"budget": 300, "moderate": 800, "splurge": 2000}[game.budget_tier]
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

    # Runner-up characters as a soft hint
    if game and game.character and game.character.runner_ups:
        echo_names = [
            str(r.get("id") or r.get("name", ""))
            for r in game.character.runner_ups
            if isinstance(r, dict)
        ]
        echo_names = [n for n in echo_names if n]
        if echo_names and character_context:
            character_context += f"  Secondary personality echoes (soft hint): {echo_names}\n"

    # Unified game-signal context lines
    game_context = ""
    if game:
        positives = []
        if game.liked:
            positives.append(f"liked={game.liked}")
        if game.cravings:
            positives.append(f"cravings={game.cravings} (ordered, strongest first)")
        if game.cuisines:
            positives.append(f"cuisines={game.cuisines}")
        if positives:
            game_context += f"  POSITIVE SIGNALS: {' | '.join(positives)}\n"
        avoid = list(game.disliked) + (hist.avoid_these if hist else [])
        if avoid:
            game_context += f"  NEGATIVE SIGNALS (avoid): {avoid}\n"
        if game.mood_vector:
            mv = game.mood_vector
            game_context += (
                f"  mood_vector: energy={mv.energy:+.2f} valence={mv.valence:+.2f} "
                f"social={mv.social:+.2f} (each -1..1)\n"
            )
        if game.swipes:
            liked = [s.item for s in game.swipes if s.liked]
            disliked = [s.item for s in game.swipes if not s.liked]
            if liked or disliked:
                game_context += f"  swipe_liked={liked} | swipe_disliked={disliked}\n"
        if game.craving_tags:
            game_context += (
                f"  CRAVING CONSTRAINTS (acute, sensation-level — these override "
                f"long-term preferences for THIS session): {game.craving_tags}\n"
            )
        if game.pantry_items:
            game_context += f"  pantry_at_home={game.pantry_items}\n"

    # State / occasion / anchors context
    state_context = ""
    if mood.hunger_level is not None:
        portion = (
            "snack-sized" if mood.hunger_level <= 3
            else "a full meal" if mood.hunger_level <= 7
            else "a hearty feast (combo/shareable portions)"
        )
        state_context += (
            f"  hunger={mood.hunger_level}/10 — portion guidance: recommend {portion}\n"
        )
    if mood.stress_level is not None:
        state_context += f"  stress={mood.stress_level}/10\n"
    if sit and sit.hours_since_last_meal is not None:
        state_context += f"  hours_since_last_meal={sit.hours_since_last_meal}\n"
    if sit and sit.occasion:
        occasion_hint = {
            "treat": "an indulgent treat night — lean into cravings, budget is flexible",
            "fuel": "a practical fuel meal — efficient, satisfying, budget-conscious",
            "reward": "a well-earned reward — special but not extravagant",
        }[sit.occasion]
        state_context += f"  occasion={sit.occasion} ({occasion_hint})\n"
    if ctx.comfort_anchors:
        anchors = [f"{a.food} ({a.trigger})" for a in ctx.comfort_anchors]
        state_context += (
            f"  COMFORT ANCHORS (emotional anchor foods — elevate a matching dish "
            f"when mood is low, and say why in nostalgia_factor): {anchors}\n"
        )
    if config.mode == "mind_reader":
        state_context += (
            "  MODE: mind-reader — you are committing to ONE confident pick. Make the "
            "psychological_hook bold and specific; the user sees your reasoning.\n"
        )

    unavailable_block = ""
    if ctx.unavailable_dishes:
        names = "\n".join(f"  - {d}" for d in ctx.unavailable_dishes)
        unavailable_block = (
            "\nCRITICAL — the following dishes are NOT available for delivery near the user. "
            "Do NOT recommend them or anything similar:\n"
            + names
            + "\nChoose completely different alternatives.\n"
        )

    dish_block = shortlist_prompt(candidates) if candidates else get_dishes_for_prompt()

    live_block = ""
    restaurant_json = ""
    if live_facts:
        lines = []
        for dish_id, fact in live_facts.items():
            item = fact.get("item") or {}
            rest = fact.get("restaurant") or {}
            lines.append(
                f"  - {dish_id}: live item={item.get('name')} ₹{item.get('price')} "
                f"@ {rest.get('name')} eta={rest.get('eta_min')}min rating={rest.get('rating')}"
            )
        live_block = (
            "\nLIVE SWIGGY AVAILABILITY (prefer these — they are deliverable now):\n"
            + "\n".join(lines)
            + "\nOnly rank dish_ids from the DISH LIST. Prefer live-available dishes.\n"
        )
    else:
        restaurant_json = """,
  "restaurant_suggestions": [
    {"name": "...", "rating": 4.2, "distance_km": 1.5, "delivery_time_min": 25, "is_open": true}
  ]"""

    return f"""PAYLOAD:
  mood={mood.primary} | energy={mood.energy_level}/10 | social={mood.social_context}
  time_of_day={sit.time_of_day if sit else None} | weather={sit.weather if sit else None} | budget={budget_str} | time_available={sit.time_available if sit else None}min | delivery={sit.delivery_preferred if sit else False}
  cuisines={prefs.cuisine_types if prefs else []} | restrictions={prefs.dietary_restrictions if prefs else []} | allergies={prefs.allergies if prefs else []} | spice_tolerance={prefs.spice_tolerance if prefs else None}
  adventurous_slider={sliders.adventurous if sliders else None}/10 | health_slider={sliders.health_conscious if sliders else None}/10 | spicy_slider={sliders.spicy if sliders else None}/10
  avoid={hist.avoid_these if hist else []}
{state_context}{game_context}{character_context}{unavailable_block}{live_block}
DISH LIST (id: name | mood_tags | spice | diet | allergens | energy_req | price | weather | meal_time | delivery | adventurousness):
{dish_block}

Return exactly {config.count} dishes as JSON:
{{
  "ranked_dishes": [
    {{
      "dish_id": "...",
      "confidence": 0.0,
      "mood_match": "one sentence",
      "context_fit": "one sentence",
      "psychological_hook": "one sentence why this dish fits the user's current state",
      "nostalgia_factor": "one sentence or null",
      "context_tags": ["tag1", "tag2", "tag3"]
    }}
  ],
  "mood_profile": "one sentence describing the user's emotional state",
  "preference_evolution": "one sentence prediction"{restaurant_json}
}}"""


_CACHE: dict[str, tuple[float, RecommendationResponse]] = {}
_CACHE_TTL_S = 300.0
_CACHE_MAX = 256


def _cache_key(request: RecommendationRequest, candidate_ids: Optional[list[str]] = None) -> str:
    """Hash mood/profile config only — exclude transport fields like swiggy_address_id."""
    payload = {
        "user_context": request.user_context.model_dump(exclude_none=True),
        "recommendation_config": request.recommendation_config.model_dump(exclude_none=True),
        "candidate_ids": candidate_ids or [],
    }
    canonical = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _cache_get(key: str) -> Optional[RecommendationResponse]:
    entry = _CACHE.get(key)
    if not entry:
        return None
    expires, resp = entry
    if expires < time.time():
        _CACHE.pop(key, None)
        return None
    return resp


def _cache_put(key: str, resp: RecommendationResponse) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        # Drop oldest by expiry
        oldest = min(_CACHE.items(), key=lambda kv: kv[1][0])[0]
        _CACHE.pop(oldest, None)
    _CACHE[key] = (time.time() + _CACHE_TTL_S, resp)


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
    candidate_dishes: Optional[list[DishRecord]] = None,
    live_facts: Optional[dict[str, dict]] = None,
) -> RecommendationResponse:
    candidates = candidate_dishes or build_shortlist(
        request.user_context, request.recommendation_config
    )
    candidate_ids = [d.id for d in candidates]
    key = _cache_key(request, candidate_ids)
    # Skip cache when live facts or unavailable_dishes force a fresh ranking.
    if (
        not request.user_context.unavailable_dishes
        and not live_facts
        and (cached := _cache_get(key)) is not None
    ):
        meta = cached.ai_metadata.model_copy(update={"cache_hit": True}) if cached.ai_metadata else None
        return cached.model_copy(update={"ai_metadata": meta})

    restrictions = _restrictions_of(request)
    allowed_ids = {d.id for d in candidates}

    if llm is None:
        llm = ChatOpenAI(
            model=settings.openai_model,
            temperature=request.recommendation_config.temperature,
            model_kwargs={"response_format": {"type": "json_object"}},
        )

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=_build_user_message(
            request.user_context,
            request.recommendation_config,
            candidates=candidates,
            live_facts=live_facts,
        )),
    ]

    start = time.time()
    try:
        result = llm.invoke(messages)
    except Exception as exc:
        return _fallback_response(
            str(exc),
            request.recommendation_config.count,
            restrictions,
            preferred=candidates,
            live_facts=live_facts,
        )

    elapsed = round(time.time() - start, 2)
    token_usage = result.response_metadata.get("token_usage", {})

    try:
        data = json.loads(result.content)
    except json.JSONDecodeError:
        return _fallback_response(
            "Invalid JSON from model",
            request.recommendation_config.count,
            restrictions,
            preferred=candidates,
            live_facts=live_facts,
        )

    ranked_raw = [
        it for it in data.get("ranked_dishes", [])
        if it.get("dish_id") in allowed_ids
    ]
    # Prefer live-verified dishes when available.
    if live_facts:
        live_ids = set(live_facts.keys())
        live_first = [it for it in ranked_raw if it["dish_id"] in live_ids]
        rest = [it for it in ranked_raw if it["dish_id"] not in live_ids]
        ranked_raw = live_first + rest
        # Backfill from live facts if GPT under-returned.
        used = {it.get("dish_id") for it in ranked_raw}
        for dish_id in live_facts:
            if len(ranked_raw) >= request.recommendation_config.count:
                break
            if dish_id in used:
                continue
            ranked_raw.append({
                "dish_id": dish_id,
                "confidence": 0.75,
                "mood_match": "Available nearby right now",
                "context_fit": "Verified on Swiggy near you",
                "psychological_hook": "A deliverable pick that still fits your mood.",
            })

    ranked = _apply_diet_filter(
        ranked_raw, restrictions, request.recommendation_config.count
    )
    # Keep only shortlisted ids after diet backfill.
    ranked = [it for it in ranked if it.get("dish_id") in allowed_ids][
        : request.recommendation_config.count
    ]
    restaurant_pool: list[dict] = [] if live_facts else data.get("restaurant_suggestions", [])

    recommendations: list[Recommendation] = []
    used_swap_ids: set[str] = set()
    for i, item in enumerate(ranked):
        dish = DISHES_BY_ID.get(item.get("dish_id", ""))
        if dish is None:
            continue

        live = (live_facts or {}).get(dish.id)
        if live and live.get("restaurant"):
            rest = live["restaurant"]
            rest_data = {
                "name": rest.get("name", "Local Kitchen"),
                "rating": rest.get("rating") or 4.0,
                "distance_km": rest.get("distance_km") or 2.0,
                "delivery_time_min": rest.get("eta_min") or 30,
                "is_open": rest.get("is_open", True),
            }
            price = (live.get("item") or {}).get("price") or dish.price_inr
            image = (live.get("item") or {}).get("image_url") or dish.image_url
        else:
            rest_data = restaurant_pool[i] if i < len(restaurant_pool) else {
                "name": "Local Kitchen", "rating": 4.0,
                "distance_km": 2.0, "delivery_time_min": 30, "is_open": True,
            }
            price = dish.price_inr
            image = dish.image_url

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
            image_url=image,
            ai_reasoning=AiReasoning(
                mood_match=item.get("mood_match", ""),
                context_fit=item.get("context_fit", ""),
                psychological_hook=item.get("psychological_hook", ""),
                nostalgia_factor=item.get("nostalgia_factor"),
                context_tags=item.get("context_tags", []),
            ),
            practical_details=PracticalDetails(
                estimated_price=float(price),
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
    if not request.user_context.unavailable_dishes and not live_facts:
        _cache_put(key, response)
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
    """Same-course, diet-appropriate candidates — same cuisine first, else any.

    Complimentary items (breads, pickles, accompaniment salads) are never
    swap-eligible — nobody orders them as a standalone dish.
    """
    group = _course_group(dish)
    eligible = [
        d for d in DISHES
        if d.id != dish.id and d.category in group and d.tier != "complimentary"
        and _diet_allows(d, restrictions)
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

    - healthier        = healthiest same-course, diet-ok alternative not already
                          used by another recommendation.
    - budget_swap       = cheapest option strictly cheaper than the dish.
    - similar_tier_swap = fallback when nothing is cheaper — same-course option
                          priced within 10-15% above the dish, so the "cheaper"
                          swap never jumps to a wildly different price tier.
    - popular_pick      = last-resort fallback when even the 10-15% band is empty
                          — closest-priced alternative, so budget dishes still
                          show two swap tiles.
    """
    pool = [d for d in _swap_candidates(dish, restrictions) if d.id not in exclude_ids]
    if not pool:
        return []

    alts: list[Alternative] = []
    healthier = max(pool, key=lambda d: d.health_score)
    alts.append(_make_alternative(healthier, "healthier_swap", "Lighter pick, similar vibe"))

    others = [d for d in pool if d.id != healthier.id]
    cheaper = [d for d in others if d.price_inr < dish.price_inr]
    if cheaper:
        budget = min(cheaper, key=lambda d: d.price_inr)
        alts.append(_make_alternative(budget, "budget_swap", "Cheaper, same course"))
    else:
        band_max = dish.price_inr * 1.15
        band = [d for d in others if dish.price_inr <= d.price_inr <= band_max]
        if band:
            similar = min(band, key=lambda d: d.price_inr)
            alts.append(_make_alternative(similar, "similar_tier_swap", "Same tier, similar budget"))
        elif others:
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
    error: str,
    count: int,
    restrictions: Optional[list[str]] = None,
    preferred: Optional[list[DishRecord]] = None,
    live_facts: Optional[dict[str, dict]] = None,
) -> RecommendationResponse:
    if preferred:
        fallback_dishes = preferred[:count]
    else:
        fallback_dishes = _build_fallback(count, restrictions)
    # Prefer live-verified dishes when ranking fails.
    if live_facts:
        live_dishes = [DISHES_BY_ID[i] for i in live_facts if i in DISHES_BY_ID]
        if live_dishes:
            fallback_dishes = (live_dishes + [d for d in fallback_dishes if d.id not in live_facts])[:count]

    recs = []
    for i, d in enumerate(fallback_dishes):
        live = (live_facts or {}).get(d.id)
        if live and live.get("restaurant"):
            rest = live["restaurant"]
            restaurant = Restaurant(
                name=rest.get("name", "Popular Eats"),
                rating=float(rest.get("rating") or 4.2),
                distance_km=float(rest.get("distance_km") or 1.5),
                delivery_time_min=int(rest.get("eta_min") or 25),
                is_open=bool(rest.get("is_open", True)),
            )
            price = (live.get("item") or {}).get("price") or d.price_inr
            image = (live.get("item") or {}).get("image_url") or d.image_url
        else:
            restaurant = Restaurant(
                name="Popular Eats",
                rating=4.2,
                distance_km=1.5,
                delivery_time_min=25,
                is_open=True,
            )
            price = d.price_inr
            image = d.image_url
        recs.append(Recommendation(
            id=f"rec_{uuid.uuid4().hex[:8]}",
            rank=i + 1,
            confidence=0.5,
            dish=_dish_to_summary(d),
            image_url=image,
            ai_reasoning=AiReasoning(
                mood_match="Highly rated comfort pick",
                context_fit="Suitable for most occasions",
                psychological_hook="A crowd-pleasing choice to lift your mood",
            ),
            practical_details=PracticalDetails(
                estimated_price=float(price),
                preparation_time=d.prep_time_min,
                calories=d.calories,
                health_score=d.health_score,
            ),
            restaurant=restaurant,
        ))
    return RecommendationResponse(
        success=False,
        recommendations=recs,
        error=f"AI unavailable — showing top-rated fallbacks. ({error})",
    )
