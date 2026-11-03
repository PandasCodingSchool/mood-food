"""KitchenCircle cart contract: grocery requirement lines in, pack-optimized cart proposal out."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

ProviderName = Literal["fixture", "instamart"]


class RequirementLine(BaseModel):
    line_id: str
    name: str
    canonical_name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    dimension: Optional[str] = None  # mass | volume | piece | clove | bunch | sprig
    base_quantity: Optional[float] = None
    freshness_group: str = "buy_now"
    kind: str = "recipe"


class CartPreferences(BaseModel):
    prefer_brands: list[str] = Field(default_factory=list)
    avoid_brands: list[str] = Field(default_factory=list)


class CartPreviewRequest(BaseModel):
    provider: ProviderName
    address_id: Optional[str] = None
    lines: list[RequirementLine] = Field(max_length=120)
    preferences: CartPreferences = Field(default_factory=CartPreferences)


class ChosenPack(BaseModel):
    spin_id: str
    sku_id: Optional[str] = None
    label: str
    count: int
    unit_price: Optional[float] = None


class ProductChoice(BaseModel):
    name: str
    brand: Optional[str] = None
    packs: list[ChosenPack]
    purchased: str
    surplus: str
    cost: Optional[float] = None
    surplus_ratio: Optional[float] = None  # extra ÷ required (pack-surplus metric)


class CartLine(BaseModel):
    line_id: str
    name: str
    status: Literal["matched", "unmatched", "unit_mismatch", "out_of_stock"]
    required: str
    product: Optional[ProductChoice] = None
    alternatives: list[ProductChoice] = Field(default_factory=list)
    approximate: bool = False
    confidence: float = 0.0
    explanation: str


class CartTotals(BaseModel):
    estimated_cost: float
    priced_lines: int
    matched: int
    unmatched: int
    below_minimum: bool
    over_cap: bool
    minimum_amount: int
    cap_amount: int


class CartPreviewResponse(BaseModel):
    provider: ProviderName
    lines: list[CartLine]
    totals: CartTotals
    warnings: list[str] = Field(default_factory=list)


class CartItem(BaseModel):
    spin_id: str
    sku_id: Optional[str] = None
    quantity: int = Field(ge=1, le=50)


class CartWriteRequest(BaseModel):
    address_id: str
    items: list[CartItem] = Field(min_length=1, max_length=120)


class CartWriteResponse(BaseModel):
    success: bool
    total: Optional[float] = None
    items: list[dict] = Field(default_factory=list)
    removed_out_of_stock: list[str] = Field(default_factory=list)
    reduced_quantity: list[dict] = Field(default_factory=list)
    error: Optional[str] = None


class CartCheckoutRequest(BaseModel):
    address_id: str
    payment_method: Optional[Literal["UPI", "Cash", "COD", "SwiggyPay"]] = None
    intent_app: Optional[str] = None
    confirmed: bool = False


class AddressOption(BaseModel):
    id: str
    label: str
    tag: Optional[str] = None
