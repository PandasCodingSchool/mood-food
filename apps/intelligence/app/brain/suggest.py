"""Suggested for you: what this user probably wants *now*, before they ask.

1. Context = IST meal slot + weekday/weekend (or given), weather if known, and the
   user's state today (check-in / cravings via live_state). Without a check-in no
   mood is assumed; their usual occasion at this time sets treat / fuel.
2. Candidates = the shortlist (with the brain part) → decision engine (JEV blend,
   MMR) → commit confidence.
3. Picks = familiar, high-fit dishes + exactly one *stretch*: never ordered, outside
   their usual cuisine × protein pairs, still well ranked for them.
4. Reasons cite brain facts ("Your weekday-lunch usual: mediterranean").
5. Live Swiggy cards when an address is given.
6. Cached per (evidence, slot, daytype, address) for CACHE_TTL_S — repeat views make
   no JEV calls; ``refresh`` bypasses. Every fresh suggestion is logged to
   recommendation_runs (mode "sos_home") for outcome tracking (brain.success).
"""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from collections import Counter
from datetime import datetime
from typing import Any, Optional

from app.brain import facts as brain_facts
from app.brain import orders as brain_orders
from app.brain.relations import Relations
from app.data.dishes import DISHES_BY_ID
from app.history.normalise import IST, meal_slot
from app.history.profile import CATALOG_CUISINE
from app.lab import trace
from app.learning import store

CACHE_KEY = "sos_cache"
CACHE_TTL_S = 30 * 60
STRETCH_FROM_RANK = 3        # stretch candidates come from below the top picks...
STRETCH_MAX_RANK = 15        # ...but not from the long tail
# The usual occasion only sets the (grounded) spending situation; a mood is never invented.
OCCASION_SITUATION = {"treat": "treat", "group_feast": "treat", "work_lunch": "fuel", "breakfast_routine": "fuel"}
NO_MOOD = "neutral"   # no check-in today: matches no dish mood tag, so the mood part scores nothing


def _fingerprint(user_id: str) -> list:
    orders = brain_orders.load(user_id)
    return [len(orders), orders[-1].get("ordered_at") if orders else None,
            len(store.get_usage(user_id, "grocery_orders", {}) or {}), int(store.get_usage(user_id, "games_finished", 0) or 0),
            store.get_usage(user_id, "last_craving_day"), (store.get_usage(user_id, "house_state", {}) or {}).get("house")]


def _usual_occasion(orders: list[dict], slot: str, daytype: str, now: datetime) -> Optional[str]:
    """Most common occasion at this time, recent orders weighing more (so ties go to current habits)."""
    c: Counter = Counter()
    for o in orders:
        if o.get("occasion") and o.get("meal_slot") == slot and \
                ("weekend" if o.get("weekday") in ("saturday", "sunday") else "weekday") == daytype:
            c[o["occasion"]] += brain_facts.order_weight(o, now)
    return c.most_common(1)[0][0] if c else None


def _pair(dish_id: str) -> tuple:
    d = DISHES_BY_ID[dish_id]
    return d.cuisine, d.protein


def _reasons(dish_id: str, food: dict, pred: dict, slot: str, daytype: str, stretch: bool) -> list[dict]:
    """True reasons for this pick, most specific first (the caller takes the first not already used)."""
    d = DISHES_BY_ID[dish_id]
    if stretch:
        return [{"kind": "stretch", "fact_ids": [], "text": "Something new to try: you haven't ordered this, and it's close to what you enjoy."}]
    out = []
    favs = {f["dish_id"] for f in food.get("favourites", []) if f.get("dish_id") and f["orders"] >= 2}
    if dish_id in favs:
        out.append({"kind": "favourite", "fact_ids": ["food.favourite"], "text": "One of your favourites."})
    # "Usual at this time" only when this context has its own evidence; otherwise it's their overall taste.
    when = {c["context"]: c["value"] for c in pred.get("contexts", [])}
    timed = when.get("slot") == slot
    moment = f"{daytype} {slot.replace('_', ' ')}" if when.get("daytype") == daytype else slot.replace("_", " ")
    top = next(iter(pred.get("distributions", {}).get("cuisine", {})), None)
    if top and CATALOG_CUISINE.get(top) == d.cuisine:
        label = top.replace("_", " ").title()
        out.append({"kind": "usual", "fact_ids": ["food.top_cuisine"],
                    "text": f"Your {moment} usual: {label} food." if timed else f"You love {label} food."})
    top_p = next(iter(pred.get("distributions", {}).get("protein", {})), None)
    if top_p and (d.protein == top_p or (top_p == "seafood" and d.protein == "prawn")):
        label = top_p.replace("_", " ")
        out.append({"kind": "usual", "fact_ids": ["food.top_protein"],
                    "text": f"You usually go for {label} at {slot.replace('_', ' ')}." if timed else f"You usually pick {label}."})
    out.append({"kind": "fit", "fact_ids": [], "text": "A strong fit for right now."})
    return out


def _pick_reasons(recs: list, food: dict, pred: dict, slot: str, daytype: str, stretch_id: Optional[str]) -> dict[str, dict]:
    used: set[str] = set()
    out = {}
    for r in recs:
        options = _reasons(r.dish.id, food, pred, slot, daytype, r.dish.id == stretch_id)
        choice = next((o for o in options if o["text"] not in used), options[-1])
        used.add(choice["text"])
        out[r.dish.id] = choice
    return out


async def suggest(user_id: str, *, slot: Optional[str] = None, daytype: Optional[str] = None, weather: Optional[str] = None,
                  count: int = 3, address_id: Optional[str] = None, user_token: Optional[str] = None,
                  refresh: bool = False) -> dict[str, Any]:
    from starlette.concurrency import run_in_threadpool

    from app.brain.notes import notes
    from app.decisions import engine
    from app.learning import live_state, runs
    from app.schemas.request import RecommendationConfig, RecommendationRequest, UserContext
    from app.services import live_cards, recommender
    from app.services.shortlist import build_scored_shortlist

    t0 = time.perf_counter()
    now = datetime.now(IST)
    slot = slot or meal_slot(now.hour)
    daytype = daytype or ("weekend" if now.weekday() >= 5 else "weekday")
    key = hashlib.sha1(json.dumps([_fingerprint(user_id), slot, daytype, weather, count, address_id], default=str).encode()).hexdigest()[:16]
    cache = store.get_usage(user_id, CACHE_KEY, {}) or {}
    hit = cache.get(key)
    if hit and not refresh and time.time() - hit["at"] < CACHE_TTL_S:
        trace.emit("sos.cache", hit=True, key=key, age_s=round(time.time() - hit["at"]))
        return {**hit["result"], "cached": True}

    orders = brain_orders.load(user_id)
    food = brain_facts.compute(orders, now)
    rel = Relations(orders, now)
    pred = rel.predict(slot, daytype) if orders else {"distributions": {}, "confidence": 0.0}
    occasion = _usual_occasion(orders, slot, daytype, now)
    is_weekend_now = now.weekday() >= 5
    # The real weekday when asking about today's kind of day; a representative one otherwise.
    weekday_name = now.strftime("%A").lower() if (daytype == "weekend") == is_weekend_now else \
        ("saturday" if daytype == "weekend" else "wednesday")
    situational = {"time_of_day": slot, "day_of_week": weekday_name, "delivery_preferred": True,
                   **({"weather": weather} if weather else {}),
                   **({"occasion": OCCASION_SITUATION[occasion]} if occasion in OCCASION_SITUATION else {})}
    ctx = UserContext.model_validate({"mood": {"primary": NO_MOOD}, "situational": situational})
    request_id = f"sos-{uuid.uuid4().hex[:12]}"
    body = RecommendationRequest(user_context=ctx, user_id=user_id, request_id=request_id,
                                 recommendation_config=RecommendationConfig(count=max(count, 3), mode="sos"))
    body = await run_in_threadpool(live_state.apply_learned_state, body)   # today's check-in / cravings win
    ctx = body.user_context.model_copy(update={"habits": await run_in_threadpool(notes, user_id)})

    scored = await run_in_threadpool(build_scored_shortlist, ctx, body.recommendation_config, user_id=user_id)
    eng = await engine.rank(ctx, scored)
    ranked = eng.ranked
    ordered_ids = {i.get("dish_id") for o in orders for i in o.get("items") or [] if i.get("dish_id")}
    usual_pairs = {_pair(i) for i in ordered_ids if i in DISHES_BY_ID}
    top_cuisines = {CATALOG_CUISINE.get(c) for c in list(food.get("cuisine_mix", {}))[:2]}
    top_proteins = set(list(food.get("protein_mix", {}))[:2])

    familiar = [s for s in ranked][: max(1, count - 1)]
    stretch = next((s for s in ranked[STRETCH_FROM_RANK:STRETCH_MAX_RANK]
                    if s.dish.id not in ordered_ids and _pair(s.dish.id) not in usual_pairs
                    and (s.dish.cuisine not in top_cuisines or s.dish.protein not in top_proteins)
                    and s.dish.id not in {f.dish.id for f in familiar}), None) if orders else None
    picks = familiar + ([stretch] if stretch else [])
    if len(picks) < count:
        picks += [s for s in ranked if s not in picks][: count - len(picks)]

    commit = await engine.commit(ctx, picks, seed=request_id)
    conf = {i: eng.jev_fit.get(i, 0.4 + 0.4 * eng.blended.get(i, 0.5)) for i in eng.blended}
    backups = [x for x in ranked if x not in picks][:5]  # stand-ins if a pick isn't sold nearby
    cards = await run_in_threadpool(lambda: recommender.recommendations_from_ranking(
        body, picks + backups, confidence=conf, jev_fit=eng.jev_fit, model=eng.model, response_time_s=0.0))
    live = await live_cards.build(cards.recommendations, count, address_id, user_token) if address_id \
        else live_cards.LiveCards(selected=cards.recommendations[:count])

    reasons = _pick_reasons(live.selected, food, pred, slot, daytype, stretch.dish.id if stretch else None)
    result = {
        "request_id": request_id, "slot": slot, "daytype": daytype, "occasion": occasion,
        "mood_used": ctx.mood.primary if ctx.mood.primary != NO_MOOD else None,
        "situation": (ctx.situational.occasion if ctx.situational else None),
        "prediction": {"confidence": pred.get("confidence"), "top": {f: list(d)[:3] for f, d in pred.get("distributions", {}).items()}},
        "recommendations": [r.model_dump(mode="json") for r in live.selected],
        "reasons": reasons, "stretch_dish_id": stretch.dish.id if stretch and stretch.dish.id in reasons else None,
        "commit": commit, "live_status": live.status, "swiggy_matches": live.matches or None,
        "ranker": eng.provider, "evidence": {"orders": len(orders), "confidence": pred.get("confidence")},
    }
    elapsed = round((time.perf_counter() - t0) * 1000, 1)
    await run_in_threadpool(lambda: runs.record(
        request_id, user_id=user_id, mode="sos_home", ranker_provider=eng.provider, model=eng.model,
        shortlist=[s.dish.id for s in scored], ranked=[s.dish.id for s in ranked], selected=[r.dish.id for r in live.selected],
        fallback_used=eng.provider != "jev", cache_hit=False, live_status=live.status, latency_ms={"total": elapsed},
        tokens=eng.input_tokens or None,
        # Suggestion extras (no schema change): the stretch pick and the context, for brain.success.
        shadow={"suggest": {"stretch": result["stretch_dish_id"], "slot": slot, "daytype": daytype, "occasion": occasion,
                            "reasons": {k: v["kind"] for k, v in reasons.items()}}}))
    cache = {k: v for k, v in cache.items() if time.time() - v["at"] < CACHE_TTL_S}
    cache[key] = {"at": time.time(), "result": result}
    store.set_usage(user_id, CACHE_KEY, cache)
    trace.emit("sos.result", key=key, slot=slot, daytype=daytype, occasion=occasion, mood_used=ctx.mood.primary,
               stretch=result["stretch_dish_id"], picks=[r.dish.name for r in live.selected], reasons=reasons, elapsed_ms=elapsed)
    return {**result, "cached": False}
