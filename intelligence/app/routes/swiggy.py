"""Swiggy discovery routes (Phase 1).

Exposes real Swiggy restaurant/menu data so MoodFood recommendations can be
enriched with live price/rating/ETA. All calls run against the Phase-1 service
(bootstrap) token; per-user ordering is Phase 2.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.schemas.swiggy import (
    EnrichRequest,
    EnrichResponse,
    MenuSearchRequest,
    MenuSearchResponse,
    RestaurantSearchRequest,
    RestaurantSearchResponse,
)
from app.services.swiggy_discovery import SwiggyDiscoveryService
from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPClient, SwiggyMCPError

logger = logging.getLogger("swiggy_routes")
router = APIRouter(prefix="/api/swiggy", tags=["swiggy"])


def _service() -> SwiggyDiscoveryService:
    return SwiggyDiscoveryService()


@router.get("/status")
async def status() -> dict:
    """Whether the Swiggy integration is configured (a token is present)."""
    client = SwiggyMCPClient()
    return {"configured": client.is_configured, "mode": "discovery"}


@router.post("/restaurants", response_model=RestaurantSearchResponse)
async def restaurants(req: RestaurantSearchRequest) -> RestaurantSearchResponse:
    try:
        addr, results = await _service().search_restaurants(
            req.query, city=req.city, address_id=req.address_id
        )
        return RestaurantSearchResponse(success=True, address_id=addr, restaurants=results)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("restaurants search failed: %s", exc)
        return RestaurantSearchResponse(success=False, error=str(exc))


@router.post("/menu-search", response_model=MenuSearchResponse)
async def menu_search(req: MenuSearchRequest) -> MenuSearchResponse:
    try:
        addr, items = await _service().search_menu(
            req.query, city=req.city, address_id=req.address_id
        )
        return MenuSearchResponse(success=True, address_id=addr, items=items)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("menu search failed: %s", exc)
        return MenuSearchResponse(success=False, error=str(exc))


@router.get("/restaurant/{restaurant_id}/menu")
async def restaurant_menu(
    restaurant_id: str,
    city: str | None = None,
    address_id: str | None = None,
    page: int = 1,
) -> dict:
    try:
        data = await _service().get_restaurant_menu(
            restaurant_id, city=city, address_id=address_id, page=page
        )
        return {"success": True, "menu": data}
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("restaurant menu failed: %s", exc)
        return {"success": False, "error": str(exc)}


@router.post("/enrich", response_model=EnrichResponse)
async def enrich(req: EnrichRequest) -> EnrichResponse:
    """Match each recommended dish to a real Swiggy item (price/rating/ETA)."""
    try:
        addr, matches = await _service().enrich(
            req.dishes, city=req.city, address_id=req.address_id
        )
        return EnrichResponse(success=True, address_id=addr, matches=matches)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("enrich failed: %s", exc)
        return EnrichResponse(success=False, error=str(exc))
