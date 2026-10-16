"""Houses: six evolving food identities, sorted from evidence and shifting as tastes do.

Dal Chawal Gang, Safar Squad, Mirchi Gang, Midnight Munchies, Dawat Club, Taaza Tribe.

membership = softmax(trait / TAU) over six houses, where each trait (0-1) comes
from brain facts (deterministic) blended with a JEV Score per house when JEV is
available. A user is sorted only with enough evidence and a clear leader; after
that they shift only when a challenger leads clearly on two separate evidence
updates (or by a wide margin once). Every sorting / shift is logged with the
facts behind it — the user's "house journey".
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Optional

from app.brain import facts as brain_facts
from app.brain import orders as brain_orders
from app.history import grocery_facts
from app.history.normalise import IST
from app.lab import trace
from app.learning import store

# Display names are product copy: ids are stable (stored states and journeys use them), names can change.
HOUSES: dict[str, dict[str, str]] = {
    "hearthkeepers": {"name": "Dal Chawal Gang", "crest": "🍛", "motto": "Nothing beats ghar ka khana.",
                      "about": "Comfort loyalists: warm, rich, home-style food and the same well-loved favourites."},
    "wayfarers": {"name": "Safar Squad", "crest": "🧭", "motto": "Every plate is a new place.",
                  "about": "Explorers: new cuisines, new places, new dishes, seldom the same order twice."},
    "emberkin": {"name": "Mirchi Gang", "crest": "🌶️", "motto": "Bring the heat.",
                 "about": "Spice and fire: chilli-forward, smoky, bold, tangy food."},
    "moonlit": {"name": "Midnight Munchies", "crest": "🌙", "motto": "The best meals happen after midnight.",
                "about": "Night eaters: late cravings, snacks and indulgent bites after hours."},
    "banqueteers": {"name": "Dawat Club", "crest": "🎉", "motto": "Food tastes better shared.",
                    "about": "Feast-makers: food for the table, celebrations, big generous orders."},
    "verdant": {"name": "Taaza Tribe", "crest": "🥗", "motto": "Fresh, light, balanced.",
                "about": "Fresh and light: clean bowls, salads, balanced and healthy choices."},
}
TAU = 0.12
SORT_LEAD, SORT_MARGIN = 0.40, 0.10
SHIFT_MARGIN, SHIFT_BIG = 0.10, 0.20
JEV_BLEND = 0.5
STATE, EVENTS = "house_state", "house_events"


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def _entropy(mix: dict[str, float]) -> float:
    ps = [p for p in mix.values() if p > 0]
    return (-sum(p * math.log(p) for p in ps) / math.log(len(ps))) if len(ps) > 1 else 0.0


PRIOR_ORDERS = 5


def _shrink(rate: Optional[float], n: int, neutral: float) -> float:
    return neutral if rate is None else (rate * n + neutral * PRIOR_ORDERS) / (n + PRIOR_ORDERS)


def traits(food: dict, groceries: dict) -> dict[str, float]:
    """Deterministic 0-1 trait per house from brain facts."""
    heavy = food.get("heaviness_mix", {})
    forms, occ, slots = food.get("form_mix", {}), food.get("occasion_mix", {}), food.get("slot_mix", {})
    cuisines = food.get("cuisine_mix", {})
    # Rates from a handful of orders say little: shrink toward neutral as if PRIOR_ORDERS neutral orders preceded them.
    n = food.get("orders", 0)
    reorder = _shrink(food.get("reorder_rate"), n, 0.4)
    explore = _shrink(food.get("exploration_rate"), n, 0.5)
    heaviness = heavy.get("heavy", 0) + 0.5 * heavy.get("moderate", 0)
    spend = {"premium": 1.0, "high": 0.7, "mid": 0.3, "budget": 0.0}.get(food.get("spend_band") or "", 0.3)
    units = food.get("units_per_order") or 1.5
    healthy_forms = sum(forms.get(f, 0) for f in ("bowl", "salad", "soup")) + cuisines.get("healthy", 0) + 0.5 * cuisines.get("mediterranean", 0)
    snacky = sum(forms.get(f, 0) for f in ("snack_starter", "dessert", "burger_sandwich"))
    grocery_health = groceries.get("healthiness") if groceries.get("healthiness") is not None else 0.5
    spice = food.get("spice_avg") if food.get("spice_avg") is not None else 0.4
    return {
        "hearthkeepers": round(_clamp(0.4 * reorder + 0.35 * heaviness + 0.25 * (1 - explore)), 3),
        "wayfarers": round(_clamp(0.55 * explore + 0.45 * _shrink(_entropy(cuisines), n, 0.4)), 3),
        "emberkin": round(_clamp(0.8 * _clamp((spice - 0.3) / 0.5) + 0.2 * food.get("spice_mix", {}).get("hot", 0)), 3),
        "moonlit": round(_clamp(0.7 * slots.get("late_night", 0) + 0.3 * snacky), 3),
        "banqueteers": round(_clamp(0.5 * _clamp((units - 1.5) / 4) + 0.3 * (occ.get("group_feast", 0) + occ.get("treat", 0)) + 0.2 * spend), 3),
        "verdant": round(_clamp(0.4 * heavy.get("light", 0) + 0.35 * _clamp(healthy_forms) + 0.25 * grocery_health), 3),
    }


def membership(scores: dict[str, float]) -> dict[str, float]:
    m = max(scores.values())
    exp = {h: math.exp((s - m) / TAU) for h, s in scores.items()}
    z = sum(exp.values())
    return {h: round(v / z, 3) for h, v in sorted(exp.items(), key=lambda kv: -kv[1])}


async def jev_traits(food: dict, groceries: dict) -> Optional[dict[str, float]]:
    """JEV's 0-1 fit per house, judged from the user's facts in words."""
    from typesafe_sdk import Score

    from app.decisions import jev

    client = jev.get_client()
    if client is None or not food.get("orders"):
        return None
    person = {"habits": [f["text"] for f in food.get("facts", []) + groceries.get("facts", [])],
              "cuisines": list(food.get("cuisine_mix", {}))[:4], "usual_meals": list(food.get("slot_mix", {}))[:2],
              "occasions": list(food.get("occasion_mix", {}))[:3]}
    levels = ["not at all", "a little", "somewhat", "clearly", "perfectly"]
    questions = {h: Score(instructions=f"How well does `person` fit this food identity: {v['about']}", criteria=levels)
                 for h, v in HOUSES.items()}
    decision = await client.decide("house_traits", {"person": person}, questions)
    if decision is None:
        return None
    return {h: round(decision.scores[h][0] / (len(levels) - 1), 3) for h in HOUSES if h in decision.scores}


def gate(food: dict, groceries: dict, games: int) -> dict[str, Any]:
    n = food.get("orders", 0)
    ok = n >= 5 or (n >= 2 and games >= 2) or games >= 4
    return {"ok": ok, "orders": n, "grocery_orders": groceries.get("orders", 0), "games": games,
            "rule": "5 orders, or 2 orders + 2 games, or 4 games"}


def _drivers(house: str, food: dict, groceries: dict) -> list[str]:
    keys = {"hearthkeepers": ("food.favourite", "food.exploration", "food.top_cuisine"),
            "wayfarers": ("food.exploration", "food.top_cuisine"), "emberkin": ("food.top_cuisine", "food.top_protein"),
            "moonlit": ("food.usual_slot",), "banqueteers": ("food.spend",), "verdant": ("food.favourite", "food.top_cuisine")}[house]
    facts = {f["id"]: f["text"] for f in food.get("facts", []) + groceries.get("facts", [])}
    return [facts[k] for k in keys if k in facts]


async def recompute(user_id: str, use_jev: bool = True, now: Optional[datetime] = None, refresh: bool = False) -> dict[str, Any]:
    """Recompute membership and apply sorting/shift rules.

    JEV's trait judgement is cached with the evidence fingerprint it was made on
    (food orders, grocery orders, finished games): views with unchanged evidence
    reuse it and make no JEV call. ``refresh`` forces a new judgement.
    """
    now = now or datetime.now(IST)
    orders = brain_orders.load(user_id)
    food = brain_facts.compute(orders, now)
    groceries = grocery_facts.compute(list((store.get_usage(user_id, "grocery_orders", {}) or {}).values()),
                                      store.get_usage(user_id, "grocery_go_to", []) or [], now)
    games = int(store.get_usage(user_id, "games_finished", 0) or 0)
    det = traits(food, groceries)
    state = store.get_usage(user_id, STATE, {}) or {}
    fingerprint = [food.get("orders", 0), groceries.get("orders", 0), games]
    judged, jev_cached = None, False
    if use_jev:
        if not refresh and state.get("jev_fingerprint") == fingerprint and state.get("jev_traits"):
            judged, jev_cached = state["jev_traits"], True
        else:
            judged = await jev_traits(food, groceries)
            if judged is not None:
                state.update(jev_traits=judged, jev_fingerprint=fingerprint)
    blended = {h: round((1 - JEV_BLEND) * det[h] + JEV_BLEND * judged[h], 3) if judged and h in judged else det[h] for h in HOUSES}
    member = membership(blended)
    ranked = list(member)
    lead, second = ranked[0], ranked[1]
    margin = member[lead] - member[second]
    g = gate(food, groceries, games)

    events = store.get_usage(user_id, EVENTS, []) or []
    new_evidence = state.get("fingerprint") != fingerprint
    current = state.get("house")
    event = None
    if current is None:
        if g["ok"] and member[lead] >= SORT_LEAD and margin >= SORT_MARGIN:
            current, event = lead, {"type": "sorted", "house": lead}
    elif lead != current and new_evidence:
        lead_over_current = member[lead] - member.get(current, 0)
        challenger = state.get("challenger") or {}
        streak = challenger.get("count", 0) + 1 if challenger.get("house") == lead else 1
        if lead_over_current >= SHIFT_BIG or (lead_over_current >= SHIFT_MARGIN and streak >= 2):
            event, current = {"type": "shifted", "from": current, "house": lead}, lead
            state["challenger"] = None
        elif lead_over_current >= SHIFT_MARGIN:
            state["challenger"] = {"house": lead, "count": streak}
    elif lead == current:
        state["challenger"] = None
    if event:
        event.update(at=now.isoformat(), membership=member, because=_drivers(event["house"], food, groceries))
        events.append(event)
        state["since"] = now.isoformat()
        store.set_usage(user_id, EVENTS, events[-50:])
    state.update(house=current, fingerprint=fingerprint, membership=member)
    store.set_usage(user_id, STATE, state)

    out = {
        "status": "sorted" if current else "unsorted", "house": current, "house_info": HOUSES.get(current or ""),
        "since": state.get("since"), "membership": member, "leaning": lead, "margin": round(margin, 3),
        "traits": {"deterministic": det, "jev": judged, "blended": blended, "jev_cached": jev_cached}, "gate": g,
        "challenger": state.get("challenger"), "journey": events[-10:], "event": event,
        "houses": HOUSES,   # display info for every house (membership bars, journey labels)
    }
    trace.emit("brain.houses", **{k: out[k] for k in ("status", "house", "membership", "leaning", "margin", "gate", "challenger", "event")},
               traits=out["traits"])
    return out
