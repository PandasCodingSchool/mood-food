"""Swiggy Instamart (grocery) schemas.

Tool contracts verified against https://mcp.swiggy.com/builders/docs/reference/instamart/*.
search_products returns products[].variations[] with {spinId, quantity, price,
stock} — skuId isn't in the documented example but Swiggy's own DIY notebook
reads it off the same variation objects, so we parse it defensively (like the
rest of this codebase treats Swiggy's "loosely documented" envelopes) and fall
back to spinId if it's absent.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.recipe import Ingredient

# Swiggy Instamart's own minimum cart value for checkout.
INSTAMART_MIN_CART_INR = 99
# Same beta safety cap already enforced on Food orders (ORDER_VALUE_CAP_INR) —
# applied here defensively since the docs flag ₹1000 as the typical ceiling too.
INSTAMART_ORDER_VALUE_CAP_INR = 1000


class InstamartVariation(BaseModel):
    spin_id: str
    sku_id: Optional[str] = None
    quantity: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[bool] = None
    image_url: Optional[str] = None


class InstamartProduct(BaseModel):
    name: str
    brand: Optional[str] = None
    availability: bool = True
    variations: list[InstamartVariation] = Field(default_factory=list)


class MatchIngredientsRequest(BaseModel):
    items: list[Ingredient]
    address_id: str


class SearchProductsResponse(BaseModel):
    success: bool
    products: list[InstamartProduct] = Field(default_factory=list)
    error: Optional[str] = None


class MatchedIngredient(BaseModel):
    ingredient: Ingredient
    matched: bool
    confidence: float = 0.0
    product: Optional[InstamartProduct] = None
    variation: Optional[InstamartVariation] = None


class MatchIngredientsResponse(BaseModel):
    success: bool
    address_id: Optional[str] = None
    matches: list[MatchedIngredient] = Field(default_factory=list)
    error: Optional[str] = None
    address_required: bool = False


class InstamartCartItemInput(BaseModel):
    spin_id: str
    sku_id: Optional[str] = None
    quantity: int = 1


class UpdateInstamartCartRequest(BaseModel):
    address_id: str
    items: list[InstamartCartItemInput]


class InstamartCartLine(BaseModel):
    spin_id: str
    name: Optional[str] = None
    price: Optional[float] = None
    quantity: int = 1


class InstamartCartResponse(BaseModel):
    success: bool
    items: list[InstamartCartLine] = Field(default_factory=list)
    subtotal: Optional[float] = None
    total: Optional[float] = None
    available_payment_methods: list[str] = Field(default_factory=list)
    error: Optional[str] = None
    address_required: bool = False
    below_minimum: bool = False
    minimum_amount: int = INSTAMART_MIN_CART_INR


class InstamartCheckoutRequest(BaseModel):
    address_id: str
    payment_method: Optional[str] = None
    intent_app: Optional[str] = None
    generate_upi_qr: bool = False
    # Mandatory explicit user confirmation, same rule as Food's place_order.
    confirmed: bool = False


class InstamartCheckoutResponse(BaseModel):
    success: bool
    order_id: Optional[str] = None
    paas_id: Optional[str] = None
    status: Optional[str] = None
    pending_payment: bool = False
    message: Optional[str] = None
    error: Optional[str] = None
    address_required: bool = False
    cap_exceeded: bool = False
    cap_amount: int = INSTAMART_ORDER_VALUE_CAP_INR
    below_minimum: bool = False
    minimum_amount: int = INSTAMART_MIN_CART_INR


class PaymentOptionsResponse(BaseModel):
    success: bool
    methods: list[dict] = Field(default_factory=list)
    error: Optional[str] = None


class PaymentStatusResponse(BaseModel):
    success: bool
    status: Optional[str] = None
    order_id: Optional[str] = None
    error: Optional[str] = None


class TrackInstamartOrderResponse(BaseModel):
    success: bool
    order_id: Optional[str] = None
    status: Optional[str] = None
    eta: Optional[str] = None
    raw: Optional[dict] = None
    error: Optional[str] = None
