"""Swiggy discovery routes (Phase 1).

Exposes real Swiggy restaurant/menu data so MoodFood recommendations can be
enriched with live price/rating/ETA. All calls run against the Phase-1 service
(bootstrap) token; per-user ordering is Phase 2.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from app.schemas.swiggy import (
    AddressesResponse,
    EnrichRequest,
    EnrichResponse,
    MenuSearchRequest,
    MenuSearchResponse,
    RestaurantSearchRequest,
    RestaurantSearchResponse,
)
from app.services.swiggy_discovery import SwiggyDiscoveryService
from app.services.swiggy_mcp import (
    SwiggyAddressRequiredError,
    SwiggyAuthError,
    SwiggyMCPClient,
    SwiggyMCPError,
)

logger = logging.getLogger("swiggy_routes")
router = APIRouter(prefix="/api/swiggy", tags=["swiggy"])


def _service(request: Request) -> SwiggyDiscoveryService:
    user_token = request.headers.get("x-swiggy-user-token")
    return SwiggyDiscoveryService(token=user_token)


@router.get("/status")
async def status() -> dict:
    """Whether the Swiggy integration is configured + token expiry diagnostics."""
    from app.services.swiggy_token import token_status

    client = SwiggyMCPClient()
    return {"configured": client.is_configured, "mode": "discovery", "token": token_status()}


@router.get("/addresses", response_model=AddressesResponse)
async def addresses(request: Request) -> AddressesResponse:
    """Saved delivery addresses for the connected account (drives the picker)."""
    try:
        return AddressesResponse(success=True, addresses=await _service(request).list_addresses())
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("addresses failed: %s", exc)
        return AddressesResponse(success=False, error=str(exc))


@router.post("/restaurants", response_model=RestaurantSearchResponse)
async def restaurants(req: RestaurantSearchRequest, request: Request) -> RestaurantSearchResponse:
    try:
        addr, results = await _service(request).search_restaurants(
            req.query, city=req.city, address_id=req.address_id
        )
        return RestaurantSearchResponse(success=True, address_id=addr, restaurants=results)
    except SwiggyAddressRequiredError as exc:
        logger.info("restaurants search: address required: %s", exc)
        return RestaurantSearchResponse(success=False, error=str(exc), address_required=True)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("restaurants search failed: %s", exc)
        return RestaurantSearchResponse(success=False, error=str(exc))


@router.post("/menu-search", response_model=MenuSearchResponse)
async def menu_search(req: MenuSearchRequest, request: Request) -> MenuSearchResponse:
    try:
        addr, items = await _service(request).search_menu(
            req.query, city=req.city, address_id=req.address_id
        )
        return MenuSearchResponse(success=True, address_id=addr, items=items)
    except SwiggyAddressRequiredError as exc:
        logger.info("menu search: address required: %s", exc)
        return MenuSearchResponse(success=False, error=str(exc), address_required=True)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("menu search failed: %s", exc)
        return MenuSearchResponse(success=False, error=str(exc))


@router.get("/restaurant/{restaurant_id}/menu")
async def restaurant_menu(
    request: Request,
    restaurant_id: str,
    city: str | None = None,
    address_id: str | None = None,
    page: int = 1,
) -> dict:
    try:
        data = await _service(request).get_restaurant_menu(
            restaurant_id, city=city, address_id=address_id, page=page
        )
        return {"success": True, "menu": data}
    except SwiggyAddressRequiredError as exc:
        logger.info("restaurant menu: address required: %s", exc)
        return {"success": False, "error": str(exc), "address_required": True}
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("restaurant menu failed: %s", exc)
        return {"success": False, "error": str(exc)}


@router.post("/enrich", response_model=EnrichResponse)
async def enrich(req: EnrichRequest, request: Request) -> EnrichResponse:
    """Match each recommended dish to a real Swiggy item (price/rating/ETA)."""
    try:
        addr, matches = await _service(request).enrich(
            req.dishes, city=req.city, address_id=req.address_id
        )
        return EnrichResponse(success=True, address_id=addr, matches=matches)
    except SwiggyAddressRequiredError as exc:
        logger.info("enrich: address required: %s", exc)
        return EnrichResponse(success=False, error=str(exc), address_required=True)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("enrich failed: %s", exc)
        return EnrichResponse(success=False, error=str(exc))
