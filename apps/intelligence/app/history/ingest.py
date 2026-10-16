"""Fetch a user's recent Swiggy orders and map their items onto the food graph.

``get_food_orders`` returns the most recent orders across *all* addresses
(``addressId`` only resolves coordinates) — up to ``orderCount`` (server schema:
default 5, max 15), with no paging. So history is *accumulated*: callers pass
the order ids they already hold and re-import often; details are fetched only
for orders not seen before (past orders never change).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Optional

from app.history.normalise import HistoryOrder, normalise
from app.lab import trace

logger = logging.getLogger("history")
DETAILS_CONCURRENCY = 3
ORDER_COUNT = 15  # get_food_orders maximum per the live server's input schema (Oct 2026)


@dataclass
class ImportResult:
    orders: list[HistoryOrder] = field(default_factory=list)   # new orders only (not in known_ids)
    returned: int = 0            # orders Swiggy returned
    reported_total: Optional[int] = None
    already_known: int = 0
    details_failed: int = 0

    def stats(self) -> dict:
        items = [i for o in self.orders for i in o.items]
        dated = sorted(o.ordered_at for o in self.orders if o.ordered_at)
        return {
            "returned": self.returned, "reported_total": self.reported_total, "new": len(self.orders),
            "already_known": self.already_known, "details_failed": self.details_failed,
            "items": len(items), "items_mapped": sum(1 for i in items if i.dish_id),
            "oldest": dated[0] if dated else None, "newest": dated[-1] if dated else None,
        }


async def _summaries(client, address_id: Optional[str]) -> tuple[list[dict], Optional[int]]:
    from app.services.swiggy_discovery import _as_list

    if address_id:
        candidates = [address_id]
    else:
        candidates = [str(a.get("id") or a.get("addressId")) for a in _as_list(await client.call_tool("get_addresses", {}), "addresses", "data")]
    for aid in candidates:  # addressId only resolves coordinates: the first address that answers is enough
        raw = await client.call_tool("get_food_orders", {"addressId": aid, "orderCount": ORDER_COUNT})
        rows = _as_list(raw, "orders", "data")
        if rows:
            total = raw.get("total") if isinstance(raw, dict) else None
            return rows, int(total) if isinstance(total, (int, float, str)) and str(total).isdigit() else None
    return [], None


async def import_orders(client, known_ids: frozenset[str] = frozenset(), address_id: Optional[str] = None,
                        map_items: bool = True) -> ImportResult:
    from app.food_graph import mapping

    result = ImportResult()
    async with client.session():
        rows, result.reported_total = await _summaries(client, address_id)
        result.returned = len(rows)
        fresh = [r for r in rows if str(r.get("orderId")) not in known_ids]
        result.already_known = len(rows) - len(fresh)
        sem = asyncio.Semaphore(DETAILS_CONCURRENCY)

        async def one(row: dict) -> HistoryOrder:
            async with sem:
                try:
                    text = await client.call_tool("get_food_order_details", {"orderId": str(row.get("orderId"))})
                except Exception as exc:  # noqa: BLE001 — the summary alone is still useful
                    logger.warning("history: details failed for an order: %s", type(exc).__name__)
                    result.details_failed += 1
                    text = None
            return normalise(row, text if isinstance(text, str) else None)

        result.orders = list(await asyncio.gather(*(one(r) for r in fresh)))

    if map_items and result.orders:
        names = list(dict.fromkeys((i.name, i.veg) for o in result.orders for i in o.items))
        mapped = await mapping.map_items(names)
        for o in result.orders:
            for i in o.items:
                m = mapped.get(i.name)
                if m:
                    i.dish_id, i.map_confidence, i.map_method = m.dish_id, round(m.confidence, 3), m.method
                    d = mapping.dish(m.dish_id)
                    i.dish_name = d.name if d else None

    if map_items and result.orders:
        from dataclasses import asdict

        from app.history.profile import profile_items

        profiles = await profile_items(list(dict.fromkeys((i.name, i.veg, i.dish_id) for o in result.orders for i in o.items)))
        for o in result.orders:
            for i in o.items:
                if i.name in profiles:
                    i.profile = asdict(profiles[i.name])

    trace.emit("history.import", **result.stats(), orders=[{
        "ordered_at": o.ordered_at, "slot": o.meal_slot, "weekday": o.weekday, "restaurant": o.restaurant_name,
        "total": o.total, "items": [{"name": i.name, "qty": i.quantity, "dish": i.dish_name, "method": i.map_method,
                                     "confidence": i.map_confidence, "profile": i.profile} for i in o.items]} for o in result.orders])
    return result
