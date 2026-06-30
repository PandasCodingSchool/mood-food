"""High-level Swiggy discovery logic (Phase 1).

Resolves a delivery address, searches restaurants/menu items, and enriches
MoodFood recommendations with real Swiggy matches. Wraps SwiggyMCPClient and
normalises the loosely-typed tool output into our schema models.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from app.config import settings
from app.schemas.swiggy import (
    EnrichDishInput,
    EnrichedMatch,
    SwiggyMenuItem,
    SwiggyRestaurant,
)
from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPClient, SwiggyMCPError

logger = logging.getLogger("swiggy_discovery")


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
    iid = _first(raw, "id", "itemId", "item_id")
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
        has_id = any(k in node for k in ("id", "itemId", "item_id"))
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
    def __init__(self, client: Optional[SwiggyMCPClient] = None) -> None:
        self.client = client or SwiggyMCPClient()
        # Per-request memoisation: the 3 recommendations enrich concurrently and
        # frequently hit the same category searches / restaurant menus. Dedupe via
        # shared tasks so each (query) and (restaurantId) is fetched at most once.
        self._search_tasks: dict[str, "asyncio.Task[list[SwiggyRestaurant]]"] = {}
        self._menu_tasks: dict[str, "asyncio.Task[list[SwiggyMenuItem]]"] = {}

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

    async def _best_menu_item(
        self, restaurant_id: str, addr: str, dish_name: str
    ) -> Optional[SwiggyMenuItem]:
        """Return the menu item best matching dish_name (or None if no overlap)."""
        items = await self._menu_items(restaurant_id, addr)
        return _best_name_match(items, dish_name)

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
        """For each recommended dish, find the best matching Swiggy item."""
        # How many restaurant menus we're willing to open per dish (cost guard;
        # kept low to stay well under Swiggy's rate limits).
        drill_budget = 3
        # A strong match: 2+ shared words, or 1 shared word for short dish names.
        def strong_enough(overlap: int, dish_name: str) -> bool:
            return overlap >= 2 or (overlap >= 1 and len(dish_words(dish_name)) <= 2)

        async def match_one(dish: EnrichDishInput) -> EnrichedMatch:
            # The MCP only returns real restaurants for broad CATEGORY terms, so:
            #   1. search inferred category tiers ("Spaghetti Carbonara" -> Pasta, Italian)
            #   2. drill restaurant menus (get_restaurant_menu) within a budget
            #   3. keep the restaurant whose menu best matches the dish name
            #      (real dish + price + itemId — like the Swiggy app).
            best: Optional[tuple[int, SwiggyRestaurant, Optional[SwiggyMenuItem]]] = None
            remaining = drill_budget

            for query in _enrich_queries(dish):
                if remaining <= 0:
                    break
                try:
                    reals = await self._real_restaurants(query, addr)
                except (SwiggyMCPError, SwiggyAuthError) as exc:
                    logger.warning("enrich: search failed for %r: %s", query, exc)
                    continue
                if not reals:
                    continue

                for restaurant in reals[:2]:  # up to 2 per tier so later tiers get a turn
                    if remaining <= 0:
                        break
                    remaining -= 1
                    item = await self._best_menu_item(restaurant.id, addr, dish.name)
                    overlap = _name_overlap(item.name, dish.name) if item else -1
                    if best is None or overlap > best[0]:
                        best = (overlap, restaurant, item)
                    if strong_enough(overlap, dish.name):
                        remaining = 0
                        break
                # Stop scanning broader tiers once we have any real dish match.
                if best is not None and best[0] >= 1:
                    break

            if best is not None:
                overlap, restaurant, item = best
                logger.info(
                    "enrich: dish %r -> %r @ %r ₹%s (overlap=%d)",
                    dish.name, item.name if item else None, restaurant.name,
                    item.price if item else None, overlap,
                )
                return EnrichedMatch(
                    dish_id=dish.id, matched=True, restaurant=restaurant, item=item
                )
            logger.info("enrich: no real restaurant for dish %r", dish.name)
            return EnrichedMatch(dish_id=dish.id, matched=False)

        # One reused MCP session for the whole enrich (address + all searches +
        # menu drills) — ~3x fewer HTTP round-trips than a session per call.
        async with self.client.session():
            addr = await self.resolve_address_id(city, address_id)
            matches = await asyncio.gather(*(match_one(d) for d in dishes))

        matched_count = sum(1 for m in matches if m.matched)
        logger.info("enrich: matched %d/%d dishes (addressId=%s)", matched_count, len(dishes), addr)
        return addr, list(matches)


# The MCP returns real restaurant cards only for broad cuisine/CATEGORY terms
# (e.g. "Pasta", "Pizza", "Biryani"), not for specific multi-word dish names.
# So we infer a Swiggy category from words in the dish name, then fall back to
# the cuisine. Order within each list = search priority.
_DISH_CATEGORY_HINTS: list[tuple[str, tuple[str, ...]]] = [
    ("Pasta",   ("spaghetti", "pasta", "penne", "fettuccine", "lasagne", "lasagna",
                 "carbonara", "alfredo", "macaroni", "ravioli", "noodle pasta")),
    ("Pizza",   ("pizza", "margherita", "pepperoni")),
    ("Biryani", ("biryani", "biriyani", "dum")),
    ("Burger",  ("burger", "slider")),
    ("Noodles", ("noodles", "hakka", "chowmein", "ramen", "schezwan noodle")),
    ("Sushi",   ("sushi", "maki", "sashimi", "nigiri")),
    ("Tacos",   ("taco", "burrito", "quesadilla", "nachos")),
    ("Sandwich",("sandwich", "sub", "panini")),
    ("Rolls",   ("roll", "wrap", "kathi", "shawarma")),
    ("Dosa",    ("dosa", "idli", "uttapam", "vada")),
    ("Cake",    ("cake", "pastry", "brownie")),
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
    """Ordered, de-duplicated category queries for finding a real restaurant.

    1. category inferred from the dish name (e.g. "Spaghetti Carbonara" -> "Pasta")
    2. a popular category mapped from the cuisine (e.g. italian -> "Pasta")
    3. the cuisine title-cased (e.g. "Italian")
    4. the dish name itself (works when it's already a category, e.g. "Biryani")
    """
    name_l = dish.name.lower()
    cuisine = (dish.cuisine or "").strip().lower()
    candidates: list[str] = []

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


def _best_name_match(items: list[SwiggyMenuItem], name: str) -> Optional[SwiggyMenuItem]:
    """Pick the menu item whose name shares the most words with the AI dish name.

    If no item overlaps, fall back to the first extracted item — items come in
    menu order (the "Recommended" category first), so that's the restaurant's
    representative/closest dish. Always returns a real orderable item (with
    price, image, id) when the menu has any.
    """
    if not items:
        return None
    best = max(items, key=lambda it: _name_overlap(it.name, name))
    return best if _name_overlap(best.name, name) > 0 else items[0]


def _best_item(items: list[SwiggyMenuItem]) -> Optional[SwiggyMenuItem]:
    if not items:
        return None
    # Prefer the highest-rated item; fall back to the first result.
    return max(items, key=lambda i: (i.rating or 0))
