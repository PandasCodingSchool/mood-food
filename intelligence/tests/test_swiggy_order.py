"""Tests for SwiggyOrderService (cart/coupon/order/track) with the MCP client
fully mocked — mirrors tests/test_swiggy.py's style.
"""

import pytest
from unittest.mock import AsyncMock

from app.services.swiggy_mcp import SwiggyMCPClient, SwiggyMCPError
from app.services.swiggy_order import SwiggyOrderService, ORDER_VALUE_CAP_INR


def _client_with(tool_returns):
    client = SwiggyMCPClient(token="test-token")
    client.call_tool = AsyncMock(side_effect=lambda name, args: tool_returns[name])
    return client


CART_UNDER_CAP = {
    "success": True,
    "data": {
        "items": [{"id": "m1", "name": "Butter Chicken", "price": 320, "quantity": 1}],
        "subtotal": 320,
        "deliveryCharges": 30,
        "total": 350,
        "availablePaymentMethods": ["UPI", "COD"],
    },
}

CART_OVER_CAP = {
    "success": True,
    "data": {
        "items": [{"id": "m1", "name": "Family Feast", "price": 1200, "quantity": 1}],
        "subtotal": 1200,
        "deliveryCharges": 0,
        "total": 1200,
        "availablePaymentMethods": ["UPI"],
    },
}


# --- get_cart / fetch_coupons normalisation ---

@pytest.mark.asyncio
async def test_get_cart_normalizes_totals_and_payment_methods():
    client = _client_with({"get_food_cart": CART_UNDER_CAP})
    service = SwiggyOrderService(client=client)
    cart = await service.get_cart("addr_1")
    assert cart.success is True
    assert cart.total == 350
    assert cart.subtotal == 320
    assert cart.delivery_charges == 30
    assert cart.available_payment_methods == ["UPI", "COD"]
    assert len(cart.items) == 1
    assert cart.items[0].id == "m1"


@pytest.mark.asyncio
async def test_fetch_coupons_filters_to_cod_eligible():
    raw = {
        "success": True,
        "data": {
            "coupons": [
                {"couponCode": "SAVE50", "paymentMethod": "COD", "description": "COD only"},
                {"couponCode": "CARD20", "paymentMethod": "CARD", "description": "Card only"},
                {
                    "couponCode": "ONLINEONLY",
                    "description": "20% off",
                    "termsAndConditions": "Valid for online payment only",
                },
                {"couponCode": "ANYPAY", "description": "No restriction mentioned"},
            ]
        },
    }
    client = _client_with({"fetch_food_coupons": raw})
    service = SwiggyOrderService(client=client)
    result = await service.fetch_coupons("rest_1", "addr_1")
    codes = {c.coupon_code for c in result.coupons}
    assert codes == {"SAVE50", "ANYPAY"}, "only COD-eligible coupons should survive filtering"


# --- place_order: confirmation + cap enforcement ---

@pytest.mark.asyncio
async def test_place_order_refuses_without_confirmation():
    client = _client_with({})
    service = SwiggyOrderService(client=client)
    result = await service.place_order("addr_1", confirmed=False)
    assert result.success is False
    assert "confirmation" in (result.error or "").lower()
    client.call_tool.assert_not_called()


@pytest.mark.asyncio
async def test_place_order_blocks_cart_at_or_over_cap():
    client = _client_with({"get_food_cart": CART_OVER_CAP})
    client.call_tool_once = AsyncMock()
    service = SwiggyOrderService(client=client)
    result = await service.place_order("addr_1", confirmed=True)
    assert result.success is False
    assert result.cap_exceeded is True
    assert result.cap_amount == ORDER_VALUE_CAP_INR
    client.call_tool_once.assert_not_called(), "place_food_order must never be called over the cap"


@pytest.mark.asyncio
async def test_place_order_happy_path_under_cap():
    client = _client_with({"get_food_cart": CART_UNDER_CAP})
    client.call_tool_once = AsyncMock(
        return_value={"orderId": "ORDER_1", "status": "confirmed", "estimatedDeliveryTime": "30-35 mins"}
    )
    service = SwiggyOrderService(client=client)
    result = await service.place_order("addr_1", payment_method="UPI", confirmed=True)
    assert result.success is True
    assert result.order_id == "ORDER_1"
    assert result.status == "confirmed"
    client.call_tool_once.assert_called_once()


@pytest.mark.asyncio
async def test_place_order_rejects_unavailable_payment_method():
    client = _client_with({"get_food_cart": CART_UNDER_CAP})
    client.call_tool_once = AsyncMock()
    service = SwiggyOrderService(client=client)
    result = await service.place_order("addr_1", payment_method="BITCOIN", confirmed=True)
    assert result.success is False
    client.call_tool_once.assert_not_called()


# --- place_order: non-idempotent retry-verify path ---

@pytest.mark.asyncio
async def test_place_order_verifies_via_get_orders_before_retry_on_failure():
    """On a retryable failure, the order may have actually landed — verify via
    get_food_orders (safe/idempotent) before ever attempting a second
    place_food_order call."""
    orders_response = {
        "success": True,
        "data": {"orders": [{"orderId": "ORDER_VERIFIED", "status": "confirmed"}]},
    }
    client = _client_with({"get_food_cart": CART_UNDER_CAP, "get_food_orders": orders_response})
    client.call_tool_once = AsyncMock(
        side_effect=SwiggyMCPError("Swiggy transport error: timeout", retryable=True)
    )
    service = SwiggyOrderService(client=client)
    result = await service.place_order("addr_1", confirmed=True)

    assert result.success is True
    assert result.order_id == "ORDER_VERIFIED"
    # Only the single failed attempt — verification found the order, so no
    # second place_food_order call was made.
    assert client.call_tool_once.call_count == 1


@pytest.mark.asyncio
async def test_place_order_retries_once_when_verification_finds_nothing():
    """If get_food_orders shows nothing, exactly one bounded retry is allowed —
    never an unbounded blind-retry loop."""
    empty_orders = {"success": True, "data": {"orders": []}}
    client = _client_with({"get_food_cart": CART_UNDER_CAP, "get_food_orders": empty_orders})
    client.call_tool_once = AsyncMock(
        side_effect=[
            SwiggyMCPError("Swiggy transport error: timeout", retryable=True),
            {"orderId": "ORDER_RETRY_OK", "status": "confirmed"},
        ]
    )
    service = SwiggyOrderService(client=client)
    result = await service.place_order("addr_1", confirmed=True)

    assert result.success is True
    assert result.order_id == "ORDER_RETRY_OK"
    assert client.call_tool_once.call_count == 2


@pytest.mark.asyncio
async def test_place_order_non_retryable_failure_returns_error_without_retry():
    client = _client_with({"get_food_cart": CART_UNDER_CAP})
    client.call_tool_once = AsyncMock(
        side_effect=SwiggyMCPError("Restaurant is closed", retryable=False)
    )
    service = SwiggyOrderService(client=client)
    result = await service.place_order("addr_1", confirmed=True)

    assert result.success is False
    assert "closed" in (result.error or "").lower()
    client.call_tool_once.assert_called_once()
