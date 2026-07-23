"""High-level Swiggy discovery logic (Phase 1).

Resolves a delivery address, searches restaurants/menu items, and enriches
MoodFood recommendations with real Swiggy matches. Wraps SwiggyMCPClient and
normalises the loosely-typed tool output into our schema models.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

from app.config import settings
from app.schemas.swiggy import (
    EnrichDishInput,
    EnrichedMatch,
    SwiggyAlt,
    SwiggyMenuItem,
    SwiggyRestaurant,
)
from app.services.dish_tier import TierClassifyInput, _keyword_fallback
from app.services.menu_scout import ScoutCandidateInput, ScoutDishInput, scout_ambiguous_matches
from app.services.swiggy_mcp import (
    SwiggyAddressRequiredError,
    SwiggyAuthError,
    SwiggyMCPClient,
    SwiggyMCPError,
)

logger = logging.getLogger("swiggy_discovery")

# Short TTL enrich cache: (address_id, dish_id) -> (expires_at, EnrichedMatch)
_ENRICH_TTL_S = 120.0
_ENRICH_CACHE: dict[tuple[str, str], tuple[float, EnrichedMatch]] = {}
_MATCH_CONFIDENCE_THRESHOLD = 4.0
# Main accepted any positive word-overlap item as a live Swiggy fill. Keep that
# floor for "closest" fallbacks while reserving the higher threshold for exact hits.
_CLOSEST_MIN_SCORE = 1.5


def _first(d: dict, *keys: str, default: Any = None) -> Any:
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def _unwrap_envelope(raw: Any) -> Any:
    """Unwrap the documented {success, data, message} envelope.

    MCP structuredContent usually returns the payload directly (e.g.
    {'restaurants': [...]}), but the tool contract also defines a
    {success, data, message} wrapper — handle both.
    """
    if (
        isinstance(raw, dict)
        and isinstance(raw.get("data"), (dict, list))
        and ("success" in raw or "message" in raw or "error" in raw)
    ):
        return raw["data"]
    return raw


def _as_list(raw: Any, *keys: str) -> list[dict]:
    """Pull a list of dicts out of a tool result that may be wrapped under a key."""
    raw = _unwrap_envelope(raw)
    if isinstance(raw, list):
        return [r for r in raw if isinstance(r, dict)]
    if isinstance(raw, dict):
        for k in keys:
            val = raw.get(k)
            if isinstance(val, list):
                return [r for r in val if isinstance(r, dict)]
        # Fall back to the first list value in the dict.
        for val in raw.values():
            if isinstance(val, list):
                return [r for r in val if isinstance(r, dict)]
    return []


def normalize_restaurant(raw: dict) -> Optional[SwiggyRestaurant]:
    # Real Swiggy search_restaurants shape (confirmed):
    #   id, name, cuisines[], avgRating, totalRatings, costForTwo ("₹600 for two"),
    #   areaName, distanceKm, deliveryTimeMinutes, deliveryTimeRange, offer,
    #   imageUrl, availabilityStatus ("OPEN")
    rid = _first(raw, "id", "restaurantId", "restaurant_id")
    name = _first(raw, "name", "restaurantName", "restaurant_name")
    if rid is None or name is None:
        return None
    eta = _first(
        raw, "deliveryTimeMinutes", "eta_min", "etaMinutes", "deliveryTime",
        "delivery_time_min", "sla",
    )
    status = _first(raw, "availabilityStatus", "availability_status", "status")
    is_open = True if status is None else str(status).upper() == "OPEN"
    cuisines = _first(raw, "cuisines", "cuisine", default=[])
    if isinstance(cuisines, str):
        cuisines = [cuisines]
    return SwiggyRestaurant(
        id=str(rid),
        name=str(name),
        rating=_to_float(_first(raw, "avgRating", "rating", "avg_rating")),
        eta_min=_to_int(eta),
        distance_km=_to_float(_first(raw, "distanceKm", "distance_km", "distance")),
        cuisines=[str(c) for c in cuisines] if isinstance(cuisines, list) else [],
        image_url=_first(raw, "imageUrl", "image_url", "cloudinaryImageId", "image"),
        is_open=is_open,
        cost_for_two=_parse_price_int(_first(raw, "costForTwo", "cost_for_two", "cft")),
    )


def normalize_menu_item(raw: dict) -> Optional[SwiggyMenuItem]:
    iid = _first(raw, "id", "itemId", "item_id", "menu_item_id")
    name = _first(raw, "name", "itemName", "item_name", "dishName")
    if iid is None or name is None:
        return None
    veg = _first(raw, "is_veg", "isVeg", "veg")
    return SwiggyMenuItem(
        id=str(iid),
        name=str(name),
        price=_to_float(_first(raw, "price", "finalPrice", "defaultPrice", "amount", "cost")),
        image_url=_first(raw, "image_url", "imageUrl", "image"),
        is_veg=bool(veg) if veg is not None else None,
        rating=_to_float(_first(raw, "rating", "avgRating")),
        description=_to_str(_first(raw, "description", "desc")),
        restaurant_id=_to_str(_first(raw, "restaurant_id", "restaurantId")),
        restaurant_name=_to_str(_first(raw, "restaurant_name", "restaurantName")),
        eta_min=_to_int(_first(raw, "eta_min", "deliveryTime", "sla")),
    )


def _extract_menu_items(raw: Any, restaurant_id: Optional[str] = None) -> list[SwiggyMenuItem]:
    """Walk a get_restaurant_menu response and collect orderable items.

    The menu nests items under categories (shape not fully documented), so we
    recurse and treat any dict that has a name + a price-like field as an item.
    """
    raw = _unwrap_envelope(raw)
    found: list[SwiggyMenuItem] = []

    def looks_like_item(node: dict) -> bool:
        has_name = any(k in node for k in ("name", "itemName", "item_name", "dishName"))
        has_price = any(
            k in node and node[k] is not None
            for k in ("price", "finalPrice", "defaultPrice", "amount", "cost")
        )
        has_id = any(k in node for k in ("id", "itemId", "item_id", "menu_item_id"))
        return has_name and has_price and has_id

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if looks_like_item(node):
                mi = normalize_menu_item(node)
                if mi is not None and mi.price is not None:
                    if mi.restaurant_id is None and restaurant_id:
                        mi.restaurant_id = restaurant_id
                    found.append(mi)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for x in node:
                walk(x)

    walk(raw)
    return found


def _to_float(v: Any) -> Optional[float]:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _to_int(v: Any) -> Optional[int]:
    try:
        return int(float(v)) if v is not None else None
    except (TypeError, ValueError):
        return None


def _to_str(v: Any) -> Optional[str]:
    return str(v) if v is not None else None


def _parse_price_int(v: Any) -> Optional[int]:
    """Extract the rupee number from values like '₹600 for two' or 600."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return int(v)
    digits = "".join(ch for ch in str(v) if ch.isdigit())
    return int(digits) if digits else None


class SwiggyDiscoveryService:
    def __init__(
        self,
        client: Optional[SwiggyMCPClient] = None,
        token: Optional[str] = None,
    ) -> None:
        self.client = client or SwiggyMCPClient(token=token)
        # Per-request memoisation: the 3 recommendations enrich concurrently and
        # frequently hit the same category searches / restaurant menus. Dedupe via
        # shared tasks so each (query) and (restaurantId) is fetched at most once.
        self._search_tasks: dict[str, "asyncio.Task[list[SwiggyRestaurant]]"] = {}
        self._menu_tasks: dict[str, "asyncio.Task[list[SwiggyMenuItem]]"] = {}
        self._tier_tasks: dict[str, "asyncio.Task[dict[str, str]]"] = {}

    async def list_addresses(self) -> list[dict]:
        """Return the account's saved delivery addresses (id, label, line)."""
        raw = await self.client.call_tool("get_addresses", {})
        out: list[dict] = []
        for a in _as_list(raw, "addresses", "data"):
            aid = _first(a, "id", "addressId", "address_id")
            if aid is None:
                continue
            out.append({
                "id": str(aid),
                "label": str(_first(a, "addressTag", "addressCategory", "label", default="Address")),
                "line": str(_first(a, "addressLine", "address", "line", default="")),
            })
        return out

    async def resolve_address_id(
        self, city: Optional[str] = None, address_id: Optional[str] = None
    ) -> str:
        """Pick a delivery addressId for discovery.

        Priority: explicit address_id -> city map -> default-city map ->
        first saved address on the bootstrap account (get_addresses).
        """
        if address_id:
            logger.info("resolve_address_id: using explicit addressId=%s", address_id)
            return address_id

        city_map = settings.swiggy_city_addresses
        if city and city.lower() in city_map:
            logger.info("resolve_address_id: city %r -> addressId=%s", city, city_map[city.lower()])
            return city_map[city.lower()]
        if settings.swiggy_default_city and settings.swiggy_default_city.lower() in city_map:
            addr = city_map[settings.swiggy_default_city.lower()]
            logger.info("resolve_address_id: default city -> addressId=%s", addr)
            return addr

        if not settings.swiggy_address_retrieval_enabled:
            logger.info(
                "resolve_address_id: no city match (city=%r, map keys=%s) and live "
                "address retrieval is disabled — raising SwiggyAddressRequiredError",
                city, list(city_map.keys()),
            )
            raise SwiggyAddressRequiredError(
                "User address not retrieved yet (set SWIGGY_ADDRESS_RETRIEVAL_ENABLED "
                "to fetch it live, or configure SWIGGY_CITY_ADDRESS_MAP)."
            )

        # Last resort: ask Swiggy for the account's saved addresses.
        logger.info(
            "resolve_address_id: no city match (city=%r, map keys=%s) — falling back to get_addresses",
            city, list(city_map.keys()),
        )
        raw = await self.client.call_tool("get_addresses", {})
        addresses = _as_list(raw, "addresses", "data")
        if not addresses:
            raise SwiggyMCPError("No delivery address available (configure SWIGGY_CITY_ADDRESS_MAP).")
        # Real get_addresses shape: {id, addressLine, addressCategory, addressTag}.
        # Home is addressCategory/addressTag == "Home".
        home = next(
            (
                a for a in addresses
                if "home" in str(_first(a, "addressCategory", "addressTag", "label", "type", default="")).lower()
            ),
            addresses[0],
        )
        addr_id = _first(home, "id", "addressId", "address_id")
        if addr_id is None:
            raise SwiggyMCPError("Resolved address has no id.")
        logger.info(
            "resolve_address_id: picked %s (%s)",
            addr_id, _first(home, "addressTag", "addressCategory", default="?"),
        )
        return str(addr_id)

    async def search_restaurants(
        self, query: str, city: Optional[str] = None, address_id: Optional[str] = None
    ) -> tuple[str, list[SwiggyRestaurant]]:
        addr = await self.resolve_address_id(city, address_id)
        logger.info("search_restaurants query=%r addressId=%s", query, addr)
        raw = await self.client.call_tool(
            "search_restaurants", {"addressId": addr, "query": query}
        )
        rows = _as_list(raw, "restaurants", "data")
        restaurants = [
            r for r in (normalize_restaurant(x) for x in rows)
            if r is not None and r.is_open
        ]
        _log_extraction("restaurants", query, rows, restaurants)
        return addr, restaurants

    async def search_menu(
        self, query: str, city: Optional[str] = None, address_id: Optional[str] = None
    ) -> tuple[str, list[SwiggyMenuItem]]:
        addr = await self.resolve_address_id(city, address_id)
        logger.info("search_menu query=%r addressId=%s", query, addr)
        raw = await self.client.call_tool(
            "search_menu", {"addressId": addr, "query": query}
        )
        rows = _as_list(raw, "items", "results", "data")
        items = [
            i for i in (normalize_menu_item(x) for x in rows)
            if i is not None
        ]
        _log_extraction("menu items", query, rows, items)
        return addr, items

    async def _menu_items(self, restaurant_id: str, addr: str) -> list[SwiggyMenuItem]:
        """Cached: fetch + extract a restaurant's menu items (once per request)."""
        task = self._menu_tasks.get(restaurant_id)
        if task is None:
            task = asyncio.create_task(self._fetch_menu_items(restaurant_id, addr))
            self._menu_tasks[restaurant_id] = task
        return await task

    async def _fetch_menu_items(self, restaurant_id: str, addr: str) -> list[SwiggyMenuItem]:
        try:
            raw = await self.client.call_tool(
                "get_restaurant_menu",
                {"restaurantId": restaurant_id, "addressId": addr, "page": 1, "pageSize": 8},
            )
        except (SwiggyMCPError, SwiggyAuthError) as exc:
            logger.warning("enrich: menu fetch failed for restaurant %s: %s", restaurant_id, exc)
            return []
        items = _extract_menu_items(raw, restaurant_id)
        if not items:
            logger.warning("enrich: no menu items extracted for restaurant %s", restaurant_id)
        return items

    async def _menu_item_tiers(self, restaurant_id: str, items: list[SwiggyMenuItem]) -> dict[str, str]:
        """Cached keyword tiers — skip LLM on the hot path for latency."""
        task = self._tier_tasks.get(restaurant_id)
        if task is None:
            async def _run() -> dict[str, str]:
                return _keyword_fallback([
                    TierClassifyInput(id=i.id, name=i.name, description=i.description)
                    for i in items
                ])
            task = asyncio.create_task(_run())
            self._tier_tasks[restaurant_id] = task
        return await task

    async def _best_menu_item(
        self,
        restaurant_id: str,
        addr: str,
        dish: EnrichDishInput,
    ) -> Optional[tuple[SwiggyMenuItem, float]]:
        """Return (best item, confidence) or None if below threshold."""
        items = await self._menu_items(restaurant_id, addr)
        return _best_confident_match(items, dish)

    async def _best_borderline_menu_item(
        self,
        restaurant_id: str,
        addr: str,
        dish: EnrichDishInput,
    ) -> Optional[tuple[SwiggyMenuItem, float]]:
        """Return best borderline item from the (cached) restaurant menu, or None."""
        items = await self._menu_items(restaurant_id, addr)
        return _best_borderline_match(items, dish)

    async def _best_closest_menu_item(
        self,
        restaurant_id: str,
        addr: str,
        dish: EnrichDishInput,
    ) -> Optional[tuple[SwiggyMenuItem, float]]:
        """Return best non-conflicting closest item from the restaurant menu."""
        items = await self._menu_items(restaurant_id, addr)
        return _best_closest_match(items, dish)

    async def _real_restaurants(self, query: str, addr: str) -> list[SwiggyRestaurant]:
        """Cached: search and keep only genuine OPEN restaurant cards.

        Dish-name results (returned for specific dish queries) have no rating/ETA
        and empty cuisines — filter those out so we only surface real restaurants.
        """
        task = self._search_tasks.get(query)
        if task is None:
            task = asyncio.create_task(self._fetch_real_restaurants(query, addr))
            self._search_tasks[query] = task
        return await task

    async def _fetch_real_restaurants(self, query: str, addr: str) -> list[SwiggyRestaurant]:
        _, results = await self.search_restaurants(query, address_id=addr)
        return [
            r for r in results
            if r.is_open and (r.rating is not None or r.eta_min is not None or r.cuisines)
        ]

    async def get_restaurant_menu(
        self,
        restaurant_id: str,
        city: Optional[str] = None,
        address_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 5,
    ) -> Any:
        # get_restaurant_menu requires addressId (for delivery context) plus
        # restaurantId, with page/pageSize (max 8) pagination.
        addr = await self.resolve_address_id(city, address_id)
        logger.info("get_restaurant_menu restaurantId=%s addressId=%s page=%d", restaurant_id, addr, page)
        return await self.client.call_tool(
            "get_restaurant_menu",
            {
                "restaurantId": restaurant_id,
                "addressId": addr,
                "page": page,
                "pageSize": min(page_size, 8),
            },
        )

    async def enrich(
        self,
        dishes: list[EnrichDishInput],
        city: Optional[str] = None,
        address_id: Optional[str] = None,
    ) -> tuple[str, list[EnrichedMatch]]:
        """For each dish, find a Swiggy item (exact menu first, then closest fill)."""
        drill_budget = 3

        # dish_id -> (best borderline item, its restaurant, score) — filled by inner fns
        _scout_candidates: dict[str, tuple[SwiggyMenuItem, Optional[SwiggyRestaurant], float]] = {}

        async def match_via_menu_search(dish: EnrichDishInput) -> Optional[EnrichedMatch]:
            """Exact-first: search_menu with name + aliases; accept closest fill."""
            queries = [dish.name, *(dish.aliases or [])]
            seen_q: set[str] = set()
            best: Optional[tuple[float, SwiggyMenuItem]] = None
            closest: Optional[tuple[float, SwiggyMenuItem]] = None
            for q in queries:
                key = q.strip().lower()
                if not key or key in seen_q:
                    continue
                seen_q.add(key)
                try:
                    _, items = await self.search_menu(q, address_id=addr)
                except (SwiggyMCPError, SwiggyAuthError) as exc:
                    logger.warning("enrich: search_menu failed for %r: %s", q, exc)
                    continue
                hit = _best_confident_match(items, dish)
                if hit is not None:
                    item, conf = hit
                    if best is None or conf > best[0]:
                        best = (conf, item)
                    if conf >= _MATCH_CONFIDENCE_THRESHOLD + 2:
                        break
                    continue
                near = _best_closest_match(items, dish)
                if near is not None:
                    item, conf = near
                    if closest is None or conf > closest[0]:
                        closest = (conf, item)
                        bl_rest = SwiggyRestaurant(
                            id=item.restaurant_id or f"menu:{item.id}",
                            name=item.restaurant_name or "Swiggy Restaurant",
                            rating=item.rating,
                            eta_min=item.eta_min,
                            is_open=True,
                        )
                        existing = _scout_candidates.get(dish.id)
                        if existing is None or conf > existing[2]:
                            _scout_candidates[dish.id] = (item, bl_rest, conf)
            chosen = best or closest
            if chosen is None:
                return None
            conf, item = chosen
            restaurant = SwiggyRestaurant(
                id=item.restaurant_id or f"menu:{item.id}",
                name=item.restaurant_name or "Swiggy Restaurant",
                rating=item.rating,
                eta_min=item.eta_min,
                is_open=True,
            )
            logger.info(
                "enrich: menu-search dish %r -> %r @ %r ₹%s (conf=%.1f)",
                dish.name, item.name, restaurant.name, item.price, conf,
            )
            return EnrichedMatch(
                dish_id=dish.id, matched=True, restaurant=restaurant, item=item,
            )

        async def match_via_restaurants(dish: EnrichDishInput, idx: int) -> EnrichedMatch:
            """Category/cuisine restaurant search — no exclusive claiming.

            Multiple concurrent dish lookups may check the same restaurant;
            the per-restaurant menu fetch is already cached via _menu_tasks,
            so shared broad-category searches incur at most one menu API call
            per restaurant (not one per dish).

            Exact dish names are excluded from restaurant queries: search_menu
            already tried them, and search_restaurants returns item-shaped cards.
            """
            best: Optional[tuple[float, SwiggyRestaurant, SwiggyMenuItem]] = None
            closest: Optional[tuple[float, SwiggyRestaurant, SwiggyMenuItem]] = None
            remaining = drill_budget
            seen_restaurants: set[str] = set()

            for query in _restaurant_queries(dish):
                if remaining <= 0:
                    break
                try:
                    reals = await self._real_restaurants(query, addr)
                except (SwiggyMCPError, SwiggyAuthError) as exc:
                    logger.warning("enrich: search failed for %r: %s", query, exc)
                    continue
                if not reals:
                    continue

                # Stable top ordering so concurrent same-category dishes share menus.
                pool = reals
                tried = 0
                for restaurant in pool:
                    if remaining <= 0 or tried >= 2:
                        break
                    if restaurant.id in seen_restaurants:
                        continue
                    seen_restaurants.add(restaurant.id)
                    tried += 1
                    remaining -= 1
                    hit = await self._best_menu_item(restaurant.id, addr, dish)
                    if hit is not None:
                        item, conf = hit
                        if best is None or conf > best[0]:
                            best = (conf, restaurant, item)
                        if conf >= _MATCH_CONFIDENCE_THRESHOLD + 2:
                            remaining = 0
                            break
                        continue
                    near = await self._best_closest_menu_item(restaurant.id, addr, dish)
                    if near is None:
                        continue
                    item, conf = near
                    if closest is None or conf > closest[0]:
                        closest = (conf, restaurant, item)
                        existing = _scout_candidates.get(dish.id)
                        if existing is None or conf > existing[2]:
                            _scout_candidates[dish.id] = (item, restaurant, conf)
                if best is not None and best[0] >= _MATCH_CONFIDENCE_THRESHOLD:
                    break

            chosen = best or closest
            if chosen is not None:
                conf, restaurant, item = chosen
                logger.info(
                    "enrich: dish %r -> %r @ %r ₹%s (conf=%.1f)",
                    dish.name, item.name, restaurant.name, item.price, conf,
                )
                return EnrichedMatch(
                    dish_id=dish.id, matched=True, restaurant=restaurant, item=item,
                )
            # Last resort: accept a previously queued closest candidate.
            queued = _scout_candidates.get(dish.id)
            if queued is not None:
                item, restaurant, conf = queued
                logger.info(
                    "enrich: closest-fill dish %r -> %r @ %r ₹%s (conf=%.1f)",
                    dish.name, item.name,
                    restaurant.name if restaurant else "?",
                    item.price, conf,
                )
                return EnrichedMatch(
                    dish_id=dish.id, matched=True, restaurant=restaurant, item=item,
                )
            logger.info("enrich: no confident match for dish %r", dish.name)
            return EnrichedMatch(dish_id=dish.id, matched=False)

        async def match_one(dish: EnrichDishInput, idx: int) -> EnrichedMatch:
            cache_key = (addr, dish.id)
            cached = _ENRICH_CACHE.get(cache_key)
            if cached and cached[0] > time.time():
                logger.info("enrich: cache hit for dish %s @ %s", dish.id, addr)
                return cached[1].model_copy()

            menu_hit = await match_via_menu_search(dish)
            result = menu_hit if menu_hit is not None else await match_via_restaurants(dish, idx)
            if result.matched:
                _ENRICH_CACHE[cache_key] = (time.time() + _ENRICH_TTL_S, result.model_copy())
            return result

        async with self.client.session():
            addr = await self.resolve_address_id(city, address_id)
            matches = await asyncio.gather(*(match_one(d, i) for i, d in enumerate(dishes)))

            # Scout pass: one batched LLM call for all borderline unmatched candidates.
            unmatched_ids = {m.dish_id for m in matches if not m.matched}
            scout_pairs = [
                (
                    ScoutDishInput(
                        dish_id=d.id,
                        dish_name=d.name,
                        aliases=list(d.aliases or []),
                        cuisine=d.cuisine,
                    ),
                    ScoutCandidateInput(
                        item_id=_scout_candidates[d.id][0].id,
                        item_name=_scout_candidates[d.id][0].name,
                        description=_scout_candidates[d.id][0].description,
                        is_veg=_scout_candidates[d.id][0].is_veg,
                        price=_scout_candidates[d.id][0].price,
                        restaurant_name=(
                            _scout_candidates[d.id][1].name if _scout_candidates[d.id][1] else None
                        ),
                    ),
                )
                for d in dishes
                if d.id in unmatched_ids and d.id in _scout_candidates
            ]
            if scout_pairs:
                scout_decisions = await scout_ambiguous_matches(scout_pairs)
                for d in dishes:
                    if d.id not in unmatched_ids or d.id not in _scout_candidates:
                        continue
                    bl_item, bl_restaurant, _ = _scout_candidates[d.id]
                    decision = scout_decisions.get((d.id, bl_item.id))
                    if decision is None:
                        continue
                    for m in matches:
                        if m.dish_id == d.id:
                            m.matched = True
                            m.item = bl_item
                            m.restaurant = bl_restaurant
                            logger.info(
                                "menu_scout: accepted dish %r -> %r @ %r (scout_conf=%.2f, %s)",
                                d.name, bl_item.name,
                                bl_restaurant.name if bl_restaurant else "?",
                                decision.confidence, decision.reason,
                            )
                            break

            used_alt_ids: set[str] = {m.item.id for m in matches if m.matched and m.item}
            for m in matches:
                if not (m.matched and m.item and m.restaurant):
                    continue
                # Menu-search matches may lack a real restaurant menu cache key.
                if m.restaurant.id.startswith("menu:"):
                    continue
                all_items = await self._menu_items(m.restaurant.id, addr)
                tiers = await self._menu_item_tiers(m.restaurant.id, all_items)
                alts = _pick_swiggy_alternatives(m.item, all_items, tiers, exclude_ids=used_alt_ids)
                m.swiggy_alternatives = alts
                used_alt_ids.update(a.item.id for a in alts)

        matched_count = sum(1 for m in matches if m.matched)
        logger.info("enrich: matched %d/%d dishes (addressId=%s)", matched_count, len(dishes), addr)
        return addr, list(matches)


# Keywords that suggest a lighter / healthier preparation.
_LIGHTER_HINTS = {
    "salad", "soup", "bowl", "wrap", "grilled", "steamed", "steam",
    "toast", "oats", "lite", "light", "veg", "garden", "fresh", "fruit",
}
# Keywords that suggest a heavier / indulgent preparation.
_HEAVIER_HINTS = {
    "smash", "smashed", "loaded", "double", "triple", "fried", "fry",
    "crispy", "butter", "cream", "creamy", "cheese", "cheesy",
}


def _lighter_score(item: SwiggyMenuItem) -> int:
    """Positive = lighter, negative = heavier. Used to pick a healthier alt."""
    name_l = item.name.lower()
    return (
        sum(1 for h in _LIGHTER_HINTS if h in name_l)
        - sum(1 for h in _HEAVIER_HINTS if h in name_l)
    )


def _pick_swiggy_alternatives(
    main_item: SwiggyMenuItem,
    all_items: list[SwiggyMenuItem],
    tiers: dict[str, str],
    exclude_ids: set[str] | frozenset[str] = frozenset(),
) -> list[SwiggyAlt]:
    """Pick up to 2 real-menu alternatives from the matched restaurant.

    - healthier: item with the best lighter_score (proxy for less heavy),
      tie-broken by lower price. Must differ from main_item.
    - budget: cheapest item strictly cheaper than main_item, distinct from the
      healthier pick. Omitted if nothing cheaper — falls back to the cheapest
      item priced 10-15% above main_item (same tier), so a "cheaper" swap never
      surfaces a wildly mismatched price tier.

    Complimentary items (breads, pickles, accompaniment salads) are excluded
    entirely — nobody orders them as a standalone dish — and candidates are
    restricted to the same tier as main_item.
    """
    main_tier = tiers.get(main_item.id, "main")
    others = [
        i for i in all_items
        if i.id != main_item.id and i.id not in exclude_ids
        and i.price is not None and i.price > 0
        and tiers.get(i.id, "main") == main_tier
    ]
    if not others:
        return []

    alts: list[SwiggyAlt] = []
    healthier = max(others, key=lambda i: (_lighter_score(i), -(i.price or 0)))
    alts.append(SwiggyAlt(type="healthier", item=healthier))

    main_price = main_item.price or 0
    candidates = [i for i in others if i.id != healthier.id]
    cheaper = [i for i in candidates if (i.price or 0) < main_price]
    if cheaper:
        budget = min(cheaper, key=lambda i: i.price or 0)
        alts.append(SwiggyAlt(type="budget", item=budget))
    else:
        band_max = main_price * 1.15
        band = [i for i in candidates if main_price <= (i.price or 0) <= band_max]
        if band:
            similar = min(band, key=lambda i: i.price or 0)
            alts.append(SwiggyAlt(type="similar_tier", item=similar))

    return alts


# The MCP returns real restaurant cards only for broad cuisine/CATEGORY terms
# (e.g. "Pasta", "Pizza", "Biryani"), not for specific multi-word dish names.
# So we infer a Swiggy category from words in the dish name, then fall back to
# the cuisine. Order within each list = search priority.
_DISH_CATEGORY_HINTS: list[tuple[str, tuple[str, ...]]] = [
    # Healthy first so "Fresh Fruit Bowl" / "Quinoa Salad" land at salad/health
    # places, not a burger joint via the cuisine fallback.
    ("Salad",   ("salad", "fruit", "smoothie", "acai", "granola", "poke",
                 "quinoa", "buddha bowl", "yogurt", "sprout")),
    ("Pasta",   ("spaghetti", "pasta", "penne", "fettuccine", "lasagne", "lasagna",
                 "carbonara", "alfredo", "macaroni", "ravioli", "noodle pasta")),
    ("Pizza",   ("pizza", "margherita", "pepperoni")),
    ("Biryani", ("biryani", "biriyani", "dum")),
    ("Burger",  ("burger", "slider", "hot dog", "hotdog", "corn dog")),
    ("Fried Chicken", ("wings", "tenders", "fried chicken", "popcorn chicken", "nuggets")),
    ("Noodles", ("noodles", "hakka", "chowmein", "ramen", "schezwan noodle")),
    ("Sushi",   ("sushi", "maki", "sashimi", "nigiri")),
    ("Tacos",   ("taco", "burrito", "quesadilla", "nachos")),
    ("Sandwich",("sandwich", "sub", "panini")),
    ("Rolls",   ("roll", "wrap", "kathi", "shawarma")),
    ("Dosa",    ("dosa", "idli", "uttapam", "vada")),
    ("Cake",    ("cake", "pastry", "brownie", "crepe")),
    ("Ice Cream",("ice cream", "gelato", "sundae")),
]

# Broad fallback term per cuisine when the dish name has no category keyword.
_CUISINE_QUERY: dict[str, str] = {
    "italian": "Pasta",
    "american": "Burger",
    "chinese": "Chinese",
    "thai": "Thai",
    "japanese": "Sushi",
    "mexican": "Mexican",
    "indian": "Biryani",
    "mediterranean": "Mediterranean",
}


def _enrich_queries(dish: "EnrichDishInput") -> list[str]:
    """Ordered, de-duplicated queries for menu/restaurant searches.

    1. explicit search_category from dish metadata
    2. category inferred from the dish name (e.g. "Spaghetti Carbonara" -> "Pasta")
    3. a popular category mapped from the cuisine (e.g. italian -> "Pasta")
    4. the cuisine title-cased (e.g. "Italian")
    5. the dish name itself (useful when it is also a category, e.g. "Biryani")
    """
    name_l = dish.name.lower()
    cuisine = (dish.cuisine or "").strip().lower()
    candidates: list[str] = []

    if dish.search_category:
        candidates.append(dish.search_category)

    for category, keywords in _DISH_CATEGORY_HINTS:
        if any(kw in name_l for kw in keywords):
            candidates.append(category)
            break
    if cuisine in _CUISINE_QUERY:
        candidates.append(_CUISINE_QUERY[cuisine])
    if cuisine:
        candidates.append(cuisine.title())
    candidates.append(dish.name)

    seen: set[str] = set()
    return [c for c in candidates if c and not (c.lower() in seen or seen.add(c.lower()))]


def _restaurant_queries(dish: "EnrichDishInput") -> list[str]:
    """Category and cuisine queries for search_restaurants.

    Builds steps 1-4 of the query sequence (search_category, category hint,
    cuisine canonical, cuisine title) and deliberately omits the tail exact dish
    name (step 5 of _enrich_queries).

    Why text-filtering _enrich_queries output would be wrong: for a pure category
    dish like "Biryani", the category hint (step 2) already adds "Biryani" — a
    text-equality filter would remove it even though it was derived from the hint,
    not from the tail fallback.

    search_menu has already been tried with the exact dish name; passing a specific
    multi-word name to search_restaurants returns item-shaped cards that
    _real_restaurants filters out anyway.
    """
    name_l = dish.name.lower()
    cuisine = (dish.cuisine or "").strip().lower()
    candidates: list[str] = []

    if dish.search_category:
        candidates.append(dish.search_category)

    for category, keywords in _DISH_CATEGORY_HINTS:
        if any(kw in name_l for kw in keywords):
            candidates.append(category)
            break
    if cuisine in _CUISINE_QUERY:
        candidates.append(_CUISINE_QUERY[cuisine])
    if cuisine:
        candidates.append(cuisine.title())
    # Step 5 (exact dish.name tail) intentionally excluded.

    seen: set[str] = set()
    return [c for c in candidates if c and not (c.lower() in seen or seen.add(c.lower()))]


def _log_extraction(kind: str, query: str, raw_rows: list[dict], extracted: list) -> None:
    """Surface where results are lost: response shape vs. field-name mapping."""
    if not raw_rows:
        logger.warning(
            "No %s for %r: tool response had no recognisable list "
            "(enable SWIGGY_DEBUG=true to see the raw payload shape).",
            kind, query,
        )
        return
    if not extracted:
        sample_keys = sorted(raw_rows[0].keys())
        logger.warning(
            "Got %d raw %s for %r but normalised 0 — likely a field-name mismatch. "
            "First row keys: %s",
            len(raw_rows), kind, query, sample_keys,
        )
        return
    logger.info("Extracted %d/%d %s for %r", len(extracted), len(raw_rows), kind, query)


def dish_words(name: str) -> set[str]:
    """Significant (3+ char) lowercased words in a dish name."""
    return {w for w in name.lower().split() if len(w) > 2}


def _name_overlap(a: str, b: str) -> int:
    """Count shared significant words between two dish names (case-insensitive)."""
    return len(dish_words(a) & dish_words(b))


# Protein / key-ingredient families: a match may not swap across families.
_PROTEIN_GROUPS: list[set[str]] = [
    {"mutton", "lamb", "goat", "keema"},
    {"chicken", "murgh"},
    {"paneer", "cottage"},
    {"fish", "prawn", "shrimp", "seafood"},
    {"egg", "anda"},
    {"rajmah", "rajma", "dal", "chole", "chana", "sambar"},
]

# Form words that change the dish type when present on the candidate but not target.
_FORM_CONFLICTS = {
    "roll", "wrap", "sandwich", "burger", "pizza", "soup", "salad",
    "thali", "combo", "meal",
}


def _protein_of(words: set[str]) -> Optional[str]:
    for i, group in enumerate(_PROTEIN_GROUPS):
        if words & group:
            return f"p{i}"
    return None


def _has_form_conflict(target: set[str], candidate: set[str]) -> bool:
    """Reject e.g. Paneer Tikka Masala → Paneer Tikka Roll."""
    extra_forms = (candidate - target) & _FORM_CONFLICTS
    if not extra_forms:
        return False
    # Thali/combo can still be a valid Andhra Biryani match if core words align.
    soft = extra_forms <= {"thali", "combo", "meal"}
    if soft and ("biryani" in target or "biriyani" in target):
        return False
    return True


def match_confidence(item: SwiggyMenuItem, dish: EnrichDishInput) -> float:
    """Weighted confidence for a Swiggy item vs curated dish. Higher is better."""
    targets = [dish.name, *(dish.aliases or [])]
    item_words = dish_words(item.name)
    desc_words = dish_words(item.description or "")
    best = 0.0

    for target in targets:
        t_words = dish_words(target)
        if not t_words:
            continue
        if _has_form_conflict(t_words, item_words):
            continue
        tp = _protein_of(t_words)
        ip = _protein_of(item_words)
        if tp and ip and tp != ip:
            continue  # e.g. mutton vs rajmah / chicken vs paneer

        overlap = t_words & item_words
        score = len(overlap) * 3.0
        score += len(t_words & desc_words) * 0.5
        # Exact / near-exact name boost
        if item.name.strip().lower() == target.strip().lower():
            score += 6.0
        elif target.lower() in item.name.lower() or item.name.lower() in target.lower():
            score += 3.0
        # Require at least one distinctive (non-generic) word when multi-word.
        generic = {"curry", "masala", "special", "style", "house", "chef", "spicy", "fried"}
        distinctive = overlap - generic
        if len(t_words) >= 2 and not distinctive and len(overlap) < 2:
            continue
        # Veg/non-veg signal when available
        if item.is_veg is not None:
            wants_veg = any(w in {"paneer", "dal", "rajmah", "rajma", "chole"} for w in t_words)
            wants_nv = any(w in {"chicken", "mutton", "lamb", "fish", "prawn", "egg"} for w in t_words)
            if wants_veg and item.is_veg is False:
                score -= 4.0
            if wants_nv and item.is_veg is True:
                score -= 4.0
        best = max(best, score)
    return best


def _best_confident_match(
    items: list[SwiggyMenuItem], dish: EnrichDishInput
) -> Optional[tuple[SwiggyMenuItem, float]]:
    """Pick the highest-confidence item meeting the threshold, or None."""
    if not items:
        return None
    scored = [(match_confidence(it, dish), it) for it in items]
    scored.sort(key=lambda x: x[0], reverse=True)
    conf, best = scored[0]
    if conf < _MATCH_CONFIDENCE_THRESHOLD:
        return None
    return best, conf


_BORDERLINE_MIN_SCORE = 1.5


def _best_borderline_match(
    items: list[SwiggyMenuItem], dish: EnrichDishInput
) -> Optional[tuple[SwiggyMenuItem, float]]:
    """Best item in the borderline range [_BORDERLINE_MIN_SCORE, _MATCH_CONFIDENCE_THRESHOLD).

    Items scoring 0 due to hard conflicts (protein/form already rejected by
    match_confidence) are implicitly excluded since 0 < _BORDERLINE_MIN_SCORE.
    """
    if not items:
        return None
    scored = [(match_confidence(it, dish), it) for it in items]
    scored.sort(key=lambda x: x[0], reverse=True)
    conf, best = scored[0]
    if conf < _BORDERLINE_MIN_SCORE or conf >= _MATCH_CONFIDENCE_THRESHOLD:
        return None
    return best, conf


def _best_closest_match(
    items: list[SwiggyMenuItem], dish: EnrichDishInput
) -> Optional[tuple[SwiggyMenuItem, float]]:
    """Best non-conflicting Swiggy item — main-style closest fill.

    Hard protein/form conflicts score 0 and are skipped. Any remaining item at
    or above _CLOSEST_MIN_SCORE is accepted so live cards still populate when an
    exact Carbonara/Butter Chicken title is missing.
    """
    if not items:
        return None
    scored = [(match_confidence(it, dish), it) for it in items]
    scored.sort(key=lambda x: x[0], reverse=True)
    conf, best = scored[0]
    if conf < _CLOSEST_MIN_SCORE:
        return None
    return best, conf


def _menu_match_score(item: SwiggyMenuItem, name: str) -> int:
    """Legacy helper kept for tests — word overlap * 3 + description overlap."""
    target = dish_words(name)
    score = len(target & dish_words(item.name)) * 3
    if item.description:
        score += len(target & dish_words(item.description))
    return score


def _best_name_match(items: list[SwiggyMenuItem], name: str) -> Optional[SwiggyMenuItem]:
    """Pick the menu item best matching the dish name (by name + description)."""
    if not items:
        return None
    dish = EnrichDishInput(id="tmp", name=name)
    hit = _best_confident_match(items, dish) or _best_closest_match(items, dish)
    if hit:
        return hit[0]
    best = max(items, key=lambda it: _menu_match_score(it, name))
    return best if _menu_match_score(best, name) > 0 else None


def _best_item(items: list[SwiggyMenuItem]) -> Optional[SwiggyMenuItem]:
    if not items:
        return None
    # Prefer the highest-rated item; fall back to the first result.
    return max(items, key=lambda i: (i.rating or 0))
