"""Request/response schemas for the Swiggy discovery endpoints.

The Swiggy MCP tool payload shapes are only loosely documented, so the response
models stay permissive (most fields Optional) and the service layer normalises
raw tool output into these shapes defensively.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class SwiggyRestaurant(BaseModel):
    id: str
    name: str
    rating: Optional[float] = None
    eta_min: Optional[int] = None
    distance_km: Optional[float] = None
    cuisines: list[str] = Field(default_factory=list)
    image_url: Optional[str] = None
    is_open: bool = True
    cost_for_two: Optional[int] = None


class SwiggyMenuItem(BaseModel):
    id: str
    name: str
    price: Optional[float] = None
    image_url: Optional[str] = None
    is_veg: Optional[bool] = None
    rating: Optional[float] = None
    description: Optional[str] = None
    restaurant_id: Optional[str] = None
    restaurant_name: Optional[str] = None
    eta_min: Optional[int] = None
    # Customizable dishes: the app opens a choice picker before adding.
    has_variants: Optional[bool] = None
    has_addons: Optional[bool] = None


# --- Requests ---

class RestaurantSearchRequest(BaseModel):
    query: str
    city: Optional[str] = None
    address_id: Optional[str] = None


class MenuSearchRequest(BaseModel):
    query: str
    city: Optional[str] = None
    address_id: Optional[str] = None


class EnrichDishInput(BaseModel):
    id: str
    name: str
    cuisine: Optional[str] = None
    aliases: list[str] = Field(default_factory=list)
    search_category: Optional[str] = None


class EnrichRequest(BaseModel):
    dishes: list[EnrichDishInput]
    city: Optional[str] = None
    address_id: Optional[str] = None


# --- Responses ---

class SwiggyAddress(BaseModel):
    id: str
    label: str
    line: str


class AddressesResponse(BaseModel):
    success: bool
    addresses: list[SwiggyAddress] = Field(default_factory=list)
    error: Optional[str] = None


class RestaurantSearchResponse(BaseModel):
    success: bool
    address_id: Optional[str] = None
    restaurants: list[SwiggyRestaurant] = Field(default_factory=list)
    error: Optional[str] = None
    address_required: bool = False


class MenuSearchResponse(BaseModel):
    success: bool
    address_id: Optional[str] = None
    items: list[SwiggyMenuItem] = Field(default_factory=list)
    error: Optional[str] = None
    address_required: bool = False


class SwiggyAlt(BaseModel):
    """A real Swiggy menu item suggested as an alternative from the matched restaurant."""
    type: str  # "healthier" | "budget" | "similar_tier"
    item: SwiggyMenuItem


class EnrichedMatch(BaseModel):
    dish_id: str
    matched: bool
    item: Optional[SwiggyMenuItem] = None
    restaurant: Optional[SwiggyRestaurant] = None
    swiggy_alternatives: list[SwiggyAlt] = Field(default_factory=list)


class EnrichResponse(BaseModel):
    success: bool
    address_id: Optional[str] = None
    matches: list[EnrichedMatch] = Field(default_factory=list)
    error: Optional[str] = None
    address_required: bool = False


class AlternativeEnrichItem(BaseModel):
    """One healthier_swap/budget_swap alternative to live-match, tagged with
    its parent recommendation so results can be fanned back out per-rec."""
    rec_id: str
    dish_id: str
    type: str  # "healthier_swap" | "budget_swap"
    name: str
    cuisine: Optional[str] = None


class EnrichAlternativesRequest(BaseModel):
    items: list[AlternativeEnrichItem]
    address_id: Optional[str] = None


class AlternativeEnrichedMatch(BaseModel):
    rec_id: str
    dish_id: str
    type: str
    match: EnrichedMatch


class EnrichAlternativesResponse(BaseModel):
    success: bool
    address_id: Optional[str] = None
    matches: list[AlternativeEnrichedMatch] = Field(default_factory=list)
    error: Optional[str] = None
    address_required: bool = False


class MenuCategory(BaseModel):
    title: str
    items: list[SwiggyMenuItem] = Field(default_factory=list)


class RestaurantMenuResponse(BaseModel):
    success: bool
    restaurant: Optional[SwiggyRestaurant] = None
    categories: list[MenuCategory] = Field(default_factory=list)
    address_id: Optional[str] = None
    error: Optional[str] = None
    address_required: bool = False


# --- Cart / Coupon / Order / Track (Phase 2 — ordering) ---

# Swiggy's own beta restriction: place_food_order rejects carts >= this total.
ORDER_VALUE_CAP_INR = 1000


class CartItemInput(BaseModel):
    menu_item_id: str
    quantity: int = 1
    # Dish name: lets the server look up required addon groups with search_menu.
    name: Optional[str] = None
    # Swiggy takes an item's variants in the format its menu row uses, never both:
    # legacy `variants` or `variantsV2`, each [{"group_id": ..., "variation_id": ...}].
    variants: list[dict] = Field(default_factory=list)
    variants_v2: list[dict] = Field(default_factory=list)
    # Swiggy addon choices: [{"group_id": ..., "choice_id": ...}].
    addons: list[dict] = Field(default_factory=list)


class OptionChoice(BaseModel):
    id: str
    name: str
    price: Optional[float] = None
    is_default: bool = False


class OptionGroup(BaseModel):
    id: str
    name: str
    min: int = 0
    # None = no upper limit.
    max: Optional[int] = None
    choices: list[OptionChoice] = Field(default_factory=list)
    # Size-specific addon groups ("Extra Cheese Medium"): shown only with this
    # variation picked, while the generic sibling is hidden for it.
    only_with_variation: Optional[str] = None
    hidden_with_variations: list[str] = Field(default_factory=list)


class ItemOptionsResponse(BaseModel):
    success: bool
    item_id: Optional[str] = None
    # "variants_v2" | "variants": which cart field the picked variations go in.
    variant_format: Optional[str] = None
    variant_groups: list[OptionGroup] = Field(default_factory=list)
    addon_groups: list[OptionGroup] = Field(default_factory=list)
    error: Optional[str] = None


class UpdateCartRequest(BaseModel):
    restaurant_id: str
    restaurant_name: Optional[str] = None
    address_id: str
    items: list[CartItemInput]


class CartLine(BaseModel):
    id: str
    name: str
    price: Optional[float] = None
    quantity: int = 1
    # Chosen variant/addon names, e.g. ["Chapati (3 pcs)", "Punjabi Rajma"].
    customizations: list[str] = Field(default_factory=list)


class PaymentOption(BaseModel):
    """One way to pay that the app can complete in-app (from get_payment_options)."""
    id: str
    label: str
    # cash | swiggy_money | upi_app (opens a UPI app) | upi_qr (Swiggy's scan-QR page)
    kind: str
    # What place_food_order takes: paymentMethod, plus intentApp for a UPI app.
    payment_method: str
    intent_app: Optional[str] = None
    icon_url: Optional[str] = None


class CartResponse(BaseModel):
    success: bool
    items: list[CartLine] = Field(default_factory=list)
    subtotal: Optional[float] = None
    delivery_charges: Optional[float] = None
    taxes: Optional[float] = None
    total: Optional[float] = None
    available_payment_methods: list[str] = Field(default_factory=list)
    payment_options: list[PaymentOption] = Field(default_factory=list)
    coupon_applied: bool = False
    coupon_discount: Optional[float] = None
    error: Optional[str] = None
    address_required: bool = False


class Coupon(BaseModel):
    coupon_code: str
    discount: Optional[str] = None
    description: Optional[str] = None
    applicability_status: Optional[str] = None
    payment_method: Optional[str] = None
    terms_and_conditions: Optional[str] = None


class CouponsResponse(BaseModel):
    success: bool
    coupons: list[Coupon] = Field(default_factory=list)
    error: Optional[str] = None
    address_required: bool = False


class ApplyCouponRequest(BaseModel):
    coupon_code: str
    address_id: str


class ApplyCouponResponse(BaseModel):
    success: bool
    cart: Optional[CartResponse] = None
    error: Optional[str] = None


class PlaceOrderRequest(BaseModel):
    address_id: str
    payment_method: Optional[str] = None
    # UPI: the chosen app's id from get_payment_options (never put it in payment_method),
    # or generate_upi_qr for the scan-QR page.
    intent_app: Optional[str] = None
    generate_upi_qr: bool = False
    # Mandatory per the Swiggy docs: explicit user confirmation before placing.
    # The server refuses to call place_food_order unless this is true — the API
    # boundary itself enforces the rule, not just the client UI.
    confirmed: bool = False


class PlaceOrderResponse(BaseModel):
    success: bool
    order_id: Optional[str] = None
    status: Optional[str] = None
    estimated_delivery_time: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None
    address_required: bool = False
    cap_exceeded: bool = False
    cap_amount: int = ORDER_VALUE_CAP_INR
    # UPI: the order is NOT placed yet (status PENDING_PAYMENT). The app opens
    # upi_intent_url (or bridge_url), polls /payment/status, then confirms.
    payment_pending: bool = False
    paas_id: Optional[str] = None
    upi_intent_url: Optional[str] = None
    bridge_url: Optional[str] = None
    is_qr_flow: bool = False
    polling_interval_ms: Optional[int] = None
    max_poll_ms: Optional[int] = None
    cart_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    address_id: Optional[str] = None
    total_amount: Optional[float] = None


class PaymentStatusRequest(BaseModel):
    paas_id: str
    order_id: Optional[str] = None
    address_id: Optional[str] = None
    cart_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class PaymentStatusResponse(BaseModel):
    success: bool
    status: Optional[str] = None
    terminal: bool = False
    paid: bool = False
    failed: bool = False
    # True when Swiggy already finalised the order (no confirm_order needed).
    confirmed: bool = False
    order_id: Optional[str] = None
    order_status: Optional[str] = None
    error: Optional[str] = None


class ConfirmOrderRequest(BaseModel):
    order_id: str
    address_id: str
    lat: float
    lng: float
    cart_id: Optional[str] = None


class ConfirmOrderResponse(BaseModel):
    success: bool
    # success | failed | pending (Swiggy's `result`); success = order placed.
    result: Optional[str] = None
    order_id: Optional[str] = None
    order_status: Optional[str] = None
    error: Optional[str] = None


class OrderSummary(BaseModel):
    order_id: str
    status: Optional[str] = None
    restaurant_name: Optional[str] = None
    items: list[CartLine] = Field(default_factory=list)
    # get_food_orders (docs: mcp.swiggy.com/builders/docs/reference/food/get_food_orders)
    restaurant_id: Optional[str] = None
    ordered_at: Optional[str] = None
    order_total: Optional[str] = None
    is_active: Optional[bool] = None
    item_names: list[str] = Field(default_factory=list)


class OrdersResponse(BaseModel):
    success: bool
    orders: list[OrderSummary] = Field(default_factory=list)
    error: Optional[str] = None
    address_required: bool = False


class OrderDetailsResponse(BaseModel):
    success: bool
    order_id: Optional[str] = None
    status: Optional[str] = None
    items: list[CartLine] = Field(default_factory=list)
    pricing: Optional[dict] = None
    delivery_address: Optional[dict] = None
    payment_info: Optional[dict] = None
    error: Optional[str] = None


class TrackOrderResponse(BaseModel):
    success: bool
    order_id: Optional[str] = None
    status: Optional[str] = None
    eta: Optional[str] = None
    progress: Optional[str] = None
    raw: Optional[dict] = None
    error: Optional[str] = None


# --- AI menu chat ---

class MenuChatDishContext(BaseModel):
    dish_id: Optional[str] = None
    dish_name: Optional[str] = None
    why: Optional[str] = None


class MenuChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class MenuChatPreferences(BaseModel):
    """Onboarding dietary/cuisine preferences, sent by the client from its own
    saved preferences (see mobile's fetchPreferences()/preferences.tsx) since
    the intelligence service has no direct access to the Node backend's DB."""
    diets: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    cuisines: list[str] = Field(default_factory=list)


class MenuChatRequest(BaseModel):
    restaurant_id: str
    address_id: str
    dish_context: Optional[MenuChatDishContext] = None
    messages: list[MenuChatMessage]
    user_id: Optional[str] = None
    preferences: Optional[MenuChatPreferences] = None


class MenuChatResponse(BaseModel):
    success: bool
    reply: Optional[str] = None
    suggested_item_ids: list[str] = Field(default_factory=list)
    error: Optional[str] = None
