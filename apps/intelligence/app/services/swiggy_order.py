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

import json
import logging
import re
from typing import Any, Optional

from app.lab import trace
from app.schemas.swiggy import (
    ORDER_VALUE_CAP_INR,
    ApplyCouponResponse,
    CartLine,
    CartResponse,
    ConfirmOrderResponse,
    Coupon,
    CouponsResponse,
    ItemOptionsResponse,
    OptionChoice,
    OptionGroup,
    OrderDetailsResponse,
    OrderSummary,
    OrdersResponse,
    PaymentOption,
    PaymentStatusRequest,
    PaymentStatusResponse,
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

# check_payment_status holds the request ~19s while pending; the API proxy allows 25s.
PAYMENT_STATUS_TIMEOUT_S = 22.0


def _to_float(v: Any) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _normalize_cart_line(raw: dict) -> Optional[CartLine]:
    iid = _first(raw, "id", "menu_item_id", "itemId", "item_id", "menuItemId")
    name = _first(raw, "name", "itemName", "item_name")
    if iid is None or name is None:
        return None
    quantity = int(_first(raw, "quantity", "qty", default=1) or 1)
    price = _to_float(_first(raw, "price", "finalPrice", "amount"))
    if price is None:
        # Real get_food_cart lines carry per-line totals, not a unit price.
        line_total = _to_float(_first(raw, "final_price", "total", "subtotal"))
        price = line_total / quantity if line_total is not None and quantity else None
    # Live lines echo the chosen variant (often just the dish name again) and addons.
    picked = [
        str(c["name"]) for key in ("variants", "addons") for c in (raw.get(key) or [])
        if isinstance(c, dict) and c.get("name") and str(c["name"]) != str(name)
    ]
    return CartLine(id=str(iid), name=str(name), price=price, quantity=quantity, customizations=picked)


def _update_rejection(raw: Any) -> Optional[tuple[str, list[str]]]:
    """(message, errorCodes) when update_food_cart refused the items, else None.

    A refused update still comes back isError=False — e.g. {statusCode: 1,
    successful: false, errorCodes: ["INVALID_ADDON"]} — and leaves the cart empty.
    """
    if not isinstance(raw, dict):
        return None
    code = raw.get("statusCode")
    if raw.get("successful") is not False and code in (None, 0):
        return None
    codes = [str(c) for c in (raw.get("errorCodes") or [])]
    message = raw.get("titleMessage") or raw.get("statusMessage") or "Swiggy couldn't add these items."
    return str(message), codes


def _default_addons(row: dict) -> list[dict]:
    """One pick per required addon group (minAddons > 0): free and in-stock first, in menu order."""
    picks: list[dict] = []
    for group in row.get("addons") or []:
        if not isinstance(group, dict):
            continue
        need = int(_to_float(group.get("minAddons")) or 0)
        gid = _first(group, "groupId", "group_id")
        if need <= 0 or gid is None:
            continue
        choices = [c for c in group.get("choices") or [] if isinstance(c, dict) and _in_stock(c)]
        choices.sort(key=lambda c: _to_float(c.get("price")) or 0)  # stable: menu order among equals
        picks += [{"group_id": str(gid), "choice_id": str(c["id"])} for c in choices[:need] if c.get("id") is not None]
    return picks


def _in_stock(choice: dict) -> bool:
    return choice.get("inStock", 1) not in (0, "0", False)


def _option_group(raw: dict, choices_key: str, required: bool) -> Optional[OptionGroup]:
    gid = _first(raw, "groupId", "group_id")
    if gid is None:
        return None
    choices = [
        OptionChoice(id=str(c["id"]), name=str(c.get("name") or ""), price=_to_float(c.get("price")),
                     is_default=bool(c.get("default")))
        for c in raw.get(choices_key) or [] if isinstance(c, dict) and c.get("id") is not None and _in_stock(c)
    ]
    if not choices:
        return None
    if required:  # a variant group: exactly one
        return OptionGroup(id=str(gid), name=str(_first(raw, "name", "groupName", default="")), min=1, max=1, choices=choices)
    upper = int(_to_float(raw.get("maxAddons")) or 0)
    return OptionGroup(
        id=str(gid), name=str(_first(raw, "groupName", "name", default="")),
        min=int(_to_float(raw.get("minAddons")) or 0),
        max=upper if upper > 0 else None,  # 0 / -1 = unlimited
        choices=choices,
    )


def _item_options(row: dict) -> ItemOptionsResponse:
    """A search_menu row's choices, shaped for the app's picker.

    An item carries EITHER legacy `variations` OR `variantsV2` (each a list of
    groups with `variations`), plus `addons` groups with min/maxAddons.
    search_menu lists every addon group for every size; Swiggy only says which
    apply to the chosen size once the item is in the cart, so size-suffixed
    groups ("Extra Cheese Medium") are tied to that size by name.
    """
    v2 = row.get("variantsV2")
    legacy = row.get("variations")
    raw_variants = v2 if isinstance(v2, list) and v2 else legacy if isinstance(legacy, list) else []
    variant_groups = [g for g in (_option_group(r, "variations", True) for r in raw_variants if isinstance(r, dict)) if g]
    addon_groups = [g for g in (_option_group(r, "choices", False) for r in row.get("addons") or [] if isinstance(r, dict)) if g]
    by_name = {g.name.strip().lower(): g for g in addon_groups}
    variations = [(c.id, c.name.strip().lower()) for g in variant_groups for c in g.choices if c.name.strip()]
    for g in addon_groups:
        name = g.name.strip().lower()
        for vid, vname in variations:
            if name.endswith(" " + vname):
                g.only_with_variation = vid
                generic = by_name.get(name[: -len(vname)].strip())
                if generic is not None and vid not in generic.hidden_with_variations:
                    generic.hidden_with_variations.append(vid)
                break
    return ItemOptionsResponse(
        success=True,
        item_id=str(_first(row, "menu_item_id", "id", default="")) or None,
        variant_format=("variants_v2" if raw_variants is v2 else "variants") if variant_groups else None,
        variant_groups=variant_groups,
        addon_groups=addon_groups,
    )


def _payment_option_groups(options: Any) -> list[str]:
    """Group names from paymentOptions.allMethods (what place_food_order's paymentMethod takes)."""
    methods = options.get("allMethods") if isinstance(options, dict) else None
    groups: list[str] = []
    for m in methods if isinstance(methods, list) else []:
        if not isinstance(m, dict) or m.get("enabled") is False:
            continue
        group = _first(m, "groupName", "id")
        if group and str(group) not in groups:
            groups.append(str(group))
    return groups


def _walk_dicts(node: Any, max_depth: int = 6, into_lists: bool = True) -> list[dict]:
    """Every dict in a payload, shallowest first (so the outermost match wins)."""
    found: list[dict] = []
    level = [node]
    for _ in range(max_depth):
        nxt: list[Any] = []
        for n in level:
            if isinstance(n, dict):
                found.append(n)
                nxt.extend(v for v in n.values() if isinstance(v, (dict, list)))
            elif isinstance(n, list) and into_lists:
                nxt.extend(v for v in n if isinstance(v, (dict, list)))
        level = nxt
    return found


def _find(dicts: list[dict], keys: tuple[str, ...], kind: type) -> Any:
    for d in dicts:
        for k in keys:
            if isinstance(d.get(k), kind):
                return d[k]
    return None


def _shape(v: Any, depth: int = 0) -> Any:
    """Keys and types only (no values) — safe to log when a payload doesn't parse."""
    if depth > 4:
        return "…"
    if isinstance(v, dict):
        return {k: _shape(x, depth + 1) for k, x in list(v.items())[:25]}
    if isinstance(v, list):
        return [_shape(v[0], depth + 1), f"len={len(v)}"] if v else []
    return type(v).__name__


def _normalize_cart(raw: Any) -> CartResponse:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            raw = {}
    # The cart sits at different depths across shapes (documented
    # {success, data: {data: {items, pricing, offers}, availablePaymentMethods}},
    # flat ones, extra wrappers) — find each part wherever it is, shallowest first.
    dicts = _walk_dicts(raw)
    lines: list[CartLine] = []
    for d in dicts:
        for k in ("items", "cart", "cartItems", "cart_items"):
            rows = d.get(k)
            if isinstance(rows, list):
                lines = [ln for ln in (_normalize_cart_line(r) for r in rows if isinstance(r, dict)) if ln is not None]
                if lines:
                    break
        if lines:
            break
    pricing = _find(dicts, ("pricing", "billBreakdown", "bill"), dict) or {}
    # Totals/flags from the cart's own objects, never from line items inside lists.
    data = {k: v for d in reversed(_walk_dicts(raw, into_lists=False)) for k, v in d.items()}  # shallow keys win
    data["offers"] = _find(dicts, ("offers",), dict) or {}
    data["paymentOptions"] = _find(dicts, ("paymentOptions",), dict)
    data["availablePaymentMethods"] = _find(dicts, ("availablePaymentMethods", "available_payment_methods"), list)
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
    if isinstance(applied_raw, str):
        # Live shape: coupon_applied is the code; a 0 discount means it is only
        # auto-suggested, not applied.
        coupon_applied = coupon_discount is not None and coupon_discount > 0
    payment_methods = _first(data, "availablePaymentMethods", "available_payment_methods", default=[])
    if not isinstance(payment_methods, list) or not payment_methods:
        payment_methods = _payment_option_groups(data.get("paymentOptions"))
    gpo_error = _first(data, "gpoError")
    return CartResponse(
        error=str(gpo_error) if gpo_error else None,
        success=True,
        items=lines,
        subtotal=_to_float(_first(pricing, "item_total", "itemTotal", default=_first(data, "subtotal", "sub_total"))),
        # A 0 delivery charge is a real value (free delivery), not "missing".
        delivery_charges=_to_float(_first(
            pricing, "delivery_charge", "deliveryCharge",
            default=_first(data, "deliveryCharges", "delivery_charges", "deliveryFee"),
        )),
        taxes=_to_float(_first(pricing, "taxes_and_charges", "taxesAndCharges")),
        total=_to_float(_first(pricing, "to_pay", "toPay", default=_first(data, "total", "grandTotal", "finalTotal"))),
        available_payment_methods=[str(p) for p in payment_methods],
        coupon_applied=coupon_applied or (coupon_discount is not None and coupon_discount > 0),
        coupon_discount=coupon_discount,
    )


def _payment_options(raw: Any) -> list[PaymentOption]:
    data = _unwrap_envelope(raw) if isinstance(raw, dict) else {}
    if not isinstance(data, dict):
        return []
    upi_apps: list[PaymentOption] = []
    upi_qr: Optional[PaymentOption] = None
    for m in data.get("allMethods") if isinstance(data.get("allMethods"), list) else []:
        if not isinstance(m, dict) or m.get("enabled") is False or not m.get("id"):
            continue
        raw_m = m.get("raw") if isinstance(m.get("raw"), dict) else {}
        if str(m.get("groupName") or raw_m.get("payment_code") or "").upper() != "UPI":
            continue  # COD / Swiggy Money come from their own blocks below
        label = str(m.get("displayName") or raw_m.get("display_name") or m["id"])
        intent = m.get("kind") == "intent" or raw_m.get("upiIntent") is True
        if intent:
            upi_apps.append(PaymentOption(id=str(m["id"]), label=label, kind="upi_app", payment_method="UPI",
                                          intent_app=str(m["id"]), icon_url=m.get("iconUrl")))
        elif upi_qr is None:
            upi_qr = PaymentOption(id=str(m["id"]), label=label, kind="upi_qr", payment_method="UPI",
                                   icon_url=m.get("iconUrl"))
    options = upi_apps + ([upi_qr] if upi_qr else [])
    money = data.get("swiggyMoney")
    if isinstance(money, dict) and money.get("available"):
        options.append(PaymentOption(id=str(money.get("id") or "SwiggyPay"), label=str(money.get("displayName") or "Swiggy Money"),
                                     kind="swiggy_money", payment_method="SwiggyPay"))
    cod = data.get("cod")
    if isinstance(cod, dict) and cod.get("available"):
        # The option id is "COD" but place_food_order takes paymentMethod "Cash".
        options.append(PaymentOption(id=str(cod.get("id") or "COD"), label=str(cod.get("displayName") or "Pay on delivery"),
                                     kind="cash", payment_method="Cash"))
    return options


def _merged(raw: Any) -> dict:
    """Top-level keys of a tool result and its nested dicts (shallow keys win), skipping lists."""
    return {k: v for d in reversed(_walk_dicts(raw, into_lists=False)) for k, v in d.items()}


def _str_or_none(v: Any) -> Optional[str]:
    return str(v) if v is not None else None


def _int_or_none(v: Any) -> Optional[int]:
    f = _to_float(v)
    return int(f) if f is not None else None


def _normalize_placed(raw: Any) -> PlaceOrderResponse:
    """place_food_order result: placed (cash / Swiggy Money) or UPI PENDING_PAYMENT."""
    data = _merged(raw)
    status = _first(data, "status")
    paas_id = _first(data, "paasId")
    pending = (str(status or "").upper() == "PENDING_PAYMENT"
               or str(_first(data, "normalizedStatus") or "").lower() == "pending" or paas_id is not None)
    return PlaceOrderResponse(
        success=True,
        order_id=_str_or_none(_first(data, "orderId", "order_id")),
        status=_str_or_none(status),
        estimated_delivery_time=_str_or_none(_first(data, "estimatedDeliveryTime", "estimatedDelivery", "estimated_delivery_time")),
        message=_first(data, "message", default="Awaiting payment" if pending else "Order placed successfully"),
        payment_pending=pending,
        paas_id=_str_or_none(paas_id),
        upi_intent_url=_first(data, "upiIntentUrl"),
        bridge_url=_first(data, "bridgeUrl"),
        is_qr_flow=data.get("isQrFlow") is True,
        polling_interval_ms=_int_or_none(_first(data, "pollingIntervalInMs")),
        max_poll_ms=_int_or_none(_first(data, "maxTimeToPollForInMs")),
        cart_id=_str_or_none(_first(data, "cartId")),
        lat=_to_float(_first(data, "lat")),
        lng=_to_float(_first(data, "lng")),
        address_id=_str_or_none(_first(data, "addressId")),
        total_amount=_to_float(_first(data, "totalAmount")),
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


_QTY_SUFFIX = re.compile(r"\s*(?:x\s*\d+|\(\s*x?\s*\d+\s*\))\s*$", re.I)


def _ordered_item_names(raw: dict) -> list[str]:
    """Item names from reorderMeta.orderItems, else the `orderedItems` text."""
    names: list[str] = []
    for action in raw.get("actions") or []:
        meta = action.get("reorderMeta") if isinstance(action, dict) else None
        for item in (meta or {}).get("orderItems") or []:
            if isinstance(item, dict) and item.get("name"):
                names.append(str(item["name"]).strip())
    if not names and isinstance(raw.get("orderedItems"), str):
        names = [_QTY_SUFFIX.sub("", part).strip() for part in raw["orderedItems"].split(",")]
    return [n for n in dict.fromkeys(names) if n]


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
        status=_first(raw, "orderStatus", "status"),
        restaurant_name=_first(raw, "restaurantName") or (_first(restaurant, "name") if restaurant else None),
        items=items,
        restaurant_id=_first(raw, "restaurantId"),
        ordered_at=_first(raw, "orderedTime"),
        order_total=_first(raw, "orderTotal"),
        is_active=raw.get("isActiveOrder") if isinstance(raw.get("isActiveOrder"), bool) else None,
        item_names=_ordered_item_names(raw),
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
        cart = _normalize_cart(raw)
        if not cart.items:
            # Structure only (keys/types, no values) so an unexpected shape is debuggable from logs.
            logger.info("get_cart: no items parsed; payload shape=%s", json.dumps(_shape(raw))[:2000])
        return cart

    async def payment_options(self, address_id: str) -> list[PaymentOption]:
        """Ways to pay for the live cart, from get_payment_options.

        UPI apps (intent) and Swiggy's scan-QR page go through UPI; Swiggy Money
        and cash are placed immediately. Card/netbanking aren't offered by the
        MCP. Swiggy rejects a UPI-eligible user's order without a paymentMethod,
        so checkout must send one of these.
        """
        raw = await self.client.call_tool("get_payment_options", {"addressId": address_id})
        return _payment_options(raw)

    async def update_cart(
        self,
        restaurant_id: str,
        address_id: str,
        cart_items: list[dict],
        restaurant_name: Optional[str] = None,
        item_names: Optional[dict[str, str]] = None,
    ) -> CartResponse:
        args: dict[str, Any] = {
            "restaurantId": restaurant_id,
            "cartItems": cart_items,
            "addressId": address_id,
        }
        if restaurant_name:
            args["restaurantName"] = restaurant_name
        rejection = _update_rejection(await self.client.call_tool("update_food_cart", args))
        if rejection and "INVALID_ADDON" in rejection[1]:
            # Dishes with a required choice (e.g. "Choice of Rice") are dropped
            # without one. The app has no picker, so pick the defaults and retry once.
            filled = await self._with_required_addons(restaurant_id, address_id, cart_items, item_names or {})
            if filled is not None:
                args["cartItems"] = filled
                rejection = _update_rejection(await self.client.call_tool("update_food_cart", args))
        # update_food_cart "does not render UI" per the docs — always follow
        # with get_food_cart to get the authoritative totals.
        cart = await self.get_cart(address_id, restaurant_name)
        if rejection:
            logger.warning("update_food_cart rejected: %s codes=%s", rejection[0], rejection[1])
            if not cart.items:
                cart.success = False
                cart.error = rejection[0]
        return cart

    async def _with_required_addons(
        self, restaurant_id: str, address_id: str, cart_items: list[dict], item_names: dict[str, str]
    ) -> Optional[list[dict]]:
        """cart_items with default picks for each item's required addon groups (None if nothing to add)."""
        filled: list[dict] = []
        changed = False
        for item in cart_items:
            iid = str(item.get("menu_item_id"))
            name = item_names.get(iid)
            if item.get("addons") or not name:
                filled.append(item)
                continue
            row = await self._menu_row(restaurant_id, address_id, iid, name)
            addons = _default_addons(row) if row else []
            if not addons:
                logger.info("update_cart: no required addons found for item %s", iid)
            trace.emit("cart.default_addons", item=iid, name=name, addons=addons)
            changed = changed or bool(addons)
            filled.append({**item, "addons": addons} if addons else item)
        return filled if changed else None

    async def _menu_row(self, restaurant_id: str, address_id: str, item_id: str, name: str) -> Optional[dict]:
        """The item's full search_menu row (with its variants/addons); search_menu scoped to the restaurant."""
        raw = await self.client.call_tool(
            "search_menu", {"query": name, "addressId": address_id, "restaurantIdOfAddedItem": restaurant_id}
        )
        return next((d for d in _walk_dicts(raw) if str(_first(d, "menu_item_id", "id", default="")) == item_id), None)

    async def item_options(self, restaurant_id: str, address_id: str, item_id: str, name: str) -> ItemOptionsResponse:
        """Variant/addon groups for one dish, for the app's choice picker."""
        row = await self._menu_row(restaurant_id, address_id, item_id, name)
        if row is None:
            return ItemOptionsResponse(success=False, item_id=item_id, error="Couldn't load the options for this dish.")
        return _item_options(row)

    async def flush_cart(self) -> None:
        await self.client.call_tool("flush_food_cart", {})

    async def get_orders(self, address_id: str, order_count: int = 5) -> OrdersResponse:
        # Server schema: addressId (coordinates only), activeOnly, orderCount (default 5, max 15).
        raw = await self.client.call_tool("get_food_orders", {"addressId": address_id, "orderCount": min(15, max(1, order_count))})
        rows = _as_list(raw, "orders", "data")
        orders = [o for o in (_normalize_order_summary(r) for r in rows) if o is not None]
        return OrdersResponse(success=True, orders=orders[: max(1, order_count)])

    async def most_recent_address_id(self) -> Optional[str]:
        """The user's own addresses come sorted by last order date (most recent first)."""
        raw = await self.client.call_tool("get_addresses", {})
        rows = _as_list(raw, "addresses", "data")
        return str(_first(rows[0], "id", "addressId", "address_id")) if rows else None

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
        self,
        address_id: str,
        payment_method: Optional[str] = None,
        confirmed: bool = False,
        intent_app: Optional[str] = None,
        generate_upi_qr: bool = False,
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
        if intent_app:
            args["intentApp"] = intent_app
        elif generate_upi_qr:
            args["generateUPIQR"] = True

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

        return _normalize_placed(raw)

    async def payment_status(self, req: PaymentStatusRequest) -> PaymentStatusResponse:
        """One check_payment_status read (Swiggy long-polls it ~19s while pending)."""
        args: dict[str, Any] = {"paasId": req.paas_id}
        for key, value in (("orderId", req.order_id), ("addressId", req.address_id), ("cartId", req.cart_id),
                           ("lat", req.lat), ("lng", req.lng)):
            if value is not None:
                args[key] = value
        raw = await self.client.call_tool("check_payment_status", args, timeout_s=PAYMENT_STATUS_TIMEOUT_S)
        data = _merged(raw)
        status = _first(data, "status")
        state = str(status or "").lower()
        paid = bool(data.get("isTerminalSuccess")) or state in ("success", "paid")
        failed = bool(data.get("isTerminalFailure")) or state in ("failed", "cancelled", "refund-initiated", "cart_changed")
        return PaymentStatusResponse(
            success=True,
            status=str(status) if status is not None else None,
            terminal=bool(data.get("terminal")) or paid or failed,
            paid=paid,
            failed=failed and not paid,
            confirmed=data.get("confirmed") is True,
            order_id=_str_or_none(_first(data, "orderId")),
            order_status=_str_or_none(_first(data, "orderStatus")),
        )

    async def confirm_order(
        self, order_id: str, address_id: str, lat: float, lng: float, cart_id: Optional[str] = None
    ) -> ConfirmOrderResponse:
        """Finalise a UPI order once paid (only when check_payment_status didn't already)."""
        args: dict[str, Any] = {"orderId": order_id, "addressId": address_id, "lat": lat, "lng": lng}
        if cart_id:
            args["cartId"] = cart_id
        data = _merged(await self.client.call_tool("confirm_order", args))
        result = _str_or_none(_first(data, "result"))
        return ConfirmOrderResponse(
            success=True,
            result=result,
            order_id=_str_or_none(_first(data, "orderId")) or order_id,
            order_status=_str_or_none(_first(data, "orderStatus")),
        )

    async def _find_recent_order(self, address_id: str) -> Optional[OrderSummary]:
        """Best-effort check for an order that may have just landed despite an error."""
        try:
            orders = await self.get_orders(address_id, order_count=3)
        except (SwiggyMCPError, SwiggyAuthError):
            return None
        return orders.orders[0] if orders.orders else None
