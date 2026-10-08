"""Per-user food order record (evidence for the brain), folded from ``order`` signals.

Swiggy history arrives one signal per item (payload carries the order's own
time and the item profile); orders placed through the app carry a dish id and
are timed by the signal context. Items are grouped back into orders.
Kept in ``usage_stats`` so a replay from scratch rebuilds it.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from typing import Optional

from app.history.normalise import IST, _WEEKDAYS, meal_slot
from app.learning import store

KEY = "food_orders"
KEPT = 1000


def _app_profile(dish_id: Optional[str], name: str) -> Optional[dict]:
    from app.history.profile import _from_catalog_or_rules

    return asdict(_from_catalog_or_rules(name, None, dish_id)) if dish_id else None


def record(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    history = payload.get("source") == "swiggy_history"
    order_id = str(payload.get("swiggy_order_id") or payload.get("order_id") or f"app:{signal_id or context.get('server_ts')}")
    when_iso = payload.get("ordered_at") if history else context.get("server_ts")
    when = None
    if when_iso:
        try:
            when = datetime.fromisoformat(str(when_iso).replace("Z", "+00:00")).astimezone(IST)
        except ValueError:
            when = None
    name = str(payload.get("item_name") or payload.get("dish_name") or payload.get("dish_id") or "")
    if not name:
        return
    orders = store.get_usage(user_id, KEY, {}) or {}
    o = orders.setdefault(order_id, {
        "order_id": order_id, "source": "swiggy" if history else "app",
        "ordered_at": when.isoformat() if when else None,
        "meal_slot": payload.get("meal_slot") or (meal_slot(when.hour) if when else context.get("time_of_day")),
        "weekday": payload.get("weekday") or (_WEEKDAYS[when.weekday()] if when else context.get("day_of_week")),
        "restaurant": payload.get("restaurant_name"), "total": payload.get("order_total"), "items": [],
    })
    if any(i["name"] == name for i in o["items"]):
        return  # replayed signal
    o["items"].append({
        "name": name, "dish_id": payload.get("dish_id"), "quantity": payload.get("quantity") or 1,
        "price": payload.get("price"), "veg": payload.get("veg"),
        "profile": payload.get("profile") or _app_profile(payload.get("dish_id"), name),
    })
    if len(orders) > KEPT:
        keep = sorted(orders.values(), key=lambda x: x.get("ordered_at") or "", reverse=True)[:KEPT]
        orders = {x["order_id"]: x for x in keep}
    store.set_usage(user_id, KEY, orders)


def load(user_id: str) -> list[dict]:
    """Orders oldest first."""
    return sorted((store.get_usage(user_id, KEY, {}) or {}).values(), key=lambda x: x.get("ordered_at") or "")
