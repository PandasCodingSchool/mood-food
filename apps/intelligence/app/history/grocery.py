"""Instamart (grocery) history: a separate stream from food delivery.

Reads (Instamart MCP server, read-only; verified against the live schema, Oct 2026):
- ``get_orders`` — ``count`` (default 10, ~20 max), ``orderType`` ("DASH" default,
  or "INSTAMART"), ``activeOnly``. Per order: ``orderId``, ``createdAt``,
  ``itemCount``, ``totalAmount``, ``orderType``, ``storeName``, ``items``
  [{``name``, ``quantity``, ``itemId``}], plus delivery address and payment
  fields that are never kept.
- ``your_go_to_items`` — ``addressId``, ``offset`` paging (``nextOffset``):
  Swiggy's frequently/recently bought products with ``displayName``, ``brand``
  and ``variations`` [{``quantityDescription``, ``price``, ``vegClassifier``,
  ``imageUrl``, ...}].
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.history.normalise import IST, _WEEKDAYS, _money, meal_slot
from app.lab import trace

logger = logging.getLogger("history")
ORDER_COUNT = 20
ORDER_TYPES = ("INSTAMART", "DASH")
GO_TO_MAX_PAGES = 10


@dataclass
class GroceryItem:
    name: str
    quantity: float = 1
    brand: Optional[str] = None
    pack: Optional[str] = None          # e.g. "500 g", "1 L"
    price: Optional[float] = None
    veg: Optional[str] = None           # veg | non_veg | egg (Swiggy's vegClassifier)
    image_url: Optional[str] = None
    product_id: Optional[str] = None
    profile: Optional[dict] = None      # history.grocery_profile.GroceryProfile as a dict


@dataclass
class GroceryOrder:
    order_id: str
    ordered_at: Optional[str]
    meal_slot: Optional[str]
    weekday: Optional[str]
    is_weekend: Optional[bool]
    order_type: Optional[str]
    store_name: Optional[str]
    status: Optional[str]
    total: Optional[float]
    items: list[GroceryItem] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        out = asdict(self)
        out["item_count"] = sum(i.quantity for i in self.items)
        return out


def _when(value: Any) -> Optional[datetime]:
    """ISO 8601 string or epoch (s/ms) -> IST datetime."""
    if value in (None, ""):
        return None
    try:
        if isinstance(value, (int, float)) or str(value).isdigit():
            v = float(value)
            return datetime.fromtimestamp(v / 1000 if v > 1e11 else v, tz=timezone.utc).astimezone(IST)
        t = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return (t if t.tzinfo else t.replace(tzinfo=IST)).astimezone(IST)
    except (ValueError, OSError):
        return None


def _veg(classifier: Any) -> Optional[str]:
    c = str(classifier or "").lower().replace("-", "").replace("_", "")
    return {"veg": "veg", "nonveg": "non_veg", "egg": "egg"}.get(c)


def normalise_order(row: dict) -> GroceryOrder:
    when = _when(row.get("createdAt"))
    items = []
    for it in row.get("items") or []:
        if not isinstance(it, dict) or not it.get("name"):
            continue
        q = it.get("quantity")
        items.append(GroceryItem(name=str(it["name"]).strip(), quantity=float(q) if isinstance(q, (int, float)) else 1,
                                 product_id=str(it["itemId"]) if it.get("itemId") else None))
    return GroceryOrder(
        order_id=str(row.get("orderId")), ordered_at=when.isoformat() if when else None,
        meal_slot=meal_slot(when.hour) if when else None, weekday=_WEEKDAYS[when.weekday()] if when else None,
        is_weekend=when.weekday() >= 5 if when else None, order_type=row.get("orderType"),
        store_name=row.get("storeName"), status=row.get("status") or row.get("currentStatus"),
        total=_money(row.get("totalAmount")), items=items,
    )


def _price(p: Any) -> Optional[float]:
    if isinstance(p, dict):
        for k in ("offerPrice", "finalPrice", "sellingPrice", "price", "mrp", "value"):
            v = p.get(k)
            if isinstance(v, dict):
                v = v.get("units") or v.get("value")
            m = _money(v)
            if m is not None:
                return m
        return None
    return _money(p)


def normalise_go_to(product: dict) -> Optional[GroceryItem]:
    var = (product.get("variations") or [{}])[0] or {}
    name = var.get("displayName") or product.get("displayName")
    if not name:
        return None
    return GroceryItem(name=str(name).strip(), brand=var.get("brandName") or product.get("brand"),
                       pack=var.get("quantityDescription"), price=_price(var.get("price")), veg=_veg(var.get("vegClassifier")),
                       image_url=var.get("imageUrl") if str(var.get("imageUrl") or "").startswith("http") else None,
                       product_id=str(product.get("productId")) if product.get("productId") else None)


@dataclass
class GroceryImport:
    orders: list[GroceryOrder] = field(default_factory=list)    # new orders only
    go_to: list[GroceryItem] = field(default_factory=list)      # Swiggy's frequently bought list, in its order
    returned: int = 0
    already_known: int = 0

    def stats(self) -> dict:
        dated = sorted(o.ordered_at for o in self.orders if o.ordered_at)
        return {"orders_returned": self.returned, "new_orders": len(self.orders), "already_known": self.already_known,
                "order_items": sum(len(o.items) for o in self.orders), "go_to_items": len(self.go_to),
                "oldest": dated[0] if dated else None, "newest": dated[-1] if dated else None}


async def import_groceries(client, known_ids: frozenset[str] = frozenset(), profile: bool = True) -> GroceryImport:
    from app.services.swiggy_discovery import _as_list

    result = GroceryImport()
    async with client.session():
        seen: dict[str, dict] = {}
        for order_type in ORDER_TYPES:
            raw = await client.call_tool("get_orders", {"count": ORDER_COUNT, "orderType": order_type})
            for r in _as_list(raw, "orders", "data"):
                seen.setdefault(str(r.get("orderId")), r)
        result.returned = len(seen)
        fresh = [r for oid, r in seen.items() if oid not in known_ids]
        result.already_known = len(seen) - len(fresh)
        result.orders = [normalise_order(r) for r in fresh]

        addresses = _as_list(await client.call_tool("get_addresses", {}), "addresses", "data")
        for a in addresses:  # go-to items are per address; the first with any is the household's list
            offset, items, ids = 0, [], set()
            for _ in range(GO_TO_MAX_PAGES):
                page = await client.call_tool("your_go_to_items", {"addressId": str(a.get("id")), "offset": offset})
                new = [i for i in (normalise_go_to(p) for p in _as_list(page, "products"))
                       if i and (i.product_id or i.name) not in ids]
                ids.update(i.product_id or i.name for i in new)
                items += new
                nxt = page.get("nextOffset") if isinstance(page, dict) else None
                if not new or not nxt or nxt == offset:  # the server may repeat the last page
                    break
                offset = nxt
            if items:
                result.go_to = items
                break

    if profile:
        from app.history.grocery_profile import profile_groceries

        profiles = await profile_groceries([(i.name, i.brand, i.veg) for o in result.orders for i in o.items] +
                                           [(i.name, i.brand, i.veg) for i in result.go_to])
        for i in [*(x for o in result.orders for x in o.items), *result.go_to]:
            if i.name in profiles:
                i.profile = asdict(profiles[i.name])

    trace.emit("grocery.import", **result.stats())
    return result
