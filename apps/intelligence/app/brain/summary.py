"""Everything the brain knows about a user, in one payload (API, lab, later the app)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from app.brain import facts as brain_facts
from app.brain import orders as brain_orders
from app.brain.relations import Relations
from app.history import grocery_facts
from app.history.normalise import IST, meal_slot
from app.learning import store


def build(user_id: str, slot: Optional[str] = None, daytype: Optional[str] = None) -> dict[str, Any]:
    now = datetime.now(IST)
    slot = slot or meal_slot(now.hour)
    daytype = daytype or ("weekend" if now.weekday() >= 5 else "weekday")
    orders = brain_orders.load(user_id)
    rel = Relations(orders, now)
    groceries = grocery_facts.compute(list((store.get_usage(user_id, "grocery_orders", {}) or {}).values()),
                                      store.get_usage(user_id, "grocery_go_to", []) or [], now)
    food = brain_facts.compute(orders, now)
    return {
        "user_id": user_id,
        "food": food,
        "relations": rel.highlights(),
        "now": {"slot": slot, "daytype": daytype, **rel.predict(slot, daytype)} if orders else None,
        "groceries": groceries,
        "facts": food.get("facts", []) + groceries.get("facts", []),
        "orders": orders[-50:],
    }
