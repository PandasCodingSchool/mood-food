# Swiggy MCP — Food Server Tool Reference

Endpoint: `POST https://mcp.swiggy.com/food` (MCP over streamable HTTP).
Auth: `Authorization: Bearer <token>` (OAuth 2.1 + PKCE — see `scripts/swiggy_auth.py`).
Source: https://mcp.swiggy.com/builders/docs/reference/food/

**Response envelope:** tools document a `{ success, data, message }` wrapper (failures:
`{ success: false, error: { message } }`). Over MCP, `result.structuredContent`
typically returns the `data` payload directly (e.g. `{ "restaurants": [...] }`).
Our client (`swiggy_mcp.py`) returns `structuredContent` when present and
`swiggy_discovery._unwrap_envelope` handles both shapes.

Status: ✅ wired (Phase 1 discovery, Phase 2 ordering).

---

## Discover

### ✅ get_addresses
- **In:** _(none)_
- **Out (structuredContent):** `{ addresses: [{ id, addressLine, phoneNumber, addressCategory, addressTag }], total }`
- Home = `addressCategory`/`addressTag == "Home"`. Used by `resolve_address_id`.

### ✅ search_restaurants
- **In:** `addressId` (req), `query` (req — restaurant name or cuisine), `offset` (opt, default 0)
- **Out:** `{ restaurants: [{ id, name, cuisines[], avgRating, totalRatings, costForTwo ("₹600 for two"), areaName, distanceKm, deliveryTimeMinutes, deliveryTimeRange, offer, imageUrl, availabilityStatus }] }`
- Only show `availabilityStatus == "OPEN"`. Ordered by distance/rating/relevance.

### ✅ search_menu
- **In:** `addressId` (req), `query` (req), `restaurantIdOfAddedItem` (opt), `vegFilter` (opt, 0/1), `offset` (opt)
- **Out:** `data` with items carrying `variations` (legacy) **or** `variantsV2` (new), an `addons[]`, and `nextOffset`. Item/variant/addon IDs feed cart ops.

### ✅ get_restaurant_menu
- **In:** `restaurantId` (req), `addressId` (req), `page` (opt, default 1), `pageSize` (opt, default 5, max 8)
- **Out:** compact menu — dish names, prices, flags `hasVariants`/`hasAddons`.

---

## Cart

### ✅ fetch_food_coupons
- **In:** cart context (`addressId`). **Out:** available coupons; filter `requiresOnlinePayment` (COD-only beta).
- Wired: `SwiggyOrderService.fetch_coupons` filters to COD-eligible via `_is_cod_eligible`.

### ✅ apply_food_coupon
- **In:** `code`. **Out:** updated cart; treat as applied only when `coupon_discount > 0`.
- Wired: `SwiggyOrderService.apply_coupon`.

### ✅ get_food_cart
- **In:** `addressId` (req), `restaurantName` (opt)
- **Out (live, verified Oct 2026 — differs from the docs):** `{statusCode, statusMessage: "CART", successful, addressId, data}`; `data` is `null` for an empty cart, else `{cart_id, restaurant, items: [{menu_item_id (int), name, quantity, final_price (line total), …}], pricing: {item_total, delivery_charge, taxes_and_charges, to_pay}, offers: {coupon_applied (code|null), coupon_discount}}`. **No payment methods** — those come from `get_payment_options`.
- Call **before** `place_food_order` to validate totals + payment methods.
- Wired: `SwiggyOrderService.get_cart`; `place_order` always re-fetches the cart first.

### ✅ get_payment_options
- **In:** `addressId` (Food). **Out:** `{cod: {available, id: "COD"}, swiggyMoney, allMethods: [{id, groupName: "UPI"|"COD"|…, enabled}], platforms, paymentAmount}` for the live cart.
- Wired: `SwiggyOrderService.in_app_payment_methods` — pay-on-delivery only until the UPI intent/QR + `check_payment_status` flow exists. `GET /api/swiggy/cart` fills `available_payment_methods` from it.

### ✅ update_food_cart
- **In:** `restaurantId` (req), `cartItems[]` (req — `{menu_item_id, quantity}` **snake_case**, plus `variants` XOR `variantsV2`, addons), `addressId` (req), `restaurantName` (opt)
- ⚠️ `menuItemId` (camelCase) is accepted without error but leaves the cart **empty** — the checkout bug of Oct 2026.
- Carts are restaurant-scoped; switching restaurants clears the cart. Does **not** render UI — always follow with `get_food_cart`.
- Wired: `SwiggyOrderService.update_cart` always calls `get_food_cart` immediately after.

### ✅ flush_food_cart
- **In:** _(cart context)_. Clears all items.
- Wired: `SwiggyOrderService.flush_cart`.

---

## Order

### ✅ place_food_order
- **In:** `addressId` (req — coords fetched automatically), `paymentMethod` (**required for UPI-eligible users** — from `get_payment_options`; omission is rejected)
- **Rules:** explicit user confirmation **mandatory**; cart must be **< ₹1000** (beta); call `get_food_cart` first; non-idempotent → on 5xx verify with `get_food_orders` before retry; use the tool's exact success message verbatim.
- Wired: `SwiggyOrderService.place_order` — refuses without `confirmed=true`, checks the cap against `get_cart().total` before calling the tool, calls the tool via `SwiggyMCPClient.call_tool_once` (no built-in retry — placement must never be silently retried by the transport layer), and on a retryable failure verifies via `get_food_orders` before a single bounded manual retry.

---

## Track

### ✅ get_food_orders
- Active orders + statuses. Also the post-failure verification call for `place_food_order`.
- Wired: `SwiggyOrderService.get_orders`.

### ✅ get_food_order_details
- **In:** `orderId`. Detailed info for one order.
- Wired: `SwiggyOrderService.get_order_details`.

### ✅ track_food_order
- **In:** `orderId` (opt — all active orders if omitted). **Out:** current status, ETA, progress. Poll no faster than every 10s.
- Wired: `SwiggyOrderService.track_order`; client-side polling (mobile `order/success.tsx`) enforces the 10s floor.

---

## Support

### report_error
- Report a tool failure to the Swiggy MCP team.

---

## Our wiring

| Layer | File |
|---|---|
| MCP client (transport, retry, error unwrap) | `app/services/swiggy_mcp.py` |
| Discovery logic + response normalization | `app/services/swiggy_discovery.py` |
| Cart/coupon/order/track logic | `app/services/swiggy_order.py` |
| FastAPI routes (`/api/swiggy/*`) | `app/routes/swiggy.py` |
| OAuth token minting | `scripts/swiggy_auth.py` |
| Connectivity smoke test | `scripts/swiggy_smoke.py` |

---

# Swiggy MCP — Instamart (Grocery) Server Tool Reference

Endpoint: `POST https://mcp.swiggy.com/im` (MCP over streamable HTTP).
Auth: same bearer-token model as the Food server.
Source: https://mcp.swiggy.com/builders/docs/reference/instamart/

Status: ✅ wired (DIY cooking feature — ingredient search + grocery cart/checkout).

### ✅ search_products
- **In:** `addressId` (req), `query` (req), `offset` (opt, default 0)
- **Out:** `{ success, data: { nextOffset, products: [{ name, brand, availability, variations: [{ spinId, quantity, price, stock }] }], similarProducts } }`
- `skuId` is not in the documented example variation shape but is read defensively (present in real responses) — see `instamart_discovery._normalize_variation`.

### ✅ update_cart
- **In:** `selectedAddressId` (req), `items` (req — `[{ spinId, skuId, quantity }]`)
- **REPLACES the entire cart** each call — not additive. Always follow with `get_cart` for authoritative totals (same pattern as `update_food_cart`).

### ✅ get_cart
- **In:** `addressId` (req)
- **Out:** items, pricing breakdown, available payment methods.

### ✅ clear_cart
- **In:** _(none)_ — required before switching addresses to avoid SKU mismatches.

### ✅ checkout
- **In:** `addressId` (req), `paymentMethod` (opt — `"UPI"`/`"Cash"`, default Cash), `intentApp` (opt), `generateUPIQR` (opt)
- **Out:** UPI → `{ status: "PENDING_PAYMENT", paasId, orderId }`, must poll `check_payment_status`. Cash/SwiggyPay confirms in one call.
- Requires explicit user confirmation before calling (enforced server-side via `confirmed=true`, same rule as Food's `place_order`). Min cart ₹99; local safety cap ₹1000 mirrors Food's beta limit.

### ✅ get_payment_options / check_payment_status
- Payment method discovery and UPI polling, as above.

### track_order / get_delivery_status / get_orders / get_order_details
- Not yet wired beyond basic `track_order`; add as needed.

### your_go_to_items / get_addresses / create_address / delete_address / apply_coupon / list_coupons / report_error
- Not yet wired — DIY flow reuses the address already selected on the mobile/web client rather than managing Instamart addresses separately.

## Our wiring (Instamart)

| Layer | File |
|---|---|
| MCP client | `app/services/swiggy_mcp.py` (`SwiggyMCPClient(mcp_url=settings.swiggy_instamart_mcp_url)`) |
| Ingredient search + matching | `app/services/instamart_discovery.py` |
| Cart/checkout logic | `app/services/instamart_order.py` |
| FastAPI routes (`/api/instamart/*`) | `app/routes/instamart.py` |
| Recipe generation (`/api/recipe/*`) | `app/services/recipe_generator.py`, `app/routes/recipe.py` |
| Food-photo moderation gate (`/api/moderation/*`) | `app/services/image_moderation.py`, `app/routes/moderation.py` |
