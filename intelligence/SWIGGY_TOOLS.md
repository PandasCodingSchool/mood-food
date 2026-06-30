# Swiggy MCP — Food Server Tool Reference

Endpoint: `POST https://mcp.swiggy.com/food` (MCP over streamable HTTP).
Auth: `Authorization: Bearer <token>` (OAuth 2.1 + PKCE — see `scripts/swiggy_auth.py`).
Source: https://mcp.swiggy.com/builders/docs/reference/food/

**Response envelope:** tools document a `{ success, data, message }` wrapper (failures:
`{ success: false, error: { message } }`). Over MCP, `result.structuredContent`
typically returns the `data` payload directly (e.g. `{ "restaurants": [...] }`).
Our client (`swiggy_mcp.py`) returns `structuredContent` when present and
`swiggy_discovery._unwrap_envelope` handles both shapes.

Status: ✅ wired (Phase 1 discovery) · 🔜 Phase 2 (ordering).

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

### 🔜 fetch_food_coupons
- **In:** cart context (`addressId`). **Out:** available coupons; filter `requiresOnlinePayment` (COD-only beta).

### 🔜 apply_food_coupon
- **In:** `code`. **Out:** updated cart; treat as applied only when `coupon_discount > 0`.

### 🔜 get_food_cart
- **In:** `addressId` (req), `restaurantName` (opt)
- **Out:** `data` with item lines (+ `valid_addons` per item), `availablePaymentMethods[]`, `offers.coupon_applied.coupon_discount`, totals & fees.
- Call **before** `place_food_order` to validate totals + payment methods.

### 🔜 update_food_cart
- **In:** `restaurantId` (req), `cartItems[]` (req — items with `variants` XOR `variantsV2`, plus addons), `addressId` (req), `restaurantName` (opt)
- Carts are restaurant-scoped; switching restaurants clears the cart. Does **not** render UI — always follow with `get_food_cart`.

### 🔜 flush_food_cart
- **In:** _(cart context)_. Clears all items.

---

## Order

### 🔜 place_food_order
- **In:** `addressId` (req — coords fetched automatically), `paymentMethod` (opt — must match `availablePaymentMethods` from `get_food_cart`)
- **Rules:** explicit user confirmation **mandatory**; cart must be **< ₹1000** (beta); call `get_food_cart` first; non-idempotent → on 5xx verify with `get_food_orders` before retry; use the tool's exact success message verbatim.

---

## Track

### 🔜 get_food_orders
- Active orders + statuses. Also the post-failure verification call for `place_food_order`.

### 🔜 get_food_order_details
- **In:** `orderId`. Detailed info for one order.

### 🔜 track_food_order
- **In:** `orderId` (opt — all active orders if omitted). **Out:** current status, ETA, progress. Poll no faster than every 10s.

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
| FastAPI routes (`/api/swiggy/*`) | `app/routes/swiggy.py` |
| OAuth token minting | `scripts/swiggy_auth.py` |
| Connectivity smoke test | `scripts/swiggy_smoke.py` |
