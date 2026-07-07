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


class MenuSearchResponse(BaseModel):
    success: bool
    address_id: Optional[str] = None
    items: list[SwiggyMenuItem] = Field(default_factory=list)
    error: Optional[str] = None


class SwiggyAlt(BaseModel):
    """A real Swiggy menu item suggested as an alternative from the matched restaurant."""
    type: str  # "healthier" | "budget"
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
