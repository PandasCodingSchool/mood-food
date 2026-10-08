"""Turn Swiggy order payloads into private, analysable ``HistoryOrder`` records.

Formats (measured live, Oct 2026):
- ``get_food_orders`` rows: ``orderId``, ``restaurantId``, ``restaurantName``,
  ``restaurantAreaName``, ``orderTotal``, ``orderStatus``, ``orderType``,
  ``orderedItems`` ("Name (Variant) (1), Other (2)") and ``orderedTime``
  ("July 22, 3:45 PM" — no year).
- ``get_food_order_details`` is a text block: an "Order <id> — <restaurant>
  (<area>)" header, "<status> | <type>", "Placed: YYYY-MM-DD HH:MM:SS" (IST),
  "Items (n):" with "- <name> — ₹<price> | Veg|Non-Veg [Image: <url>]" lines,
  then delivery address, total paid and payment lines.

Never kept: delivery address, phone, coordinates, payment method.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

IST = timezone(timedelta(hours=5, minutes=30))
_WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


@dataclass
class HistoryItem:
    name: str
    quantity: int = 1
    price: Optional[float] = None
    veg: Optional[bool] = None
    image_url: Optional[str] = None
    dish_id: Optional[str] = None
    dish_name: Optional[str] = None
    map_confidence: float = 0.0
    map_method: Optional[str] = None
    profile: Optional[dict] = None     # history.profile.ItemProfile as a dict (cuisine, protein, form, spice, heaviness)


@dataclass
class HistoryOrder:
    order_id: str
    ordered_at: Optional[str]          # ISO 8601 in IST
    meal_slot: Optional[str]           # breakfast | lunch | dinner | late_night (same buckets as the API)
    weekday: Optional[str]
    is_weekend: Optional[bool]
    restaurant_id: Optional[str]
    restaurant_name: Optional[str]
    restaurant_area: Optional[str]     # the restaurant's locality, not the user's address
    status: Optional[str]
    order_type: Optional[str]
    total: Optional[float]
    items: list[HistoryItem] = field(default_factory=list)

    @property
    def item_count(self) -> int:
        return sum(i.quantity for i in self.items)

    def to_dict(self) -> dict[str, Any]:
        out = asdict(self)
        out["item_count"] = self.item_count
        return out


def meal_slot(hour: int) -> str:
    """Mirror of the API's ``istParts`` buckets."""
    return "late_night" if hour < 5 else "breakfast" if hour < 11 else "lunch" if hour < 16 else "dinner" if hour < 22 else "late_night"


def _money(text: Any) -> Optional[float]:
    m = re.search(r"[\d][\d,]*(?:\.\d+)?", str(text or ""))
    return float(m.group(0).replace(",", "")) if m else None


def _split_items(text: str) -> list[tuple[str, int]]:
    """'A (Serves 1) (1), B (2)' -> [('A (Serves 1)', 1), ('B', 2)] — commas inside brackets kept."""
    parts, depth, cur = [], 0, ""
    for ch in text or "":
        depth += ch == "("
        depth -= ch == ")"
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    out = []
    for p in (x.strip() for x in parts):
        if not p:
            continue
        m = re.match(r"^(.*?)\s*\((\d+)\)\s*$", p)
        out.append((m.group(1).strip(), int(m.group(2))) if m else (p, 1))
    return out


def _parse_ordered_time(text: Optional[str], now: datetime) -> Optional[datetime]:
    """'July 22, 3:45 PM' (no year) -> the most recent such moment not after now (IST)."""
    if not text:
        return None
    for fmt in ("%B %d, %I:%M %p", "%b %d, %I:%M %p"):
        try:
            t = datetime.strptime(text.strip().replace("Sept ", "Sep "), fmt)
        except ValueError:
            continue
        for year in (now.year, now.year - 1):
            cand = t.replace(year=year, tzinfo=IST)
            if cand <= now + timedelta(days=1):
                return cand
    return None


_ITEM = re.compile(
    r"^\s*-\s+(?P<name>.+?)\s+[—-]\s+₹\s*(?P<price>[\d,]+(?:\.\d+)?)"
    r"(?:\s*\|\s*(?P<veg>Non-Veg|Veg|Egg))?(?:\s*\[Image:\s*(?P<img>[^\]\s]+)\]?)?\s*$",
    re.IGNORECASE,
)
_PLACED = re.compile(r"^\s*Placed:\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)")


def parse_details(text: str) -> dict[str, Any]:
    """Placed time and item lines from the details text; address/payment lines are ignored."""
    placed, items = None, []
    for line in (text or "").splitlines():
        m = _PLACED.match(line)
        if m:
            raw = m.group(1).replace("T", " ")
            placed = datetime.strptime(raw if raw.count(":") == 2 else raw + ":00", "%Y-%m-%d %H:%M:%S").replace(tzinfo=IST)
            continue
        m = _ITEM.match(line)
        if m:
            veg = m.group("veg")
            items.append(HistoryItem(
                name=m.group("name").strip(), price=_money(m.group("price")),
                veg=None if veg is None else veg.lower() in ("veg",),
                image_url=m.group("img") if (m.group("img") or "").startswith("https://") else None,
            ))
    return {"placed": placed, "items": items}


def normalise(summary: dict, details_text: Optional[str] = None, now: Optional[datetime] = None) -> HistoryOrder:
    """One order from its summary row (+ details text when fetched)."""
    now = now or datetime.now(IST)
    details = parse_details(details_text) if details_text else {"placed": None, "items": []}
    when = details["placed"] or _parse_ordered_time(summary.get("orderedTime"), now)
    qty = {name.lower(): q for name, q in _split_items(str(summary.get("orderedItems") or ""))}
    items = details["items"] or [HistoryItem(name=n, quantity=q) for n, q in _split_items(str(summary.get("orderedItems") or ""))]
    for it in items:
        it.quantity = qty.get(it.name.lower(), it.quantity)
    return HistoryOrder(
        order_id=str(summary.get("orderId")),
        ordered_at=when.isoformat() if when else None,
        meal_slot=meal_slot(when.hour) if when else None,
        weekday=_WEEKDAYS[when.weekday()] if when else None,
        is_weekend=when.weekday() >= 5 if when else None,
        restaurant_id=str(summary["restaurantId"]) if summary.get("restaurantId") else None,
        restaurant_name=summary.get("restaurantName"),
        restaurant_area=summary.get("restaurantAreaName"),
        status=summary.get("orderStatus"),
        order_type=summary.get("orderType"),
        total=_money(summary.get("orderTotal")),
        items=items,
    )
