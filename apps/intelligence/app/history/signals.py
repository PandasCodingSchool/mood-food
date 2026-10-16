"""History → signals, mirroring the API's planImport / planGroceryImport payloads.

The API builds these in TypeScript when it stores an import; the lab uses this
to fold an import into a user exactly the same way.
"""

from __future__ import annotations

from typing import Any


def food_signals(orders: list[dict]) -> list[dict[str, Any]]:
    out = []
    for o in orders:
        for idx, it in enumerate(o.get("items") or []):
            out.append({"id": 0, "type": "order", "context": {"source": "swiggy_history"}, "payload": {
                "dish_id": it.get("dish_id"), "dish_name": it.get("dish_name"), "item_name": it["name"],
                "quantity": it.get("quantity") or 1, "price": it.get("price"), "veg": it.get("veg"), "profile": it.get("profile"),
                "map_confidence": it.get("map_confidence") or 0, "source": "swiggy_history", "swiggy_order_id": o["order_id"],
                "restaurant_id": o.get("restaurant_id"), "restaurant_name": o.get("restaurant_name"), "order_total": o.get("total"),
                "ordered_at": o.get("ordered_at"), "meal_slot": o.get("meal_slot"), "weekday": o.get("weekday"),
                "is_weekend": o.get("is_weekend")}})
    return out


def grocery_signals(orders: list[dict], go_to: list[dict]) -> list[dict[str, Any]]:
    out = [{"id": 0, "type": "grocery_order", "context": {"source": "instamart_history"}, "payload": {**o, "source": "instamart_history"}}
           for o in orders]
    if go_to:
        out.append({"id": 0, "type": "grocery_go_to", "context": {"source": "instamart_history"},
                    "payload": {"items": go_to, "source": "instamart_history"}})
    return out
