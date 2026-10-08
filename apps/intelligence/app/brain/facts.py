"""Brain facts: a user's food habits from their order record (time-decayed, citable)."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime
from statistics import median
from typing import Any, Optional

from app.history.normalise import IST

HALF_LIFE_DAYS = 60.0
MIN_ORDERS_FOR_HABITS = 6   # reorder / exploration claims need at least this many orders
SPICE_BUCKETS = ((0.34, "mild"), (0.67, "medium"), (1.01, "hot"))
HEAVY_BUCKETS = ((0.4, "light"), (0.7, "moderate"), (1.01, "heavy"))


def bucket(value: Optional[float], buckets) -> Optional[str]:
    if value is None:
        return None
    return next(name for edge, name in buckets if float(value) < edge)


def order_weight(order: dict, now: datetime) -> float:
    """Exponential time decay: an order HALF_LIFE_DAYS old counts half."""
    if not order.get("ordered_at"):
        return 0.5
    age = max(0.0, (now - datetime.fromisoformat(order["ordered_at"])).total_seconds() / 86400)
    return 0.5 ** (age / HALF_LIFE_DAYS)


def item_rows(orders: list[dict], now: datetime) -> list[dict]:
    """One row per item with its decayed weight (an order's weight is split across its items)."""
    rows = []
    for o in orders:
        w = order_weight(o, now)
        items = o.get("items") or []
        for it in items:
            p = it.get("profile") or {}
            rows.append({
                "order_id": o["order_id"], "w": w / max(1, len(items)), "slot": o.get("meal_slot"),
                "daytype": None if not o.get("weekday") else ("weekend" if o["weekday"] in ("saturday", "sunday") else "weekday"),
                "name": it["name"], "key": re.sub(r"\s+", " ", re.sub(r"\(.*?\)", "", it["name"].lower())).strip(),
                "dish_id": it.get("dish_id"), "cuisine": p.get("cuisine"), "protein": p.get("protein"), "form": p.get("form"),
                "spice": bucket(p.get("spice"), SPICE_BUCKETS), "heaviness": bucket(p.get("heaviness"), HEAVY_BUCKETS),
                "spice_v": p.get("spice"), "veg": it.get("veg") if it.get("veg") is not None else p.get("veg"),
                "restaurant": o.get("restaurant"), "occasion": o.get("occasion"),
            })
    return rows


def _mix(rows: list[dict], key: str) -> dict[str, float]:
    c: Counter = Counter()
    for r in rows:
        if r.get(key):
            c[r[key]] += r["w"]
    total = sum(c.values())
    return {k: round(v / total, 3) for k, v in c.most_common()} if total else {}


def compute(orders: list[dict], now: Optional[datetime] = None) -> dict[str, Any]:
    now = now or datetime.now(IST)
    orders = sorted(orders, key=lambda o: o.get("ordered_at") or "")
    rows = item_rows(orders, now)
    if not orders:
        return {"orders": 0, "facts": [], "evidence": 0.0}
    weights = {o["order_id"]: order_weight(o, now) for o in orders}
    dated = [datetime.fromisoformat(o["ordered_at"]) for o in orders if o.get("ordered_at")]
    span_weeks = max(1.0, (max(dated) - min(dated)).days / 7) if len(dated) > 1 else 1.0

    seen: set[str] = set()
    first_time = repeat_orders = 0
    occurrences = 0
    for i, o in enumerate(orders):
        keys = {re.sub(r"\s+", " ", re.sub(r"\(.*?\)", "", it["name"].lower())).strip() for it in o.get("items") or []}
        if i:
            repeat_orders += bool(keys & seen)
            first_time += len(keys - seen)
            occurrences += len(keys)
        seen |= keys

    fav: dict[str, dict] = defaultdict(lambda: {"orders": 0, "w": 0.0, "last": None, "dish_id": None, "name": None})
    for r in rows:
        f = fav[r["key"]]
        f["orders"] += 1
        f["w"] += r["w"]
        f["name"] = f["name"] or r["name"]
        f["dish_id"] = f["dish_id"] or r["dish_id"]
    for o in orders:
        for it in o.get("items") or []:
            k = re.sub(r"\s+", " ", re.sub(r"\(.*?\)", "", it["name"].lower())).strip()
            fav[k]["last"] = o.get("ordered_at")
    favourites = sorted(({"key": k, **v} for k, v in fav.items()), key=lambda f: (f["orders"], f["w"]), reverse=True)
    restaurants = Counter(o.get("restaurant") for o in orders if o.get("restaurant"))
    totals = [float(o["total"]) for o in orders if o.get("total")]
    spend = median(totals) if totals else None
    units = [sum(float(i.get("quantity") or 1) for i in o.get("items") or []) for o in orders]
    veg_rows = [r for r in rows if r["veg"] is not None]
    spice_vals = [(r["spice_v"], r["w"]) for r in rows if r["spice_v"] is not None]

    out: dict[str, Any] = {
        "orders": len(orders), "evidence": round(sum(weights.values()), 2), "items": len(rows),
        "first": dated[0].isoformat() if dated else None, "last": dated[-1].isoformat() if dated else None,
        "orders_per_week": round(len(orders) / span_weeks, 2),
        "slot_mix": _mix(rows, "slot"), "daytype_mix": _mix(rows, "daytype"),
        "cuisine_mix": _mix(rows, "cuisine"), "protein_mix": _mix(rows, "protein"), "form_mix": _mix(rows, "form"),
        "spice_mix": _mix(rows, "spice"), "heaviness_mix": _mix(rows, "heaviness"), "occasion_mix": _mix(rows, "occasion"),
        "spice_avg": round(sum(v * w for v, w in spice_vals) / sum(w for _, w in spice_vals), 3) if spice_vals else None,
        "veg_share": round(sum(r["w"] for r in veg_rows if r["veg"] is True) / sum(r["w"] for r in veg_rows), 3) if veg_rows else None,
        "favourites": [{"name": f["name"], "orders": f["orders"], "dish_id": f["dish_id"], "last": f["last"]} for f in favourites[:10]],
        "restaurants": [{"name": n, "orders": c} for n, c in restaurants.most_common(8)],
        "reorder_rate": round(repeat_orders / (len(orders) - 1), 3) if len(orders) > 1 else None,
        "exploration_rate": round(first_time / occurrences, 3) if occurrences else None,
        "median_order_inr": round(spend) if spend else None,
        "spend_band": None if spend is None else "budget" if spend < 250 else "mid" if spend < 500 else "high" if spend < 900 else "premium",
        "units_per_order": round(sum(units) / len(units), 2) if units else None,
    }
    facts = []

    def add(fid: str, text: str, value: Any) -> None:
        facts.append({"id": fid, "text": text, "value": value})

    if out["cuisine_mix"]:
        c, share = next(iter(out["cuisine_mix"].items()))
        add("food.top_cuisine", f"Loves {c.replace('_', ' ')} food ({round(share * 100)}% of orders)", c)
    if out["slot_mix"]:
        s, share = next(iter(out["slot_mix"].items()))
        add("food.usual_slot", f"Orders mostly at {s.replace('_', ' ')} ({round(share * 100)}%)", s)
    if favourites and favourites[0]["orders"] >= 2:
        add("food.favourite", f"Favourite: {favourites[0]['name']} (ordered {favourites[0]['orders']}×)", favourites[0]["name"])
    if out["protein_mix"]:
        pr, share = next(iter(out["protein_mix"].items()))
        add("food.top_protein", f"Usually picks {pr.replace('_', ' ')} ({round(share * 100)}%)", pr)
    if out["exploration_rate"] is not None and len(orders) >= MIN_ORDERS_FOR_HABITS:
        e = out["exploration_rate"]
        add("food.exploration", "Loves trying new dishes" if e >= 0.6 else "Sticks to known favourites" if e <= 0.3 else "Mixes favourites with new dishes", e)
    if out["spend_band"]:
        add("food.spend", f"Typical order ₹{out['median_order_inr']} ({out['spend_band']})", out["median_order_inr"])
    if out["veg_share"] is not None:
        add("food.veg_share", "Mostly vegetarian" if out["veg_share"] >= 0.7 else "Mostly non-vegetarian" if out["veg_share"] <= 0.3 else "Eats veg and non-veg", out["veg_share"])
    out["facts"] = facts
    return out
