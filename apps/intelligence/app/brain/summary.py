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


async def view(user_id: str, slot: Optional[str] = None, daytype: Optional[str] = None, use_jev: bool = True,
               refresh: bool = False) -> dict[str, Any]:
    """The full brain: label new orders' occasions, recompute the house, write insights, then summarise.

    Cheap when nothing changed: occasions are cached per order, the house's JEV
    judgement per evidence fingerprint and insight cards per facts — only new
    evidence (or ``refresh``) triggers JEV / LLM calls.
    """
    from starlette.concurrency import run_in_threadpool

    from app.brain import houses, insights, occasions

    if use_jev:
        await occasions.annotate(user_id)
    house = await houses.recompute(user_id, use_jev=use_jev, refresh=refresh)
    data = await run_in_threadpool(build, user_id, slot, daytype)
    data["house"] = house
    data["insights"] = await insights.generate(data["facts"], house, data["relations"], user_id=user_id, refresh=refresh)
    return data
