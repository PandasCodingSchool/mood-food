"""Tests for SwiggyOrderService (cart/coupon/order/track) with the MCP client
fully mocked — mirrors tests/test_swiggy.py's style.
"""

import json

import pytest
from unittest.mock import AsyncMock

from app.services.swiggy_mcp import SwiggyMCPClient, SwiggyMCPError
from app.schemas.swiggy import CartResponse
from app.services.swiggy_order import SwiggyOrderService, ORDER_VALUE_CAP_INR


def _client_with(tool_returns):
    client = SwiggyMCPClient(token="test-token")
    client.call_tool = AsyncMock(side_effect=lambda name, args, **kw: tool_returns[name])
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


# Documented get_food_cart shape: cart under data.data, payment methods under data.
CART_LIVE_SHAPE = {
    "success": True,
    "data": {
        "data": {
            "items": [
                {"menu_item_id": "m1", "name": "Butter Chicken", "quantity": 2, "final_price": 640, "in_stock": True},
                {"menu_item_id": "m2", "name": "Garlic Naan", "quantity": 1, "final_price": 60},
            ],
            "pricing": {"item_total": 700, "delivery_charge": 30, "taxes_and_charges": 35, "to_pay": 765},
            "offers": {"coupon_applied": {"coupon_discount": 50}},
        },
        "addressId": "addr_1",
        "availablePaymentMethods": ["COD"],
    },
}


@pytest.mark.asyncio
async def test_get_cart_reads_live_nested_shape():
    client = _client_with({"get_food_cart": CART_LIVE_SHAPE})
    cart = await SwiggyOrderService(client=client).get_cart("addr_1")
    assert [(i.id, i.name, i.quantity, i.price) for i in cart.items] == [
        ("m1", "Butter Chicken", 2, 320),
        ("m2", "Garlic Naan", 1, 60),
    ]
    assert (cart.subtotal, cart.delivery_charges, cart.total) == (700, 30, 765)
    assert cart.available_payment_methods == ["COD"]
    assert cart.coupon_applied is True and cart.coupon_discount == 50


@pytest.mark.asyncio
@pytest.mark.parametrize("wrap", [
    lambda c: {"cart": c},                       # extra wrapper key
    lambda c: {"result": {"content": c}},        # deeper wrapper
    lambda c: json.dumps(c),                     # JSON text block instead of structuredContent
])
async def test_get_cart_finds_cart_at_any_depth(wrap):
    client = _client_with({"get_food_cart": wrap(CART_LIVE_SHAPE)})
    cart = await SwiggyOrderService(client=client).get_cart("addr_1")
    assert [i.id for i in cart.items] == ["m1", "m2"]
    assert cart.total == 765 and cart.available_payment_methods == ["COD"]


@pytest.mark.asyncio
async def test_get_cart_camel_pricing_and_no_line_total_leak():
    raw = {"data": {"items": [{"menuItemId": "x", "itemName": "Biryani", "quantity": 2, "total": 500}],
                    "billBreakdown": {"itemTotal": 500, "deliveryCharge": 40, "toPay": 560}}}
    cart = await SwiggyOrderService(client=_client_with({"get_food_cart": raw})).get_cart("a")
    assert (cart.items[0].price, cart.subtotal, cart.delivery_charges, cart.total) == (250, 500, 40, 560)

    no_pricing = {"data": {"items": [{"menu_item_id": "x", "name": "Biryani", "quantity": 1, "total": 500}]}}
    cart = await SwiggyOrderService(client=_client_with({"get_food_cart": no_pricing})).get_cart("a")
    assert cart.total is None  # the line's own total is not the cart total


@pytest.mark.asyncio
async def test_get_cart_logs_shape_when_empty(caplog):
    raw = {"data": {"view": "markdown", "rows": [{"secret_name": "x"}]}}
    with caplog.at_level("INFO", logger="swiggy_order"):
        cart = await SwiggyOrderService(client=_client_with({"get_food_cart": raw})).get_cart("a")
    assert cart.items == []
    msg = next(r.getMessage() for r in caplog.records if "no items parsed" in r.getMessage())
    assert '"secret_name": "str"' in msg and '"x"' not in msg


@pytest.mark.asyncio
async def test_get_cart_reads_payment_options_and_suggested_coupon():
    raw = {
        "success": True,
        "data": {
            "data": {
                "items": [{"menu_item_id": "m1", "name": "Dal Makhani", "quantity": 1, "final_price": 240}],
                "pricing": {"item_total": 240, "delivery_charge": 0, "taxes_and_charges": 12, "to_pay": 252},
                "offers": {"coupon_applied": "TRYNEW", "coupon_discount": 0},
            },
            "addressId": "addr_1",
            "paymentOptions": {"allMethods": [
                {"id": "gpay", "groupName": "UPI", "displayName": "Google Pay"},
                {"id": "phonepe", "groupName": "UPI", "displayName": "PhonePe"},
                {"id": "cod", "groupName": "Cash", "enabled": True},
                {"id": "card", "groupName": "Card", "enabled": False},
            ]},
            "gpoError": "Restaurant is not accepting orders right now",
        },
    }
    cart = await SwiggyOrderService(client=_client_with({"get_food_cart": raw})).get_cart("addr_1")
    assert cart.total == 252
    assert cart.available_payment_methods == ["UPI", "Cash"]
    assert cart.coupon_applied is False  # suggested, discount 0
    assert cart.error == "Restaurant is not accepting orders right now"


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


def test_update_cart_route_sends_snake_case_menu_item_id(client, monkeypatch):
    # Live schema requires `menu_item_id`; camelCase was accepted silently and left the cart empty.
    from app.routes import swiggy as swiggy_routes

    sent = {}

    class FakeService:
        async def update_cart(self, restaurant_id, address_id, cart_items, restaurant_name=None):
            sent["items"] = cart_items
            return CartResponse(success=True)

    monkeypatch.setattr(swiggy_routes, "_order_service", lambda request: FakeService())
    res = client.post("/api/swiggy/cart", json={
        "restaurant_id": "78138", "address_id": "a", "items": [{"menu_item_id": "34114193", "quantity": 1}],
    })
    assert res.status_code == 200
    assert sent["items"] == [{"menu_item_id": "34114193", "quantity": 1}]


# Shape captured from the live server (Oct 2026), values made up: no success/data
# envelope, cart under data, ints for ids, no payment methods on the cart.
CART_REAL_SHAPE = {
    "statusCode": 0, "statusMessage": "CART", "successful": True, "addressId": "addr_1",
    "data": {
        "cart_id": 123, "result": "ok", "restaurant": {"name": "Imperio", "deliverySubtitle": "49 mins"},
        "items": [{"menu_item_id": 34114193, "name": "Paneer Butter Masala", "quantity": 1, "is_veg": "1",
                   "subtotal": 169, "total": 169.0, "final_price": 169, "in_stock": 1, "variants": [{}], "addons": []}],
        "item_count": 1,
        "pricing": {"item_total": 169, "delivery_charge": 0, "delivery_charge_strikeoff": 30,
                    "taxes_and_charges": 47.0, "to_pay": 216},
        "offers": {"coupon_applied": None, "coupon_discount": 0, "free_delivery_applied": True},
    },
}


@pytest.mark.asyncio
async def test_get_cart_reads_real_live_shape():
    cart = await SwiggyOrderService(client=_client_with({"get_food_cart": CART_REAL_SHAPE})).get_cart("addr_1")
    assert [(i.id, i.name, i.quantity, i.price) for i in cart.items] == [("34114193", "Paneer Butter Masala", 1, 169)]
    assert (cart.subtotal, cart.delivery_charges, cart.taxes, cart.total) == (169, 0, 47, 216)
    assert cart.coupon_applied is False


@pytest.mark.asyncio
async def test_empty_real_cart_is_empty_not_an_error():
    raw = {"statusCode": 0, "statusMessage": "CART", "successful": True, "data": None, "addressId": "a"}
    cart = await SwiggyOrderService(client=_client_with({"get_food_cart": raw})).get_cart("a")
    assert cart.success and cart.items == [] and cart.error is None


# get_payment_options as the live server returns it (Oct 2026), trimmed.
PAYMENT_OPTIONS_LIVE = {
    "cod": {"available": True, "id": "COD", "displayName": "Pay on delivery"},
    "swiggyMoney": {"available": True, "id": "SwiggyPay", "displayName": "Swiggy Money"},
    "allMethods": [
        {"id": "gpay://upi/", "groupName": "UPI", "displayName": "Google Pay", "iconUrl": "https://x/gpay", "enabled": True,
         "raw": {"groupName": "UPI", "upiIntent": True, "payment_code": "UPI", "enabled": True}},
        {"id": "phonepe://", "groupName": "UPI", "displayName": "PhonePe UPI", "enabled": False,
         "raw": {"upiIntent": True, "payment_code": "UPI"}},
        {"id": "PayWithQR", "groupName": "UPI", "displayName": "Pay with QR", "enabled": True,
         "raw": {"upiIntent": False, "payment_code": "UPI"}},
        {"id": "COD", "groupName": "COD", "displayName": "Pay on delivery", "enabled": True},
    ],
}


@pytest.mark.asyncio
async def test_payment_options_from_live_shape():
    svc = SwiggyOrderService(client=_client_with({"get_payment_options": PAYMENT_OPTIONS_LIVE}))
    opts = await svc.payment_options("a")
    assert [(o.kind, o.payment_method, o.intent_app) for o in opts] == [
        ("upi_app", "UPI", "gpay://upi/"),   # disabled PhonePe skipped
        ("upi_qr", "UPI", None),
        ("swiggy_money", "SwiggyPay", None),
        ("cash", "Cash", None),              # option id COD, but place_food_order takes "Cash"
    ]


def test_cart_route_adds_pay_on_delivery_for_checkout(client, monkeypatch):
    from app.routes import swiggy as swiggy_routes

    svc = SwiggyOrderService(client=_client_with({"get_food_cart": CART_REAL_SHAPE,
                                                  "get_payment_options": PAYMENT_OPTIONS_LIVE}))
    monkeypatch.setattr(swiggy_routes, "_order_service", lambda request: svc)
    body = client.get("/api/swiggy/cart", params={"address_id": "addr_1"}).json()
    assert body["available_payment_methods"] == ["UPI", "SwiggyPay", "Cash"] and body["taxes"] == 47
    assert body["payment_options"][0]["intent_app"] == "gpay://upi/"


UPI_PENDING = {"success": True, "data": {
    "orderId": "o1", "paasId": "p1", "transactionId": "t1", "upiIntentUrl": "upi://pay?pa=x", "bridgeUrl": "https://pay/x",
    "isQrFlow": False, "pollingIntervalInMs": 3000, "maxTimeToPollForInMs": 300000, "paymentMethod": "UPI",
    "status": "PENDING_PAYMENT", "normalizedStatus": "pending", "totalAmount": 216, "addressId": "addr_1",
    "cartId": "c1", "lat": 12.9, "lng": 77.6}}


@pytest.mark.asyncio
async def test_place_order_upi_sends_intent_app_and_returns_pending():
    client = _client_with({"get_food_cart": CART_REAL_SHAPE, "place_food_order": UPI_PENDING})
    client.call_tool_once = AsyncMock(return_value=UPI_PENDING)
    res = await SwiggyOrderService(client=client).place_order(
        "addr_1", "UPI", confirmed=True, intent_app="gpay://upi/")
    client.call_tool_once.assert_awaited_once_with(
        "place_food_order", {"addressId": "addr_1", "paymentMethod": "UPI", "intentApp": "gpay://upi/"})
    assert res.success and res.payment_pending and res.paas_id == "p1" and res.order_id == "o1"
    assert (res.upi_intent_url, res.bridge_url, res.polling_interval_ms, res.cart_id, res.lat) == (
        "upi://pay?pa=x", "https://pay/x", 3000, "c1", 12.9)


@pytest.mark.asyncio
async def test_place_order_qr_and_cash():
    placed = {"success": True, "data": {"orderId": "o2", "status": "CONFIRMED", "normalizedStatus": "success"}}
    client = _client_with({"get_food_cart": CART_REAL_SHAPE})
    client.call_tool_once = AsyncMock(return_value=placed)
    svc = SwiggyOrderService(client=client)
    res = await svc.place_order("a", "Cash", confirmed=True)
    assert res.success and not res.payment_pending and res.order_id == "o2"
    await svc.place_order("a", "UPI", confirmed=True, generate_upi_qr=True)
    assert client.call_tool_once.call_args.args[1] == {"addressId": "a", "paymentMethod": "UPI", "generateUPIQR": True}


@pytest.mark.asyncio
@pytest.mark.parametrize("data,paid,failed,terminal,confirmed", [
    ({"status": "success", "terminal": True, "isTerminalSuccess": True, "confirmed": True}, True, False, True, True),
    ({"status": "SUCCESS"}, True, False, True, False),
    ({"status": "pending", "terminal": False}, False, False, False, False),
    ({"status": "failed", "terminal": True, "isTerminalFailure": True}, False, True, True, False),
    ({"status": "refund-initiated"}, False, True, True, False),
])
async def test_payment_status_normalises(data, paid, failed, terminal, confirmed):
    from app.schemas.swiggy import PaymentStatusRequest

    client = _client_with({"check_payment_status": {"success": True, "data": {"paasId": "p1", **data}}})
    res = await SwiggyOrderService(client=client).payment_status(PaymentStatusRequest(paas_id="p1", order_id="o1", lat=1.0))
    assert (res.paid, res.failed, res.terminal, res.confirmed) == (paid, failed, terminal, confirmed)
    name, args = client.call_tool.call_args.args
    assert name == "check_payment_status" and args == {"paasId": "p1", "orderId": "o1", "lat": 1.0}
    assert client.call_tool.call_args.kwargs["timeout_s"] > 20  # long-poll


@pytest.mark.asyncio
async def test_confirm_order():
    client = _client_with({"confirm_order": {"success": True, "data": {"orderId": "o1", "result": "success"}}})
    res = await SwiggyOrderService(client=client).confirm_order("o1", "a", 12.9, 77.6, "c1")
    assert res.result == "success" and res.order_id == "o1"
    assert client.call_tool.call_args.args[1] == {"orderId": "o1", "addressId": "a", "lat": 12.9, "lng": 77.6, "cartId": "c1"}
