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
from app.lab import trace
from app.schemas.request import UserContext
from app.schemas.response import AiReasoning
from app.services import sensory
from app.services.shortlist import ScoredDish


def _pick(options: list[str], seed: str, avoid: Optional[set[str]] = None) -> str:
    """Stable choice by hash, skipping lines already used elsewhere in this response."""
    start = int(hashlib.sha256(seed.encode()).hexdigest(), 16) % len(options)
    rotated = options[start:] + options[:start]
    return next((o for o in rotated if not avoid or o not in avoid), rotated[0])


_METHOD = {
    "dum": "slow-cooked dum style", "tandoor": "fresh off the tandoor", "curry": "a proper slow-simmered curry",
    "simmered": "slow-simmered", "griddled": "hot off the griddle", "steamed": "light and steamed",
    "fried": "crisp-fried", "grilled": "flame-grilled", "stir_fried": "wok-tossed", "baked": "oven-baked",
    "roasted": "roasted", "smoked": "smoky", "raw": "fresh and no-cook", "chilled": "served chilled",
}
_REGION = {
    "punjab": "Punjabi", "hyderabad": "Hyderabadi", "lucknow": "Lucknowi", "kerala": "Kerala", "karnataka": "Karnataka",
    "tamil_nadu": "Tamil", "bengal": "Bengali", "kolkata": "Kolkata", "mumbai": "Mumbai", "goa": "Goan",
    "gujarat": "Gujarati", "rajasthan": "Rajasthani", "kashmir": "Kashmiri", "andhra": "Andhra", "chettinad": "Chettinad",
    "mangalore": "Mangalorean", "maharashtra": "Maharashtrian", "konkan": "Konkani", "bihar": "Bihari",
    "parsi": "Parsi", "north_east": "North-Eastern", "delhi": "Delhi", "old_delhi": "Old Delhi",
    "indo_chinese": "Indo-Chinese", "seoul": "Korean", "tokyo": "Japanese", "bangkok": "Thai", "levant": "Levantine",
}


def _dish_fact(d: DishRecord) -> Optional[str]:
    """A short, true, dish-specific line from the food graph."""
    region = _REGION.get(d.region or "")
    method = _METHOD.get(d.cooking_method or "")
    if region and method:
        return f"A {region} favourite, {method}."
    if region:
        return f"A {region} classic."
    if method:
        return f"{d.name}, {method}."
    return None


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
    used: Optional[set[str]] = None,
) -> AiReasoning:
    """``used`` collects lines already shown in this response so cards don't repeat."""
    used = used if used is not None else set()
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
            f"{d.name} brings the {_joined(words)} comfort {moment} wants.",
        ], key, used)
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
    hooks: list[str] = []
    if parts.get("history", 0) > 0:
        hooks += ["One of your repeat favourites.", "You keep coming back to this one — for good reason."]
    if parts.get("cluster") and game and game.cluster:
        hooks.append(f"It matches your {game.cluster.name} result from Tonight's Story.")
    if craving_tags and parts.get("sensory", 0) > 2:
        hooks.append(f"Hits your craving for {_joined(craving_tags[:2])}.")
    if parts.get("taste", 0) > 3:
        hooks.append("Close to dishes you've loved before.")
    fact = _dish_fact(d)
    if fact:
        hooks.append(fact)
    # The model-score line is a fallback, and only ever once per response.
    if jev_fit is not None and jev_fit >= 0.75 and not any(u.startswith("Our decision model") for u in used):
        hooks.append(f"Our decision model rates it a strong fit for you right now ({round(jev_fit * 100)}%).")
    if parts.get("cuisine"):
        hooks.append(f"From {d.cuisine.title()}, one of your favourite cuisines.")
    hook = next((h for h in hooks if h not in used), None) or mood_match
    used.update({mood_match, hook})
    if trace.enabled():
        hook_src = {**{h: "history" for h in hooks if "favourite" in h.lower() or "coming back" in h},
                    **{h: "story_cluster" for h in hooks if "Tonight's Story" in h},
                    **{h: "craving" for h in hooks if h.startswith("Hits your craving")},
                    **{h: "taste_model" for h in hooks if h.startswith("Close to dishes")},
                    **({fact: "dish_fact"} if fact else {}),
                    **{h: "jev_fit" for h in hooks if h.startswith("Our decision model")},
                    **{h: "cuisine_preference" for h in hooks if h.startswith("From ")}}
        trace.emit("explain", dish_id=d.id, dish=d.name, sources={
            "mood_match": (f"sensory match: {', '.join(words)}" + (f" for {moment}" if moment else "")) if words
                          else ("mood part" if parts.get("mood") else "cuisine fallback"),
            "context_fit": ("meal_time part" if parts.get("meal_time") and meal else "dish category") + f"; price band from ₹{round(shown_price)}",
            "psychological_hook": hook_src.get(hook, "mood_match fallback"),
            "candidate_hooks": [{"text": h, "source": hook_src.get(h, "?")} for h in hooks],
        })

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
