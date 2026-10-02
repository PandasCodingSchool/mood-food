"""Swiggy Instamart (grocery) routes — powers the DIY ingredient cart/checkout.

Same auth model as routes/swiggy.py: the Node proxy forwards the linked
user's token via the x-swiggy-user-token header.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from app.schemas.instamart import (
    InstamartCartResponse,
    InstamartCheckoutRequest,
    InstamartCheckoutResponse,
    MatchIngredientsRequest,
    MatchIngredientsResponse,
    PaymentOptionsResponse,
    PaymentStatusResponse,
    SearchProductsResponse,
    TrackInstamartOrderResponse,
    UpdateInstamartCartRequest,
)
from app.services.instamart_discovery import InstamartDiscoveryService
from app.services.instamart_order import InstamartOrderService
from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPError

logger = logging.getLogger("instamart_routes")
router = APIRouter(prefix="/api/instamart", tags=["instamart"])


def _discovery(request: Request) -> InstamartDiscoveryService:
    return InstamartDiscoveryService(token=request.headers.get("x-swiggy-user-token"))


def _order(request: Request) -> InstamartOrderService:
    return InstamartOrderService(token=request.headers.get("x-swiggy-user-token"))


@router.get("/search-products", response_model=SearchProductsResponse)
async def search_products(request: Request, query: str, address_id: str) -> SearchProductsResponse:
    """Raw product search — powers manual "+" add-to-cart (typed search, not recipe matching)."""
    try:
        products = await _discovery(request).search_products(query, address_id)
        return SearchProductsResponse(success=True, products=products)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("search_products failed: %s", exc)
        return SearchProductsResponse(success=False, error=str(exc))


@router.post("/match-ingredients", response_model=MatchIngredientsResponse)
async def match_ingredients(req: MatchIngredientsRequest, request: Request) -> MatchIngredientsResponse:
    try:
        matches = await _discovery(request).match_ingredients(req.items, req.address_id)
        return MatchIngredientsResponse(success=True, address_id=req.address_id, matches=matches)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("match_ingredients failed: %s", exc)
        return MatchIngredientsResponse(success=False, error=str(exc))


@router.get("/cart", response_model=InstamartCartResponse)
async def get_cart(request: Request, address_id: str) -> InstamartCartResponse:
    try:
        return await _order(request).get_cart(address_id)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("instamart get_cart failed: %s", exc)
        return InstamartCartResponse(success=False, error=str(exc))


@router.post("/cart", response_model=InstamartCartResponse)
async def update_cart(req: UpdateInstamartCartRequest, request: Request) -> InstamartCartResponse:
    try:
        return await _order(request).update_cart(req.address_id, req.items)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("instamart update_cart failed: %s", exc)
        return InstamartCartResponse(success=False, error=str(exc))


@router.delete("/cart")
async def clear_cart(request: Request) -> dict:
    try:
        await _order(request).clear_cart()
        return {"success": True}
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("instamart clear_cart failed: %s", exc)
        return {"success": False, "error": str(exc)}


@router.get("/payment-options", response_model=PaymentOptionsResponse)
async def payment_options(request: Request, address_id: str) -> PaymentOptionsResponse:
    try:
        return await _order(request).get_payment_options(address_id)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("instamart payment_options failed: %s", exc)
        return PaymentOptionsResponse(success=False, error=str(exc))


@router.get("/payment-status", response_model=PaymentStatusResponse)
async def payment_status(request: Request, paas_id: str, order_id: str) -> PaymentStatusResponse:
    try:
        return await _order(request).check_payment_status(paas_id, order_id)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("instamart payment_status failed: %s", exc)
        return PaymentStatusResponse(success=False, error=str(exc))


@router.post("/checkout", response_model=InstamartCheckoutResponse)
async def checkout(req: InstamartCheckoutRequest, request: Request) -> InstamartCheckoutResponse:
    try:
        return await _order(request).checkout(
            req.address_id, req.payment_method, req.intent_app, req.generate_upi_qr, req.confirmed
        )
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("instamart checkout failed: %s", exc)
        return InstamartCheckoutResponse(success=False, error=str(exc))


@router.get("/track", response_model=TrackInstamartOrderResponse)
async def track_all(request: Request) -> TrackInstamartOrderResponse:
    try:
        return await _order(request).track_order()
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("instamart track_order failed: %s", exc)
        return TrackInstamartOrderResponse(success=False, error=str(exc))


@router.get("/track/{order_id}", response_model=TrackInstamartOrderResponse)
async def track_one(request: Request, order_id: str) -> TrackInstamartOrderResponse:
    try:
        return await _order(request).track_order(order_id)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("instamart track_order failed: %s", exc)
        return TrackInstamartOrderResponse(success=False, error=str(exc))
