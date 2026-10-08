"""The brain in a few plain lines, for JEV's view of the person (no raw numbers beyond the facts' own)."""

from __future__ import annotations

from typing import Optional

from app.brain import facts as brain_facts
from app.brain import orders as brain_orders
from app.brain.relations import Relations
from app.learning import store

MAX_NOTES = 8


def notes(user_id: Optional[str]) -> list[str]:
    if not user_id:
        return []
    orders = brain_orders.load(user_id)
    out: list[str] = []
    if orders:
        food = brain_facts.compute(orders)
        out += [f["text"] for f in food.get("facts", []) if f["id"] in (
            "food.top_cuisine", "food.usual_slot", "food.favourite", "food.top_protein", "food.exploration", "food.veg_share")]
        out += [h["text"] for h in Relations(orders).highlights(limit=2)]
    house = (store.get_usage(user_id, "house_state", {}) or {}).get("house")
    if house:
        from app.brain.houses import HOUSES

        out.append(f"Food identity: {HOUSES[house]['name']} ({HOUSES[house]['about']})")
    return out[:MAX_NOTES]
