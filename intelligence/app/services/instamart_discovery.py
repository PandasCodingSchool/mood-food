"""Instamart product search + ingredient matching.

Adapts the confidence-scoring approach already used for Food menu matching
(swiggy_discovery.dish_words / match_confidence) to grocery products: score
word-overlap between the ingredient name and each candidate product name, pick
the best-scored in-stock variation, and never silently fall back to
products[0] the way the exploratory notebook did — an ingredient with no
confident match comes back as matched=False so the UI can flag it instead of
adding a wrong item to the cart.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.config import settings
from app.schemas.instamart import InstamartProduct, InstamartVariation, MatchedIngredient
from app.schemas.recipe import Ingredient
from app.services.swiggy_discovery import _as_list, _first, _unwrap_envelope, dish_words
from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPClient, SwiggyMCPError

logger = logging.getLogger("instamart_discovery")

# Lower bar than menu-item matching (grocery names are shorter/simpler, and a
# wrong grocery pick is a removable cart line, not a placed dish order).
_MATCH_CONFIDENCE_THRESHOLD = 1.5

_GENERIC_WORDS = {"fresh", "pack", "pieces", "piece", "combo"}


def _singularize(word: str) -> str:
    """Crude plural stripping — 'potatoes' vs 'Potato (Batate)' must overlap."""
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith("oes") and len(word) > 4:
        return word[:-2]
    if word.endswith("es") and len(word) > 4:
        return word[:-2]
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]
    return word


def _stemmed_words(name: str) -> set[str]:
    return {_singularize(w) for w in dish_words(name)}


def ingredient_match_confidence(product_name: str, ingredient_name: str) -> float:
    """Weighted confidence for a grocery product name vs an ingredient name."""
    p_words = _stemmed_words(product_name)
    i_words = _stemmed_words(ingredient_name)
    if not i_words:
        return 0.0

    overlap = p_words & i_words
    score = len(overlap) * 3.0

    pn = product_name.strip().lower()
    inm = ingredient_name.strip().lower()
    if pn == inm:
        score += 6.0
    elif inm in pn or pn in inm:
        score += 3.0

    distinctive = overlap - _GENERIC_WORDS
    if len(i_words) >= 2 and not distinctive and len(overlap) < 2:
        return 0.0
    return score


def _normalize_variation(raw: dict, fallback_image_url: Optional[str] = None) -> Optional[InstamartVariation]:
    spin_id = _first(raw, "spinId", "spin_id")
    if spin_id is None:
        return None
    sku_id = _first(raw, "skuId", "sku_id")
    # Real responses nest price as {offerPrice, mrp} (confirmed against the
    # Instamart notebook's display_cart helper) even though the docs' example
    # shows a flat number — handle both.
    price_raw = _first(raw, "price", "offerPrice", "finalPrice")
    if isinstance(price_raw, dict):
        price_raw = _first(price_raw, "offerPrice", "mrp")
    image_url = _first(raw, "imageUrl", "image_url", "cloudinaryImageId") or fallback_image_url
    return InstamartVariation(
        spin_id=str(spin_id),
        sku_id=str(sku_id) if sku_id is not None else None,
        quantity=_first(raw, "quantity", "quantityDescription"),
        price=float(price_raw) if price_raw is not None else None,
        stock=bool(raw.get("stock", True)) if "stock" in raw else None,
        image_url=str(image_url) if image_url else None,
    )


def _normalize_product(raw: dict) -> Optional[InstamartProduct]:
    name = _first(raw, "name", "displayName")
    if not str(name or "").strip():
        return None
    # Some responses put the image on the product, others on each variation —
    # pass the product-level image down as a fallback for variations without one.
    product_image = _first(raw, "imageUrl", "image_url", "cloudinaryImageId")
    variations = [
        v for v in (_normalize_variation(r, product_image) for r in _as_list(raw, "variations"))
        if v is not None
    ]
    return InstamartProduct(
        name=str(name),
        brand=_first(raw, "brand"),
        availability=bool(raw.get("availability", True)),
        variations=variations,
    )


def _best_variation(product: InstamartProduct) -> Optional[InstamartVariation]:
    in_stock = [v for v in product.variations if v.stock is not False]
    pool = in_stock or product.variations
    if not pool:
        return None
    priced = [v for v in pool if v.price is not None]
    return min(priced, key=lambda v: v.price) if priced else pool[0]


class InstamartDiscoveryService:
    def __init__(self, client: Optional[SwiggyMCPClient] = None, token: Optional[str] = None) -> None:
        self.client = client or SwiggyMCPClient(token=token, mcp_url=settings.swiggy_instamart_mcp_url)

    async def search_products(self, query: str, address_id: str) -> list[InstamartProduct]:
        raw = await self.client.call_tool("search_products", {"addressId": address_id, "query": query})
        data = _unwrap_envelope(raw) or {}
        if not isinstance(data, dict):
            data = {}
        rows = _as_list(data, "products")
        products = [p for p in (_normalize_product(r) for r in rows) if p is not None]
        if not products:
            similar_rows = _as_list(data, "similarProducts")
            products = [p for p in (_normalize_product(r) for r in similar_rows) if p is not None]
        return products

    async def match_ingredient(self, ingredient: Ingredient, address_id: str) -> MatchedIngredient:
        try:
            products = await self.search_products(ingredient.name, address_id)
        except SwiggyAuthError:
            raise  # never swallow auth failures — same rule as Food discovery
        except SwiggyMCPError as exc:
            if "address" in str(exc).lower():
                # A bad/unknown addressId fails every ingredient the same way —
                # surface it once as a batch-level error instead of reporting
                # the whole recipe as "no confident matches".
                raise
            logger.warning("match_ingredient(%r) search failed: %s", ingredient.name, exc)
            return MatchedIngredient(ingredient=ingredient, matched=False, confidence=0.0)
        except Exception as exc:  # noqa: BLE001 - surface as a plain not-matched result
            logger.warning("match_ingredient(%r) search failed: %s", ingredient.name, exc)
            return MatchedIngredient(ingredient=ingredient, matched=False, confidence=0.0)

        best_product: Optional[InstamartProduct] = None
        best_score = 0.0
        for product in products:
            score = ingredient_match_confidence(product.name, ingredient.name)
            if score > best_score:
                best_score = score
                best_product = product

        if best_product is None or best_score < _MATCH_CONFIDENCE_THRESHOLD:
            return MatchedIngredient(ingredient=ingredient, matched=False, confidence=best_score)

        variation = _best_variation(best_product)
        if variation is None:
            return MatchedIngredient(ingredient=ingredient, matched=False, confidence=best_score)

        return MatchedIngredient(
            ingredient=ingredient,
            matched=True,
            confidence=best_score,
            product=best_product,
            variation=variation,
        )

    async def match_ingredients(
        self, ingredients: list[Ingredient], address_id: str
    ) -> list[MatchedIngredient]:
        results: list[MatchedIngredient] = []
        async with self.client.session():
            for ingredient in ingredients:
                results.append(await self.match_ingredient(ingredient, address_id))
        return results
