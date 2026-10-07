"""Grounded "why this?" copy built from the signals that actually ranked a dish.

Every line is derived from the score breakdown (shortlist.score_breakdown),
the sensory match, JEV's fit probability and learned facts — never invented.
Wording varies by a stable hash of (request_id, dish_id), so the same request
reads the same while different picks don't all sound alike.
"""

from __future__ import annotations

import hashlib
from typing import Optional

from app.data.dishes import DishRecord
from app.schemas.request import UserContext
from app.schemas.response import AiReasoning
from app.services import sensory
from app.services.shortlist import ScoredDish


def _pick(options: list[str], seed: str) -> str:
    return options[int(hashlib.sha256(seed.encode()).hexdigest(), 16) % len(options)]


def _moment(ctx: UserContext) -> Optional[str]:
    """A short phrase for the situation that drove the sensory target."""
    mood, sit = ctx.mood, ctx.situational
    weather = sit.weather if sit else None
    if weather in ("rainy", "cold"):
        return f"a {weather} {'evening' if sit and sit.time_of_day in ('dinner', 'late_night') else 'day'}"
    if weather == "hot":
        return "a hot day"
    if mood.energy_level <= 3 or (mood.primary or "").lower() == "tired":
        return "a low-energy evening" if sit and sit.time_of_day in ("dinner", "late_night") else "a low-energy moment"
    if mood.stress_level is not None and mood.stress_level >= 7 or (mood.primary or "").lower() == "stressed":
        return "unwinding after a stressful day"
    if (mood.primary or "").lower() in ("celebrating", "celebratory"):
        return "a celebration"
    if (mood.primary or "").lower() == "sick":
        return "when you're under the weather"
    return None


def _joined(words: list[str]) -> str:
    return " and ".join(words) if len(words) <= 2 else ", ".join(words[:-1]) + f" and {words[-1]}"


def _price_band(price: float) -> str:
    return "easy on the wallet" if price <= 200 else "fairly priced" if price <= 450 else "a proper treat"


def explain(
    scored: ScoredDish,
    ctx: UserContext,
    *,
    seed: str,
    jev_fit: Optional[float] = None,
    price: Optional[float] = None,
) -> AiReasoning:
    d: DishRecord = scored.dish
    parts = scored.parts
    pulls = sensory.target_pulls(ctx)
    words = sensory.strongest_matches(d, pulls, k=2)
    moment = _moment(ctx)
    game = ctx.game_data
    key = f"{seed}:{d.id}"

    # mood_match — the sensory/mood reason
    if words and moment:
        mood_match = _pick([
            f"{_joined(words).capitalize()} — just right for {moment}.",
            f"Exactly the {_joined(words)} kind of food {moment} calls for.",
            f"{_joined(words).capitalize()}, made for {moment}.",
        ], key)
    elif words:
        mood_match = f"{_joined(words).capitalize()} — matches what you're in the mood for."
    elif parts.get("mood"):
        mood_match = f"A go-to when you're feeling {ctx.mood.primary.lower()}."
    else:
        mood_match = f"A dependable {d.cuisine.title()} pick for right now."

    # context_fit — practical facts
    meal = (ctx.situational.time_of_day or "").replace("_", " ") if ctx.situational else ""
    shown_price = price if price is not None else d.price_inr
    # Price as a band, not a number: the live Swiggy price may differ from the catalog.
    context_fit = (
        f"{'A ' + meal + ' favourite' if parts.get('meal_time') and meal else d.category.replace('_', ' ').capitalize()}"
        f", {_price_band(shown_price)}."
    )

    # psychological_hook — the strongest personal signal
    craving_tags = list(game.craving_tags) if game else []
    if parts.get("history", 0) > 0:
        hook = _pick(["One of your repeat favourites.", "You keep coming back to this one — for good reason."], key)
    elif parts.get("cluster"):
        hook = f"It matches your {game.cluster.name} result from Tonight's Story." if game and game.cluster else "It matches your story result."
    elif craving_tags and parts.get("sensory", 0) > 2:
        hook = f"Hits your craving for {_joined(craving_tags[:2])}."
    elif parts.get("taste", 0) > 3:
        hook = "Close to dishes you've loved before."
    elif parts.get("cuisine"):
        hook = f"From {d.cuisine.title()}, one of your favourite cuisines."
    elif jev_fit is not None and jev_fit >= 0.75:
        hook = f"Our decision model rates it a strong fit for you right now ({round(jev_fit * 100)}%)."
    else:
        hook = mood_match

    nostalgia = None
    anchors = {a.food.lower() for a in ctx.comfort_anchors}
    if d.name.lower() in anchors:
        nostalgia = "One of your comfort foods — the taste of feeling looked after."
    elif "nostalgic" in d.mood_tags and moment:
        nostalgia = "A familiar classic — the kind of food that feels like home."

    tags: list[str] = []
    if words:
        tags.append(" & ".join(w.title() for w in words[:2]))
    if parts.get("history", 0) > 0:
        tags.append("Your Favourite")
    elif craving_tags and parts.get("sensory", 0) > 2:
        tags.append("Craving Match")
    if moment:
        tags.append({
            "a low-energy evening": "Low-Energy Fix", "a low-energy moment": "Low-Energy Fix",
            "a hot day": "Cooling Pick", "a celebration": "Celebration",
            "unwinding after a stressful day": "Unwind",
        }.get(moment, moment.split()[1].title() + " Day" if moment.startswith("a ") else "Right Now"))
    if not tags:
        tags.append(d.cuisine.title())

    return AiReasoning(
        mood_match=mood_match,
        context_fit=context_fit,
        psychological_hook=hook,
        nostalgia_factor=nostalgia,
        context_tags=tags[:3],
    )


def mood_profile(ctx: UserContext) -> str:
    moment = _moment(ctx)
    words = [w for w in (sensory.describe(d, t >= 0.5) for d, t, _ in sorted(sensory.target_pulls(ctx), key=lambda p: -p[2])[:6])]
    unique = list(dict.fromkeys(words))[:3]
    if moment and unique:
        return f"{moment.capitalize()} — leaning {_joined(unique)}."
    if unique:
        return f"Leaning {_joined(unique)} right now."
    return f"Feeling {ctx.mood.primary.lower()}."
