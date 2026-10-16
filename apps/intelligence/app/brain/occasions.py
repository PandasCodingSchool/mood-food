"""Occasion labelling: why an order happened (work lunch, late-night craving, group feast, ...).

JEV reads each order in named buckets — meal, weekday/weekend, party size,
spend relative to *this user's* usual, items and how heavy they are — and
picks one occasion (shuffled Choice). Low-confidence answers and a missing key
fall back to rules. Labels are cached per order (``order_occasions``) and become
a context in the brain's relations.
"""

from __future__ import annotations

import logging
from statistics import median
from typing import Any, Optional

from app.brain import orders as brain_orders
from app.brain.facts import HEAVY_BUCKETS, bucket
from app.lab import trace
from app.learning import store

logger = logging.getLogger("brain")
KEY = "order_occasions"
OCCASIONS = {
    "work_lunch": "A weekday lunch while working: quick and practical",
    "solo_weeknight": "An ordinary weeknight dinner for one",
    "late_night_craving": "A late-night craving or snack",
    "treat": "Treating themselves: indulgent or pricier than usual",
    "group_feast": "Food for several people: a get-together or family meal",
    "comfort_reset": "Comfort food after a long or tough day",
    "healthy_routine": "A light, healthy, routine meal",
    "breakfast_routine": "A breakfast or brunch order",
}
MIN_CONFIDENCE = 0.5
JEV_BATCH = 10


def _party(o: dict) -> str:
    units = sum(float(i.get("quantity") or 1) for i in o.get("items") or [])
    return "solo" if units <= 2 else "two people" if units <= 4 else "a group"


def _spend(o: dict, usual: Optional[float]) -> Optional[str]:
    if not o.get("total") or not usual:
        return None
    r = float(o["total"]) / usual
    return "well above their usual" if r >= 1.6 else "above their usual" if r >= 1.2 else "below their usual" if r <= 0.7 else "about their usual"


def _heaviness(o: dict) -> Optional[str]:
    vals = [(i.get("profile") or {}).get("heaviness") for i in o.get("items") or []]
    vals = [v for v in vals if v is not None]
    return bucket(sum(vals) / len(vals), HEAVY_BUCKETS) if vals else None


def describe(o: dict, usual: Optional[float]) -> dict[str, Any]:
    daytype = None if not o.get("weekday") else ("weekend" if o["weekday"] in ("saturday", "sunday") else "weekday")
    d = {"meal": (o.get("meal_slot") or "").replace("_", " ") or None, "day": daytype, "party": _party(o),
         "spend": _spend(o, usual), "how_heavy": _heaviness(o),
         "items": [f"{i['name']} ({((i.get('profile') or {}).get('form') or '').replace('_', ' ')})".replace(" ()", "")
                   for i in o.get("items") or []][:6]}
    return {k: v for k, v in d.items() if v}


def rules(o: dict, usual: Optional[float]) -> str:
    slot, party, spend, heavy = o.get("meal_slot"), _party(o), _spend(o, usual), _heaviness(o)
    weekend = o.get("weekday") in ("saturday", "sunday")
    forms = {(i.get("profile") or {}).get("form") for i in o.get("items") or []}
    if slot == "breakfast":
        return "breakfast_routine"
    if party == "a group":
        return "group_feast"
    if slot == "late_night":
        return "late_night_craving"
    if spend == "well above their usual":
        return "treat"
    if heavy == "light" and forms & {"bowl", "salad", "soup"}:
        return "healthy_routine"
    if heavy == "heavy" and (weekend or slot == "dinner"):
        return "comfort_reset"
    if slot == "lunch" and not weekend:
        return "work_lunch"
    return "solo_weeknight" if slot == "dinner" and not weekend else "treat" if weekend else "solo_weeknight"


def labels(user_id: str) -> dict[str, dict]:
    return store.get_usage(user_id, KEY, {}) or {}


async def annotate(user_id: str) -> dict[str, dict]:
    """Label every order that has no occasion yet; returns all labels by order id."""
    from app.decisions import jev

    orders = brain_orders.load(user_id)
    done = labels(user_id)
    pending = [o for o in orders if o["order_id"] not in done]
    if not pending:
        return done
    totals = [float(o["total"]) for o in orders if o.get("total")]
    usual = median(totals) if totals else None
    client = jev.get_client()
    for start in range(0, len(pending), JEV_BATCH):
        batch = pending[start: start + JEV_BATCH]
        decision = None
        if client is not None:
            state = {f"o{i + 1}": describe(o, usual) for i, o in enumerate(batch)}
            questions = {f"o{i + 1}": jev.shuffled_choice(f"Which occasion best explains order `o{i + 1}`?", OCCASIONS, seed=o["order_id"])
                         for i, o in enumerate(batch)}
            decision = await client.decide("occasion", state, questions)
        for i, o in enumerate(batch):
            ans = decision.choices.get(f"o{i + 1}") if decision is not None else None
            if ans and ans[2] >= MIN_CONFIDENCE and ans[0] in OCCASIONS:
                done[o["order_id"]] = {"label": ans[0], "confidence": round(ans[2], 3), "method": "jev"}
            else:
                done[o["order_id"]] = {"label": rules(o, usual), "confidence": 0.4, "method": "rules"}
    store.set_usage(user_id, KEY, done)
    trace.emit("brain.occasions", labelled=len(pending), jev_available=client is not None,
               orders=[{"order_id": o["order_id"], "when": o.get("ordered_at"), **describe(o, usual), **done[o["order_id"]]} for o in pending])
    return done
