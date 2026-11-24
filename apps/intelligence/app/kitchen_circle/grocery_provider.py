"""Grocery provider boundary for KitchenCircle (portable; no DIY coupling).

`KitchenCircleGroceryProvider` is what the cart builder depends on. `FixtureGroceryProvider` is a
deterministic sample catalogue used by default and in tests. `InstamartKitchenCircleAdapter` maps
the Swiggy Instamart MCP tools (verified against mcp.swiggy.com/builders/docs/reference/instamart):

  search_products {query, addressId}        → products[].variations[] {spinId, skuId, quantityDescription,
                                               price{offerPrice, mrp}, isInStockAndAvailable, maxQuantity}
  get_addresses {}                           → addresses[] {id, addressLine, addressTag, …}; phone is dropped
  update_cart {selectedAddressId, items[]}   → replaces the whole cart; reports removedOutOfStockItems /
                                               reducedQuantityItems
  checkout / check_payment_status            → delegated to InstamartOrderService (confirmation, ₹ min/cap)

Live writes are only reached when the API's feature flag allows them and the owner asked.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

from app.config import settings
from app.services.instamart_discovery import ingredient_match_confidence
from app.services.instamart_order import InstamartOrderService
from app.services.swiggy_discovery import _as_list, _first, _unwrap_envelope
from app.services.swiggy_mcp import SwiggyMCPClient

from .cart_schemas import AddressOption, CartItem, CartWriteResponse


@dataclass
class ProviderVariation:
    spin_id: str
    sku_id: Optional[str]
    label: str
    price: Optional[float]
    in_stock: bool = True
    max_quantity: Optional[int] = None


@dataclass
class ProviderProduct:
    name: str
    brand: Optional[str]
    in_stock: bool
    variations: list[ProviderVariation] = field(default_factory=list)


class KitchenCircleGroceryProvider(Protocol):
    name: str

    async def search(self, query: str, address_id: Optional[str]) -> list[ProviderProduct]: ...


# ── Fixture catalogue ───────────────────────────────────────────────────────
def _p(name: str, brand: str, *variations: tuple[str, float], in_stock: bool = True) -> ProviderProduct:
    slug = name.lower().replace(" ", "-")
    return ProviderProduct(name, brand, in_stock, [
        ProviderVariation(f"fx-{slug}-{i}", f"fx-sku-{slug}-{i}", label, price, in_stock) for i, (label, price) in enumerate(variations)
    ])


FIXTURE_CATALOGUE: list[ProviderProduct] = [
    _p("Chicken Curry Cut", "Licious", ("300 g", 179.0)),
    _p("Onion", "Fresho", ("1 kg", 42.0), ("500 g", 24.0)),
    _p("Tomato Hybrid", "Fresho", ("500 g", 22.0), ("1 kg", 40.0)),
    _p("Potato", "Fresho", ("1 kg", 38.0)),
    _p("Garlic", "Fresho", ("100 g", 28.0), ("250 g", 62.0)),
    _p("Ginger", "Fresho", ("100 g", 18.0)),
    _p("Toor Dal", "Tata Sampann", ("500 g", 92.0), ("1 kg", 176.0)),
    _p("Moong Dal", "Tata Sampann", ("500 g", 88.0)),
    _p("Basmati Rice", "India Gate", ("1 kg", 139.0), ("5 kg", 649.0)),
    _p("Paneer", "Amul", ("200 g", 90.0)),
    _p("Fresh Curd", "Nandini", ("400 g", 35.0)),
    _p("Eggs", "Farm Fresh", ("6 pcs", 54.0), ("12 pcs", 99.0)),
    _p("Toned Milk", "Nandini", ("500 ml", 26.0), ("1 l", 50.0)),
    _p("Cow Ghee", "Amul", ("200 ml", 140.0), ("500 ml", 320.0)),
    _p("Cauliflower", "Fresho", ("1 pc (approx. 400-600 g)", 35.0)),
    _p("Green Chilli", "Fresho", ("100 g", 12.0)),
    _p("Coriander Leaves", "Fresho", ("1 bunch", 10.0)),
    _p("Curry Leaves", "Fresho", ("1 bunch", 8.0)),
    _p("Lemon", "Fresho", ("4 pcs", 24.0)),
    _p("Peanuts", "Tata Sampann", ("500 g", 85.0)),
    _p("Thick Poha", "Tata Sampann", ("500 g", 48.0)),
    _p("Semolina Rava", "Aashirvaad", ("500 g", 42.0)),
    _p("Carrot", "Fresho", ("500 g", 30.0)),
    _p("Green Peas", "Safal", ("500 g", 75.0)),
    _p("Spring Onion", "Fresho", ("1 bunch", 15.0)),
    _p("Butter", "Amul", ("100 g", 58.0)),
    _p("Ginger Garlic Paste", "Smith & Jones", ("200 g", 45.0)),
    _p("Sunflower Oil", "Fortune", ("1 l", 155.0)),
    _p("Brown Bread", "Britannia", ("1 pc (400 g)", 50.0)),
]


class FixtureGroceryProvider:
    """Deterministic sample catalogue. Clearly labelled as sample prices wherever it is shown."""

    name = "fixture"

    def __init__(self, catalogue: Optional[list[ProviderProduct]] = None) -> None:
        self.catalogue = catalogue if catalogue is not None else FIXTURE_CATALOGUE

    async def search(self, query: str, address_id: Optional[str]) -> list[ProviderProduct]:
        scored = sorted(((ingredient_match_confidence(p.name, query), p) for p in self.catalogue), key=lambda x: -x[0])
        return [p for score, p in scored if score > 0][:5]


# ── Instamart adapter ───────────────────────────────────────────────────────
def _price(raw: Any) -> Optional[float]:
    if isinstance(raw, dict):
        raw = _first(raw, "offerPrice", "mrp")
    try:
        return float(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


class InstamartKitchenCircleAdapter:
    name = "instamart"

    def __init__(self, token: Optional[str], client: Optional[SwiggyMCPClient] = None) -> None:
        self.client = client or SwiggyMCPClient(token=token, mcp_url=settings.swiggy_instamart_mcp_url)
        self.orders = InstamartOrderService(client=self.client)

    async def search(self, query: str, address_id: Optional[str]) -> list[ProviderProduct]:
        raw = await self.client.call_tool("search_products", {"addressId": address_id, "query": query})
        data = _unwrap_envelope(raw) or {}
        rows = _as_list(data, "products") if isinstance(data, dict) else []
        products: list[ProviderProduct] = []
        for row in rows:
            name = _first(row, "displayName", "name")
            if not str(name or "").strip():
                continue
            available = row.get("inStock", True) is not False and row.get("isAvail", True) is not False
            variations = []
            for v in _as_list(row, "variations"):
                spin = _first(v, "spinId", "spin_id")
                if spin is None:
                    continue
                stocked = v.get("isInStockAndAvailable")
                cap = _first(v, "maxQuantity")
                variations.append(ProviderVariation(
                    spin_id=str(spin), sku_id=str(_first(v, "skuId", "sku_id")) if _first(v, "skuId", "sku_id") is not None else None,
                    label=str(_first(v, "quantityDescription", "quantity") or ""), price=_price(_first(v, "price", "offerPrice")),
                    in_stock=available and stocked is not False, max_quantity=int(cap) if isinstance(cap, (int, float)) else None,
                ))
            products.append(ProviderProduct(str(name), _first(row, "brand"), available, variations))
        return products

    async def addresses(self) -> list[AddressOption]:
        raw = await self.client.call_tool("get_addresses", {})
        data = _unwrap_envelope(raw) or {}
        rows = _as_list(data, "addresses") if isinstance(data, dict) else []
        # Phone numbers are personal data and never leave this adapter.
        return [AddressOption(id=str(r["id"]), label=str(r.get("addressLine") or "Saved address"), tag=r.get("addressTag") or r.get("addressCategory"))
                for r in rows if r.get("id") is not None]

    async def write_cart(self, address_id: str, items: list[CartItem]) -> CartWriteResponse:
        payload = [{"spinId": i.spin_id, "quantity": i.quantity, **({"skuId": i.sku_id} if i.sku_id else {})} for i in items]
        raw = await self.client.call_tool("update_cart", {"selectedAddressId": address_id, "items": payload})
        data = _unwrap_envelope(raw) or {}
        data = data if isinstance(data, dict) else {}
        removed = [str(_first(r, "itemName", "displayName", "name") or _first(r, "spinId") or "item") for r in _as_list(data, "removedOutOfStockItems")]
        reduced = [{"spin_id": _first(r, "spinId"), "item": _first(r, "itemName"), "requested": _first(r, "requestedQuantity"),
                    "capped": _first(r, "cappedQuantity"), "reason": _first(r, "reason")} for r in _as_list(data, "reducedQuantityItems")]
        cart = await self.orders.get_cart(address_id)
        return CartWriteResponse(success=cart.success, total=cart.total, items=[line.model_dump() for line in cart.items],
                                 removed_out_of_stock=removed, reduced_quantity=reduced, error=cart.error)


def provider_for(name: str, token: Optional[str]) -> KitchenCircleGroceryProvider:
    return InstamartKitchenCircleAdapter(token) if name == "instamart" else FixtureGroceryProvider()
