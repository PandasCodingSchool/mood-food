"""The brain as a recommendation score part: how well a dish fits what this user picks *in this context*.

points = BRAIN_MAX · confidence · (0.45·cuisine + 0.35·protein + 0.20·spice) + favourite bonus
where cuisine / protein are the predicted probabilities for the context, scaled so the
user's top value = 1, spice is closeness to their expected spice, and confidence grows
with (time-decayed) evidence. No orders → no part.
"""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import Optional

from app.brain import facts as brain_facts
from app.brain import orders as brain_orders
from app.brain.relations import ALPHA, Relations
from app.data.dishes import DishRecord
from app.history.normalise import IST
from app.history.profile import CATALOG_CUISINE
from app.schemas.request import UserContext

BRAIN_MAX = 8.0
FAVOURITE_BONUS = 2.0
SPICE_VALUE = {"mild": 0.17, "medium": 0.5, "hot": 0.85}
# Catalog protein -> item-profile protein vocabulary.
PROTEIN = {"prawn": "seafood", "beef": "beef_buff", "tofu": "tofu_soy", "cheese": "paneer", "duck": "chicken",
           "pork": "pork", "none": "none", "veg": "veg", "seafood": "seafood"}


@lru_cache(maxsize=256)
def _model(user_id: str, fingerprint: tuple) -> tuple[Relations, dict]:
    orders = brain_orders.load(user_id)
    return Relations(orders), brain_facts.compute(orders)


def model(user_id: Optional[str]) -> Optional[tuple[Relations, dict]]:
    if not user_id:
        return None
    orders = brain_orders.load(user_id)
    if not orders:
        return None
    fingerprint = (len(orders), orders[-1].get("ordered_at"), sum(len(o.get("items") or []) for o in orders),
                   datetime.now(IST).date().isoformat())  # decay moves daily
    return _model(user_id, fingerprint)


def context_of(ctx: UserContext) -> tuple[Optional[str], Optional[str]]:
    sit = ctx.situational
    slot = sit.time_of_day if sit else None
    day = (sit.day_of_week if sit and sit.day_of_week else datetime.now(IST).strftime("%A")).lower()
    return slot, "weekend" if day in ("saturday", "sunday") else "weekday"


def dish_scores(user_id: Optional[str], ctx: UserContext, dishes: list[DishRecord]) -> dict[str, float]:
    m = model(user_id)
    if m is None:
        return {}
    rel, facts = m
    slot, daytype = context_of(ctx)
    pred = rel.predict(slot, daytype)
    dist = pred["distributions"]
    conf = rel.n / (rel.n + ALPHA)
    cuisine_by_catalog: dict[str, float] = {}
    for c, p in dist.get("cuisine", {}).items():
        cat = CATALOG_CUISINE.get(c)
        if cat:
            cuisine_by_catalog[cat] = cuisine_by_catalog.get(cat, 0.0) + p
    top_c = max(cuisine_by_catalog.values(), default=0.0) or 1.0
    proteins = dist.get("protein", {})
    top_p = max(proteins.values(), default=0.0) or 1.0
    spice_expect = sum(SPICE_VALUE[b] * p for b, p in dist.get("spice", {}).items() if b in SPICE_VALUE) if dist.get("spice") else None
    favourites = {f["dish_id"] for f in facts.get("favourites", []) if f.get("dish_id") and f["orders"] >= 2}
    out = {}
    for d in dishes:
        c = cuisine_by_catalog.get(d.cuisine, 0.0) / top_c
        p = proteins.get(PROTEIN.get(d.protein or "", d.protein or ""), 0.0) / top_p
        s = 1 - abs((d.sensory or {}).get("spicy", 0.5) - spice_expect) if spice_expect is not None else 0.5
        pts = BRAIN_MAX * conf * (0.45 * c + 0.35 * p + 0.20 * s) + (FAVOURITE_BONUS * conf if d.id in favourites else 0.0)
        out[d.id] = round(pts, 3)
    return out
