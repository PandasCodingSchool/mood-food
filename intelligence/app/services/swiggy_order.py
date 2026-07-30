"""Swiggy cart/coupon/order/track logic (Phase 2 — ordering).

Wraps SwiggyMCPClient the same way SwiggyDiscoveryService does: no second
transport, defensive parsing of the loosely-documented {success, data,
message} envelope, and the same resolve_address_id used by discovery.

Ordering-specific rules enforced here (see intelligence/SWIGGY_TOOLS.md):
  - get_food_cart must be called before place_food_order.
  - place_food_order is capped at ORDER_VALUE_CAP_INR by Swiggy's beta; we
    refuse locally before ever calling the tool.
  - place_food_order is non-idempotent: on a retryable failure we verify via
    get_food_orders before considering a second attempt, and the placement
    call itself goes through call_tool_once (no built-in retry loop).
  - fetch_food_coupons results are filtered to COD-eligible coupons.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.schemas.swiggy import (
    ORDER_VALUE_CAP_INR,
    ApplyCouponResponse,
    CartLine,
    CartResponse,
    Coupon,
    CouponsResponse,
    OrderDetailsResponse,
    OrderSummary,
    OrdersResponse,
    PlaceOrderResponse,
    TrackOrderResponse,
)
from app.services.swiggy_discovery import SwiggyDiscoveryService, _as_list, _first, _unwrap_envelope
from app.services.swiggy_mcp import (
    SwiggyAddressRequiredError,
    SwiggyAuthError,
    SwiggyMCPClient,
    SwiggyMCPError,
)

logger = logging.getLogger("swiggy_order")


def _to_float(v: Any) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _normalize_cart_line(raw: dict) -> Optional[CartLine]:
    iid = _first(raw, "id", "itemId", "item_id", "menuItemId")
    name = _first(raw, "name", "itemName", "item_name")
    if iid is None or name is None:
        return None
    return CartLine(
        id=str(iid),
        name=str(name),
        price=_to_float(_first(raw, "price", "finalPrice", "amount")),
        quantity=int(_first(raw, "quantity", "qty", default=1) or 1),
    )


def _normalize_cart(raw: Any) -> CartResponse:
    data = _unwrap_envelope(raw) or {}
    if not isinstance(data, dict):
        data = {}
    lines = [
        line for line in (_normalize_cart_line(r) for r in _as_list(data, "items", "cart"))
        if line is not None
    ]
    # Docs show two shapes for this field across examples: a bool alongside a
    # sibling coupon_discount, or a nested {"coupon_applied": {"coupon_discount": N}}.
    # Handle both defensively.
    offers = data.get("offers") if isinstance(data.get("offers"), dict) else {}
    applied_raw = offers.get("coupon_applied", offers.get("couponApplied"))
    if isinstance(applied_raw, dict):
        coupon_discount = _to_float(_first(applied_raw, "coupon_discount", "couponDiscount"))
        coupon_applied = coupon_discount is not None and coupon_discount > 0
    else:
        coupon_discount = _to_float(_first(offers, "coupon_discount", "couponDiscount"))
        coupon_applied = bool(applied_raw)
    payment_methods = _first(data, "availablePaymentMethods", "available_payment_methods", default=[])
    if not isinstance(payment_methods, list):
        payment_methods = []
    return CartResponse(
        success=True,
        items=lines,
        subtotal=_to_float(_first(data, "subtotal", "sub_total")),
        delivery_charges=_to_float(_first(data, "deliveryCharges", "delivery_charges", "deliveryFee")),
        total=_to_float(_first(data, "total", "grandTotal", "finalTotal")),
        available_payment_methods=[str(p) for p in payment_methods],
        coupon_applied=coupon_applied or (coupon_discount is not None and coupon_discount > 0),
        coupon_discount=coupon_discount,
    )


def _normalize_coupon(raw: dict) -> Optional[Coupon]:
    code = _first(raw, "couponCode", "coupon_code", "code")
    if code is None:
        return None
    return Coupon(
        coupon_code=str(code),
        discount=_first(raw, "discount"),
        description=_first(raw, "description"),
        applicability_status=_first(raw, "applicabilityStatus", "applicability_status"),
        payment_method=_first(raw, "paymentMethod", "payment_method"),
        terms_and_conditions=_first(raw, "termsAndConditions", "terms_and_conditions"),
    )


def _is_cod_eligible(coupon: Coupon) -> bool:
    """Filter per docs guidance: only recommend coupons valid for Cash on Delivery."""
    method = (coupon.payment_method or "").upper()
    if method and method != "COD":
        return False
    terms = (coupon.terms_and_conditions or "").lower()
    if "online payment" in terms or "card only" in terms:
        return False
    return True


def _normalize_order_summary(raw: dict) -> Optional[OrderSummary]:
    oid = _first(raw, "orderId", "order_id", "id")
    if oid is None:
        return None
    restaurant = raw.get("restaurant") if isinstance(raw.get("restaurant"), dict) else {}
    items = [
        line for line in (_normalize_cart_line(r) for r in _as_list(raw, "items"))
        if line is not None
    ]
    return OrderSummary(
        order_id=str(oid),
        status=_first(raw, "status", "orderStatus"),
        restaurant_name=_first(restaurant, "name") if restaurant else None,
        items=items,
    )


class SwiggyOrderService:
    def __init__(self, client: Optional[SwiggyMCPClient] = None, token: Optional[str] = None) -> None:
        self.client = client or SwiggyMCPClient(token=token)
        # Share the client so address resolution logic isn't duplicated.
        self._discovery = SwiggyDiscoveryService(client=self.client)

    async def resolve_address_id(
        self, city: Optional[str] = None, address_id: Optional[str] = None
    ) -> str:
        return await self._discovery.resolve_address_id(city, address_id)

    async def fetch_coupons(
        self, restaurant_id: str, address_id: str, coupon_code: Optional[str] = None
    ) -> CouponsResponse:
        args: dict[str, Any] = {"restaurantId": restaurant_id, "addressId": address_id}
        if coupon_code:
            args["couponCode"] = coupon_code
        raw = await self.client.call_tool("fetch_food_coupons", args)
        rows = _as_list(raw, "coupons", "data")
        coupons = [c for c in (_normalize_coupon(r) for r in rows) if c is not None]
        cod_coupons = [c for c in coupons if _is_cod_eligible(c)]
        logger.info(
            "fetch_coupons restaurant=%s: %d coupons, %d COD-eligible",
            restaurant_id, len(coupons), len(cod_coupons),
        )
        return CouponsResponse(success=True, coupons=cod_coupons)

    async def apply_coupon(self, coupon_code: str, address_id: str) -> ApplyCouponResponse:
        raw = await self.client.call_tool(
            "apply_food_coupon", {"couponCode": coupon_code, "addressId": address_id}
        )
        cart = _normalize_cart(raw)
        if not cart.coupon_applied:
            logger.info("apply_coupon %s: applied but no discount detected in response", coupon_code)
        return ApplyCouponResponse(success=True, cart=cart)

    async def get_cart(self, address_id: str, restaurant_name: Optional[str] = None) -> CartResponse:
        args: dict[str, Any] = {"addressId": address_id}
        if restaurant_name:
            args["restaurantName"] = restaurant_name
        raw = await self.client.call_tool("get_food_cart", args)
        return _normalize_cart(raw)

    async def update_cart(
        self,
        restaurant_id: str,
        address_id: str,
        cart_items: list[dict],
        restaurant_name: Optional[str] = None,
    ) -> CartResponse:
        args: dict[str, Any] = {
            "restaurantId": restaurant_id,
            "cartItems": cart_items,
            "addressId": address_id,
        }
        if restaurant_name:
            args["restaurantName"] = restaurant_name
        await self.client.call_tool("update_food_cart", args)
        # update_food_cart "does not render UI" per the docs — always follow
        # with get_food_cart to get the authoritative totals.
        return await self.get_cart(address_id, restaurant_name)

    async def flush_cart(self) -> None:
        await self.client.call_tool("flush_food_cart", {})

    async def get_orders(self, address_id: str, order_count: int = 5) -> OrdersResponse:
        raw = await self.client.call_tool(
            "get_food_orders", {"addressId": address_id, "orderCount": min(order_count, 20)}
        )
        rows = _as_list(raw, "orders", "data")
        orders = [o for o in (_normalize_order_summary(r) for r in rows) if o is not None]
        return OrdersResponse(success=True, orders=orders)

    async def get_order_details(self, order_id: str) -> OrderDetailsResponse:
        raw = await self.client.call_tool("get_food_order_details", {"orderId": order_id})
        data = _unwrap_envelope(raw) or {}
        if not isinstance(data, dict):
            data = {}
        items = [
            line for line in (_normalize_cart_line(r) for r in _as_list(data, "items"))
            if line is not None
        ]
        return OrderDetailsResponse(
            success=True,
            order_id=_first(data, "orderId", "order_id", default=order_id),
            status=_first(data, "orderStatus", "status"),
            items=items,
            pricing=data.get("pricing") if isinstance(data.get("pricing"), dict) else None,
            delivery_address=(
                data.get("deliveryAddress") if isinstance(data.get("deliveryAddress"), dict) else None
            ),
            payment_info=(
                data.get("paymentInfo") if isinstance(data.get("paymentInfo"), dict) else None
            ),
        )

    async def track_order(self, order_id: Optional[str] = None) -> TrackOrderResponse:
        args: dict[str, Any] = {}
        if order_id:
            args["orderId"] = order_id
        raw = await self.client.call_tool("track_food_order", args)
        data = _unwrap_envelope(raw) or {}
        if not isinstance(data, dict):
            data = {}
        return TrackOrderResponse(
            success=True,
            order_id=_first(data, "orderId", "order_id", default=order_id),
            status=_first(data, "status", "orderStatus"),
            eta=_first(data, "eta", "estimatedDeliveryTime", "estimated_delivery_time"),
            progress=_first(data, "progress", "deliveryStatus"),
            raw=data,
        )

    async def place_order(
        self, address_id: str, payment_method: Optional[str] = None, confirmed: bool = False
    ) -> PlaceOrderResponse:
        if not confirmed:
            return PlaceOrderResponse(
                success=False,
                error="Order placement requires explicit user confirmation (confirmed=true).",
            )

        # 1. Always validate against the current cart before placing — cap check
        #    + payment-method validation both depend on this being fresh.
        cart = await self.get_cart(address_id)
        if cart.total is not None and cart.total >= ORDER_VALUE_CAP_INR:
            logger.info("place_order blocked: cart total ₹%s >= cap ₹%s", cart.total, ORDER_VALUE_CAP_INR)
            return PlaceOrderResponse(
                success=False,
                cap_exceeded=True,
                error=(
                    f"Orders of ₹{ORDER_VALUE_CAP_INR} or more aren't supported in-app yet "
                    "(Swiggy MCP beta limit) — please use the Swiggy app for this order."
                ),
            )
        if payment_method and cart.available_payment_methods and payment_method not in cart.available_payment_methods:
            return PlaceOrderResponse(
                success=False,
                error=f"Payment method {payment_method!r} is not available for this cart.",
            )

        args: dict[str, Any] = {"addressId": address_id}
        if payment_method:
            args["paymentMethod"] = payment_method

        # 2. Non-idempotent call: single attempt, no built-in retry. On a
        #    retryable failure, verify via get_food_orders (safe, idempotent)
        #    before ever trying a second placement — never blind-retry.
        try:
            raw = await self.client.call_tool_once("place_food_order", args)
        except SwiggyAuthError:
            raise
        except SwiggyMCPError as exc:
            if not exc.retryable:
                return PlaceOrderResponse(success=False, error=str(exc))
            logger.warning(
                "place_food_order failed (%s) — verifying via get_food_orders before any retry",
                exc,
            )
            verified = await self._find_recent_order(address_id)
            if verified is not None:
                logger.info("place_order: order %s found on verification, treating as placed", verified.order_id)
                return PlaceOrderResponse(
                    success=True, order_id=verified.order_id, status=verified.status,
                    message="Order confirmed via verification after a transient error.",
                )
            # One bounded retry, since the first attempt did not appear to land.
            try:
                raw = await self.client.call_tool_once("place_food_order", args)
            except (SwiggyMCPError, SwiggyAuthError) as retry_exc:
                logger.error("place_food_order retry also failed: %s", retry_exc)
                verified = await self._find_recent_order(address_id)
                if verified is not None:
                    return PlaceOrderResponse(
                        success=True, order_id=verified.order_id, status=verified.status,
                        message="Order confirmed via verification after a transient error.",
                    )
                return PlaceOrderResponse(success=False, error=str(retry_exc))

        data = _unwrap_envelope(raw) or {}
        if not isinstance(data, dict):
            data = {}
        return PlaceOrderResponse(
            success=True,
            order_id=_first(data, "orderId", "order_id"),
            status=_first(data, "status"),
            estimated_delivery_time=_first(data, "estimatedDeliveryTime", "estimated_delivery_time"),
            message=_first(data, "message", default="Order placed successfully"),
        )

    async def _find_recent_order(self, address_id: str) -> Optional[OrderSummary]:
        """Best-effort check for an order that may have just landed despite an error."""
        try:
            orders = await self.get_orders(address_id, order_count=3)
        except (SwiggyMCPError, SwiggyAuthError):
            return None
        return orders.orders[0] if orders.orders else None
