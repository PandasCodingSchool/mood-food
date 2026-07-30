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
    variants: Optional[dict] = None
    addons: list[str] = Field(default_factory=list)


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


class CartResponse(BaseModel):
    success: bool
    items: list[CartLine] = Field(default_factory=list)
    subtotal: Optional[float] = None
    delivery_charges: Optional[float] = None
    total: Optional[float] = None
    available_payment_methods: list[str] = Field(default_factory=list)
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


class OrderSummary(BaseModel):
    order_id: str
    status: Optional[str] = None
    restaurant_name: Optional[str] = None
    items: list[CartLine] = Field(default_factory=list)


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
