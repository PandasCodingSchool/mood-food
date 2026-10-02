"""Instamart cart/checkout logic.

Wraps SwiggyMCPClient pointed at the Instamart server, mirroring
swiggy_order.py's shape: defensive parsing of the loosely-documented
{success, data, message} envelope, and the same non-idempotent-call caution
around checkout as Food's place_order.

Rules enforced here (see https://mcp.swiggy.com/builders/docs/reference/instamart):
  - update_cart REPLACES the entire cart each call (not additive).
  - checkout requires explicit user confirmation; refuses locally below the
    ₹99 Instamart minimum or at/above the same beta safety cap used for Food.
  - checkout is non-idempotent: single attempt via call_tool_once.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.config import settings
from app.schemas.instamart import (
    INSTAMART_MIN_CART_INR,
    INSTAMART_ORDER_VALUE_CAP_INR,
    InstamartCartLine,
    InstamartCartResponse,
    InstamartCheckoutResponse,
    InstamartVariation,
    PaymentOptionsResponse,
    PaymentStatusResponse,
    TrackInstamartOrderResponse,
)
from app.services.swiggy_discovery import _as_list, _first, _unwrap_envelope
from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPClient, SwiggyMCPError

logger = logging.getLogger("instamart_order")


def _to_float(v: Any) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _normalize_cart_line(raw: dict) -> Optional[InstamartCartLine]:
    spin_id = _first(raw, "spinId", "spin_id", "id")
    if spin_id is None:
        return None
    price_raw = _first(raw, "price", "offerPrice", "finalPrice")
    if isinstance(price_raw, dict):
        price_raw = _first(price_raw, "offerPrice", "mrp")
    return InstamartCartLine(
        spin_id=str(spin_id),
        name=_first(raw, "name", "displayName"),
        price=_to_float(price_raw),
        quantity=int(_first(raw, "quantity", "qty", default=1) or 1),
    )


def _normalize_cart(raw: Any) -> InstamartCartResponse:
    data = _unwrap_envelope(raw) or {}
    if not isinstance(data, dict):
        data = {}
    lines = [
        line for line in (_normalize_cart_line(r) for r in _as_list(data, "items", "cart"))
        if line is not None
    ]
    payment_methods = _first(data, "availablePaymentMethods", "available_payment_methods", default=[])
    if not isinstance(payment_methods, list):
        payment_methods = []
    total = _to_float(_first(data, "total", "grandTotal", "finalTotal"))
    return InstamartCartResponse(
        success=True,
        items=lines,
        subtotal=_to_float(_first(data, "subtotal", "sub_total")),
        total=total,
        available_payment_methods=[str(p) for p in payment_methods],
        below_minimum=total is not None and total < INSTAMART_MIN_CART_INR,
    )


class InstamartOrderService:
    def __init__(self, client: Optional[SwiggyMCPClient] = None, token: Optional[str] = None) -> None:
        self.client = client or SwiggyMCPClient(token=token, mcp_url=settings.swiggy_instamart_mcp_url)

    async def get_cart(self, address_id: str) -> InstamartCartResponse:
        raw = await self.client.call_tool("get_cart", {"addressId": address_id})
        return _normalize_cart(raw)

    async def update_cart(
        self, address_id: str, items: list[InstamartVariation | dict]
    ) -> InstamartCartResponse:
        payload_items = []
        for item in items:
            if isinstance(item, dict):
                payload_items.append(item)
            else:
                entry: dict[str, Any] = {"spinId": item.spin_id, "quantity": 1}
                if item.sku_id:
                    entry["skuId"] = item.sku_id
                payload_items.append(entry)
        await self.client.call_tool(
            "update_cart", {"selectedAddressId": address_id, "items": payload_items}
        )
        return await self.get_cart(address_id)

    async def clear_cart(self) -> None:
        await self.client.call_tool("clear_cart", {})

    async def get_payment_options(self, address_id: str) -> PaymentOptionsResponse:
        raw = await self.client.call_tool("get_payment_options", {"addressId": address_id})
        data = _unwrap_envelope(raw) or {}
        methods = _as_list(data, "methods", "paymentOptions")
        return PaymentOptionsResponse(success=True, methods=methods)

    async def check_payment_status(self, paas_id: str, order_id: str) -> PaymentStatusResponse:
        raw = await self.client.call_tool(
            "check_payment_status", {"paasId": paas_id, "orderId": order_id}
        )
        data = _unwrap_envelope(raw) or {}
        if not isinstance(data, dict):
            data = {}
        return PaymentStatusResponse(
            success=True,
            status=_first(data, "status"),
            order_id=_first(data, "orderId", "order_id", default=order_id),
        )

    async def track_order(self, order_id: Optional[str] = None) -> TrackInstamartOrderResponse:
        args: dict[str, Any] = {}
        if order_id:
            args["orderId"] = order_id
        raw = await self.client.call_tool("track_order", args)
        data = _unwrap_envelope(raw) or {}
        if not isinstance(data, dict):
            data = {}
        return TrackInstamartOrderResponse(
            success=True,
            order_id=_first(data, "orderId", "order_id", default=order_id),
            status=_first(data, "status"),
            eta=_first(data, "eta", "estimatedDeliveryTime"),
            raw=data,
        )

    async def checkout(
        self,
        address_id: str,
        payment_method: Optional[str] = None,
        intent_app: Optional[str] = None,
        generate_upi_qr: bool = False,
        confirmed: bool = False,
    ) -> InstamartCheckoutResponse:
        if not confirmed:
            return InstamartCheckoutResponse(
                success=False,
                error="Checkout requires explicit user confirmation (confirmed=true).",
            )

        # Always validate against the current cart first — min/cap checks and
        # payment-method validation both depend on fresh totals.
        cart = await self.get_cart(address_id)
        if cart.total is not None and cart.total < INSTAMART_MIN_CART_INR:
            return InstamartCheckoutResponse(
                success=False,
                below_minimum=True,
                error=f"Instamart requires a minimum cart value of ₹{INSTAMART_MIN_CART_INR}.",
            )
        if cart.total is not None and cart.total >= INSTAMART_ORDER_VALUE_CAP_INR:
            logger.info("checkout blocked: cart total ₹%s >= cap ₹%s", cart.total, INSTAMART_ORDER_VALUE_CAP_INR)
            return InstamartCheckoutResponse(
                success=False,
                cap_exceeded=True,
                error=(
                    f"Orders of ₹{INSTAMART_ORDER_VALUE_CAP_INR} or more aren't supported "
                    "in-app yet (Swiggy MCP beta limit) — please use the Swiggy Instamart app."
                ),
            )
        if (
            payment_method
            and cart.available_payment_methods
            and payment_method not in cart.available_payment_methods
        ):
            return InstamartCheckoutResponse(
                success=False,
                error=f"Payment method {payment_method!r} is not available for this cart.",
            )

        args: dict[str, Any] = {"addressId": address_id}
        if payment_method:
            args["paymentMethod"] = payment_method
        if intent_app:
            args["intentApp"] = intent_app
        if generate_upi_qr:
            args["generateUPIQR"] = True

        try:
            raw = await self.client.call_tool_once("checkout", args)
        except SwiggyAuthError:
            raise
        except SwiggyMCPError as exc:
            logger.warning("instamart checkout failed: %s", exc)
            return InstamartCheckoutResponse(success=False, error=str(exc))

        data = _unwrap_envelope(raw) or {}
        if not isinstance(data, dict):
            data = {}
        status = _first(data, "status")
        pending = str(status or "").upper() == "PENDING_PAYMENT"
        return InstamartCheckoutResponse(
            success=True,
            order_id=_first(data, "orderId", "order_id"),
            paas_id=_first(data, "paasId", "paas_id"),
            status=status,
            pending_payment=pending,
            message=_first(data, "message", default="Order placed successfully" if not pending else None),
        )
