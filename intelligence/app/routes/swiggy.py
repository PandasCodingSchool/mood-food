"""Swiggy discovery + ordering routes.

Discovery (search/menu/enrich) can run against the bootstrap service token;
cart/coupon/order/track require a linked per-user token (forwarded via the
x-swiggy-user-token header by the Node proxy) since they act on a real account.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Request

from app.data.dishes import DISHES_BY_ID
from app.schemas.swiggy import (
    AddressesResponse,
    AlternativeEnrichedMatch,
    ApplyCouponRequest,
    ApplyCouponResponse,
    CartResponse,
    CouponsResponse,
    EnrichAlternativesRequest,
    EnrichAlternativesResponse,
    EnrichDishInput,
    EnrichRequest,
    EnrichResponse,
    MenuCategory,
    MenuChatRequest,
    MenuChatResponse,
    MenuSearchRequest,
    MenuSearchResponse,
    OrderDetailsResponse,
    OrdersResponse,
    PlaceOrderRequest,
    PlaceOrderResponse,
    RestaurantMenuResponse,
    RestaurantSearchRequest,
    RestaurantSearchResponse,
    TrackOrderResponse,
    UpdateCartRequest,
)
from app.services.menu_chat import get_menu_chat_reply
from app.services.swiggy_discovery import SwiggyDiscoveryService
from app.services.swiggy_mcp import (
    SwiggyAddressRequiredError,
    SwiggyAuthError,
    SwiggyMCPClient,
    SwiggyMCPError,
)
from app.services.swiggy_order import SwiggyOrderService

logger = logging.getLogger("swiggy_routes")
router = APIRouter(prefix="/api/swiggy", tags=["swiggy"])


def _service(request: Request) -> SwiggyDiscoveryService:
    user_token = request.headers.get("x-swiggy-user-token")
    return SwiggyDiscoveryService(token=user_token)


def _order_service(request: Request) -> SwiggyOrderService:
    user_token = request.headers.get("x-swiggy-user-token")
    return SwiggyOrderService(token=user_token)


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


@router.get("/restaurant/{restaurant_id}/menu", response_model=RestaurantMenuResponse)
async def restaurant_menu(
    request: Request,
    restaurant_id: str,
    city: str | None = None,
    address_id: str | None = None,
) -> RestaurantMenuResponse:
    """Full category-grouped, normalized menu for browsing (not the raw enrich-only shape)."""
    try:
        addr, restaurant, categories = await _service(request).get_restaurant_menu_structured(
            restaurant_id, city=city, address_id=address_id
        )
        return RestaurantMenuResponse(
            success=True,
            restaurant=restaurant,
            categories=[MenuCategory(**c) for c in categories],
            address_id=addr,
        )
    except SwiggyAddressRequiredError as exc:
        logger.info("restaurant menu: address required: %s", exc)
        return RestaurantMenuResponse(success=False, error=str(exc), address_required=True)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("restaurant menu failed: %s", exc)
        return RestaurantMenuResponse(success=False, error=str(exc))


@router.post("/menu-chat", response_model=MenuChatResponse)
async def menu_chat(req: MenuChatRequest, request: Request) -> MenuChatResponse:
    try:
        _, restaurant, categories = await _service(request).get_restaurant_menu_structured(
            req.restaurant_id, address_id=req.address_id
        )
        restaurant_name = restaurant.name if restaurant else "this restaurant"
        return get_menu_chat_reply(req, restaurant_name, categories)
    except SwiggyAddressRequiredError as exc:
        return MenuChatResponse(success=False, error=str(exc))
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("menu_chat failed: %s", exc)
        return MenuChatResponse(success=False, error=str(exc))


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


@router.post("/enrich-alternatives", response_model=EnrichAlternativesResponse)
async def enrich_alternatives(
    req: EnrichAlternativesRequest, request: Request
) -> EnrichAlternativesResponse:
    """Live-match healthier_swap/budget_swap alternatives on Swiggy.

    Called by the client right after the initial /api/ai-recommendations
    response has already rendered, so this never blocks first paint of the
    original recommendation's live match. Dedupes by dish_id (two recs can
    share the same alternative) into a single enrich() call, then fans the
    result back out to one AlternativeEnrichedMatch per requested item.
    """
    if not req.items:
        return EnrichAlternativesResponse(success=True, matches=[])

    dish_inputs: list[EnrichDishInput] = []
    seen: set[str] = set()
    for it in req.items:
        if it.dish_id in seen:
            continue
        seen.add(it.dish_id)
        dish = DISHES_BY_ID.get(it.dish_id)
        dish_inputs.append(
            EnrichDishInput(
                id=it.dish_id,
                name=it.name,
                cuisine=it.cuisine,
                aliases=list(dish.swiggy_aliases) if dish else [],
                search_category=dish.swiggy_search_category if dish else None,
            )
        )

    try:
        addr, matches = await _service(request).enrich(dish_inputs, address_id=req.address_id)
    except SwiggyAddressRequiredError as exc:
        logger.info("enrich_alternatives: address required: %s", exc)
        return EnrichAlternativesResponse(success=False, error=str(exc), address_required=True)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("enrich_alternatives failed: %s", exc)
        return EnrichAlternativesResponse(success=False, error=str(exc))

    by_dish = {m.dish_id: m for m in matches if m.matched}
    out = [
        AlternativeEnrichedMatch(rec_id=it.rec_id, dish_id=it.dish_id, type=it.type, match=by_dish[it.dish_id])
        for it in req.items
        if it.dish_id in by_dish
    ]
    return EnrichAlternativesResponse(success=True, address_id=addr, matches=out)


# --- Cart / Coupon / Order / Track (Phase 2 — ordering) ---


@router.get("/coupons", response_model=CouponsResponse)
async def coupons(
    request: Request, restaurant_id: str, address_id: str, coupon_code: Optional[str] = None
) -> CouponsResponse:
    try:
        return await _order_service(request).fetch_coupons(restaurant_id, address_id, coupon_code)
    except SwiggyAddressRequiredError as exc:
        return CouponsResponse(success=False, error=str(exc), address_required=True)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("fetch_coupons failed: %s", exc)
        return CouponsResponse(success=False, error=str(exc))


@router.post("/coupons/apply", response_model=ApplyCouponResponse)
async def apply_coupon(req: ApplyCouponRequest, request: Request) -> ApplyCouponResponse:
    try:
        return await _order_service(request).apply_coupon(req.coupon_code, req.address_id)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("apply_coupon failed: %s", exc)
        return ApplyCouponResponse(success=False, error=str(exc))


@router.get("/cart", response_model=CartResponse)
async def get_cart(request: Request, address_id: str, restaurant_name: Optional[str] = None) -> CartResponse:
    try:
        return await _order_service(request).get_cart(address_id, restaurant_name)
    except SwiggyAddressRequiredError as exc:
        return CartResponse(success=False, error=str(exc), address_required=True)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("get_cart failed: %s", exc)
        return CartResponse(success=False, error=str(exc))


@router.post("/cart", response_model=CartResponse)
async def update_cart(req: UpdateCartRequest, request: Request) -> CartResponse:
    try:
        cart_items = [
            {
                "menuItemId": item.menu_item_id,
                "quantity": item.quantity,
                **({"variants": item.variants} if item.variants else {}),
                **({"addons": item.addons} if item.addons else {}),
            }
            for item in req.items
        ]
        return await _order_service(request).update_cart(
            req.restaurant_id, req.address_id, cart_items, req.restaurant_name
        )
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("update_cart failed: %s", exc)
        return CartResponse(success=False, error=str(exc))


@router.delete("/cart")
async def flush_cart(request: Request) -> dict:
    try:
        await _order_service(request).flush_cart()
        return {"success": True}
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("flush_cart failed: %s", exc)
        return {"success": False, "error": str(exc)}


@router.post("/order", response_model=PlaceOrderResponse)
async def place_order(req: PlaceOrderRequest, request: Request) -> PlaceOrderResponse:
    try:
        return await _order_service(request).place_order(
            req.address_id, req.payment_method, req.confirmed
        )
    except SwiggyAddressRequiredError as exc:
        return PlaceOrderResponse(success=False, error=str(exc), address_required=True)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("place_order failed: %s", exc)
        return PlaceOrderResponse(success=False, error=str(exc))


@router.get("/orders", response_model=OrdersResponse)
async def orders(request: Request, address_id: str, order_count: int = 5) -> OrdersResponse:
    try:
        return await _order_service(request).get_orders(address_id, order_count)
    except SwiggyAddressRequiredError as exc:
        return OrdersResponse(success=False, error=str(exc), address_required=True)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("get_orders failed: %s", exc)
        return OrdersResponse(success=False, error=str(exc))


@router.get("/order/{order_id}", response_model=OrderDetailsResponse)
async def order_details(request: Request, order_id: str) -> OrderDetailsResponse:
    try:
        return await _order_service(request).get_order_details(order_id)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("get_order_details failed: %s", exc)
        return OrderDetailsResponse(success=False, error=str(exc))


@router.get("/track", response_model=TrackOrderResponse)
async def track_all(request: Request) -> TrackOrderResponse:
    try:
        return await _order_service(request).track_order()
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("track_order failed: %s", exc)
        return TrackOrderResponse(success=False, error=str(exc))


@router.get("/track/{order_id}", response_model=TrackOrderResponse)
async def track_one(request: Request, order_id: str) -> TrackOrderResponse:
    try:
        return await _order_service(request).track_order(order_id)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("track_order failed: %s", exc)
        return TrackOrderResponse(success=False, error=str(exc))
