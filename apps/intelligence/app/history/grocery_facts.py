"""Grocery facts: what a household buys, how it cooks, and what's probably in the kitchen.

Pure functions over normalised orders and go-to items (dicts as produced by
``GroceryOrder.to_dict`` / ``asdict(GroceryItem)``), so they work on one import
or on everything accumulated. Every fact has a stable id for grounded copy.
"""

from __future__ import annotations

import itertools
import re
from collections import Counter, defaultdict
from datetime import datetime
from statistics import median
from typing import Any, Optional

from app.history.normalise import IST

# Days an item of each category typically lasts once bought (likely-pantry estimate).
SHELF_DAYS = {"fresh_produce": 5, "dairy": 4, "proteins": 2, "bakery": 3, "staples": 45, "spices_condiments": 90,
              "breakfast": 30, "snacks": 14, "beverages": 30, "ready_to_eat": 30, "frozen": 30, "sweets_desserts": 7}
ROLE_WEIGHT = {"scratch_ingredient": 1.0, "quick_cook": 0.5, "ready_to_eat": 0.0, "snack_drink": 0.0}
MIN_COOKING_EVIDENCE = 5.0   # weighted food units before the cooking index is reported
HOUSEHOLD = {"dog": r"\b(dog|pedigree|drools|puppy)\b", "cat": r"\b(cat food|whiskas|kitten|cat litter)\b",
             "baby": r"\b(diaper|baby|infant|cerelac|pampers)\b"}


def _key(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip().lower())


def _profile(item: dict) -> dict:
    return item.get("profile") or {}


def _is_food(item: dict) -> bool:
    return _profile(item).get("category", "snacks") != "non_food"


def compute(orders: list[dict], go_to: list[dict], now: Optional[datetime] = None) -> dict[str, Any]:
    now = now or datetime.now(IST)
    stats: dict[str, dict[str, Any]] = {}
    for o in orders:
        when = datetime.fromisoformat(o["ordered_at"]) if o.get("ordered_at") else None
        for it in o.get("items", []):
            k = _key(it["name"])
            s = stats.setdefault(k, {"name": it["name"], "purchases": 0, "units": 0.0, "dates": [], "profile": _profile(it),
                                     "image_url": it.get("image_url"), "go_to_rank": None})
            s["purchases"] += 1
            s["units"] += float(it.get("quantity") or 1)
            if when:
                s["dates"].append(when)
    for rank, it in enumerate(go_to):
        k = _key(it["name"])
        s = stats.setdefault(k, {"name": it["name"], "purchases": 0, "units": 0.0, "dates": [], "profile": _profile(it),
                                 "image_url": it.get("image_url"), "go_to_rank": None})
        s["go_to_rank"] = rank + 1
        s["profile"] = s["profile"] or _profile(it)
        s["image_url"] = s["image_url"] or it.get("image_url")
    n_go = max(1, len(go_to))

    def score(s: dict) -> float:
        go = 2.0 * (n_go - s["go_to_rank"] + 1) / n_go if s["go_to_rank"] else 0.0
        return 2.0 * s["purchases"] + 0.5 * s["units"] + go

    ranked = sorted(stats.values(), key=score, reverse=True)
    food = [s for s in ranked if s["profile"].get("category", "snacks") != "non_food"]
    top_items = [{"name": s["name"], "purchases": s["purchases"], "units": s["units"], "go_to_rank": s["go_to_rank"],
                  "category": s["profile"].get("category"), "cooking_role": s["profile"].get("cooking_role"),
                  "last_bought": max(s["dates"]).isoformat() if s["dates"] else None, "image_url": s["image_url"],
                  "score": round(score(s), 2)} for s in food[:15]]

    weight = {k: (s["units"] or 0) + (1.0 if s["go_to_rank"] else 0) for k, s in stats.items()}  # go-to items count once
    cat = Counter()
    role_num = role_den = health_num = 0.0
    cuisine, diet = Counter(), Counter()
    for k, s in stats.items():
        w, p = weight[k], s["profile"]
        if not w:
            continue
        cat[p.get("category", "unknown")] += w
        if p.get("category") == "non_food":
            continue
        role = p.get("cooking_role", "snack_drink")
        if role in ROLE_WEIGHT:
            role_num += w * ROLE_WEIGHT[role]
            role_den += w if role != "snack_drink" else 0.25 * w  # snacks dilute the index only a little
        health_num += w * float(p.get("healthiness", 0.5))
        cuisine[p.get("cuisine_hint", "neutral")] += w
        if p.get("veg"):
            diet[p["veg"]] += w
    food_w = sum(w for k, w in weight.items() if stats[k]["profile"].get("category") != "non_food") or 0.0
    cooking_index = round(role_num / role_den, 3) if role_den and food_w >= MIN_COOKING_EVIDENCE else None
    cooking_label = (None if cooking_index is None else "cooks from scratch often" if cooking_index >= 0.55
                     else "mixes cooking with convenience" if cooking_index >= 0.3 else "mostly convenience")

    cadence = []
    for s in ranked:
        d = sorted(s["dates"])
        if len(d) >= 2:
            gaps = [(b - a).days for a, b in zip(d, d[1:]) if (b - a).days > 0]
            if gaps:
                every = median(gaps)
                since = (now - d[-1]).days
                cadence.append({"name": s["name"], "every_days": every, "days_since": since, "restock_due": since >= every})

    pairs = Counter()
    for o in orders:
        names = sorted({_key(i["name"]) for i in o.get("items", []) if _is_food(i)})
        pairs.update(itertools.combinations(names, 2))
    min_pair = 2 if len(orders) >= 6 else 1
    co_purchase = [{"a": stats[a]["name"], "b": stats[b]["name"], "orders": c} for (a, b), c in pairs.most_common(20) if c >= min_pair]

    pantry = []
    for s in ranked:
        cat_name = s["profile"].get("category")
        if cat_name in SHELF_DAYS and s["dates"]:
            age = (now - max(s["dates"])).days
            if age <= SHELF_DAYS[cat_name]:
                pantry.append({"name": s["name"], "category": cat_name, "bought_days_ago": age,
                               "likely_left": round(1 - age / SHELF_DAYS[cat_name], 2)})

    household = sorted({h for h, pat in HOUSEHOLD.items() for s in stats.values() if re.search(pat, s["name"].lower())})
    slots = Counter(o.get("meal_slot") for o in orders if o.get("meal_slot"))
    days = Counter(o.get("weekday") for o in orders if o.get("weekday"))
    facts = []
    if top_items:
        facts.append({"id": "grocery.top_item", "text": f"Most-bought: {top_items[0]['name']}", "value": top_items[0]["name"]})
    if cooking_index is not None:
        facts.append({"id": "grocery.cooking_index", "text": f"Kitchen: {cooking_label}", "value": cooking_index})
    if food_w:
        top_cat = max((c for c in cat if c not in ("non_food", "unknown")), key=cat.get, default=None)
        if top_cat:
            facts.append({"id": "grocery.top_category", "text": f"Biggest basket share: {top_cat.replace('_', ' ')}",
                          "value": round(cat[top_cat] / food_w, 3)})
    if diet:
        lead = max(diet, key=diet.get)
        facts.append({"id": "grocery.diet", "text": f"Mostly {lead.replace('_', '-')} groceries", "value": round(diet[lead] / sum(diet.values()), 3)})
    for h in household:
        facts.append({"id": f"grocery.household.{h}", "text": {"dog": "Has a dog", "cat": "Has a cat", "baby": "Shops for a baby"}[h], "value": True})
    if slots:
        s0 = max(slots, key=slots.get)
        facts.append({"id": "grocery.when", "text": f"Usually shops at {s0.replace('_', ' ')}", "value": s0})

    return {
        "orders": len(orders), "items_tracked": len(stats), "top_items": top_items,
        "category_mix": {k: round(v / sum(cat.values()), 3) for k, v in cat.most_common()} if cat else {},
        "cooking_index": cooking_index, "cooking_label": cooking_label,
        "healthiness": round(health_num / food_w, 3) if food_w else None,
        "cuisine_mix": {k: round(v / sum(cuisine.values()), 3) for k, v in cuisine.most_common()} if cuisine else {},
        "diet_mix": {k: round(v / sum(diet.values()), 3) for k, v in diet.most_common()} if diet else {},
        "restock": sorted(cadence, key=lambda c: (not c["restock_due"], c["every_days"]))[:15],
        "co_purchase": co_purchase, "likely_pantry": pantry[:20],
        "when": {"meal_slot": dict(slots), "weekday": dict(days)}, "household": household,
        "evidence": {"food_units": round(food_w, 1), "cooking_index_needs": MIN_COOKING_EVIDENCE},
        "facts": facts,
    }
