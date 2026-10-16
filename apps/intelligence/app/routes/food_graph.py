"""Food graph endpoints: map Swiggy items to dishes; read a user's Swiggy history as dishes."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.food_graph import mapping
from app.security import require_sync_key

logger = logging.getLogger("food_graph")
router = APIRouter(prefix="/api/food-graph", tags=["food-graph"])


class ItemIn(BaseModel):
    name: str
    is_veg: Optional[bool] = None


class MapItemsRequest(BaseModel):
    items: list[ItemIn] = Field(default_factory=list, max_length=100)


class MappedItemOut(BaseModel):
    name: str
    dish_id: Optional[str] = None
    dish_name: Optional[str] = None
    confidence: float = 0.0
    method: str


def _out(m: mapping.Mapping) -> MappedItemOut:
    d = mapping.dish(m.dish_id)
    return MappedItemOut(name=m.item_name, dish_id=m.dish_id, dish_name=d.name if d else None, confidence=round(m.confidence, 3), method=m.method)


@router.post("/map-items")
async def map_items(body: MapItemsRequest) -> dict:
    result = await mapping.map_items([(i.name, i.is_veg) for i in body.items])
    return {"success": True, "mappings": [_out(result[i.name]) for i in body.items if i.name in result]}


class HistoryRequest(BaseModel):
    address_id: Optional[str] = None
    limit: int = Field(default=20, ge=1, le=50)


@router.post("/swiggy-history", dependencies=[Depends(require_sync_key)])
async def swiggy_history(body: HistoryRequest, request: Request) -> dict:
    """The linked user's past Swiggy orders, items mapped to catalog dishes (for warm start)."""
    from app.services.swiggy_order import SwiggyOrderService

    token = request.headers.get("x-swiggy-user-token")
    if not token:
        return {"success": False, "error": "x-swiggy-user-token required", "orders": []}
    service = SwiggyOrderService(token=token)
    try:
        async with service.client.session():
            address_id = body.address_id or await service.most_recent_address_id()
            if not address_id:
                return {"success": False, "error": "no saved Swiggy address", "orders": []}
            orders = (await service.get_orders(address_id, body.limit)).orders
    except Exception as exc:  # noqa: BLE001 — import is best-effort
        logger.warning("swiggy-history failed: %s", exc)
        return {"success": False, "error": str(exc), "orders": []}

    names = list(dict.fromkeys(n for o in orders for n in (o.item_names or [line.name for line in o.items])))
    mapped = await mapping.map_items([(n, None) for n in names])
    return {
        "success": True,
        "orders": [
            {
                "order_id": o.order_id,
                "ordered_at": o.ordered_at,
                "restaurant_id": o.restaurant_id,
                "restaurant_name": o.restaurant_name,
                "items": [_out(mapped[n]).model_dump() for n in (o.item_names or [line.name for line in o.items]) if n in mapped],
            }
            for o in orders
        ],
    }
