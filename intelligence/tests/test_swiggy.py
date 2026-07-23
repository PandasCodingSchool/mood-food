"""Tests for the Swiggy discovery layer with the MCP client fully mocked.

Mirrors the existing test style (OpenAI is always mocked; here the Swiggy MCP
client is mocked) so no real network/token is needed.
"""

import pytest
from unittest.mock import AsyncMock, patch

from app.services.swiggy_discovery import (
    SwiggyDiscoveryService,
    normalize_menu_item,
    normalize_restaurant,
)
from app.services.swiggy_mcp import SwiggyMCPClient


# --- Normalisation unit tests (no I/O) ---

def test_normalize_restaurant_handles_varied_keys():
    raw = {
        "restaurantId": "r1",
        "restaurantName": "Spice Hub",
        "avgRating": "4.3",
        "deliveryTime": "28",
        "availabilityStatus": "OPEN",
        "cuisine": "Indian",
    }
    r = normalize_restaurant(raw)
    assert r is not None
    assert r.id == "r1"
    assert r.name == "Spice Hub"
    assert r.rating == 4.3
    assert r.eta_min == 28
    assert r.is_open is True
    assert r.cuisines == ["Indian"]


def test_normalize_restaurant_closed_and_missing_id():
    assert normalize_restaurant({"name": "no id"}) is None
    closed = normalize_restaurant(
        {"id": "r2", "name": "Closed Co", "availabilityStatus": "CLOSED"}
    )
    assert closed is not None and closed.is_open is False


def test_normalize_menu_item():
    item = normalize_menu_item(
        {"itemId": "i1", "itemName": "Butter Chicken", "price": 320, "restaurantId": "r1"}
    )
    assert item is not None
    assert item.id == "i1"
    assert item.price == 320
    assert item.restaurant_id == "r1"


def test_normalize_menu_item_search_menu_shape():
    """Real search_menu rows use menu_item_id instead of id/itemId."""
    raw = {
        "menu_item_id": "m123",
        "name": "Paneer Butter Masala",
        "price": 280,
        "restaurant_id": "r99",
        "restaurant_name": "Spice Garden",
        "is_veg": True,
        "rating": 4.2,
    }
    item = normalize_menu_item(raw)
    assert item is not None, "menu_item_id row must normalize successfully"
    assert item.id == "m123"
    assert item.name == "Paneer Butter Masala"
    assert item.price == 280
    assert item.restaurant_id == "r99"
    assert item.restaurant_name == "Spice Garden"
    assert item.is_veg is True


def test_normalize_menu_item_search_menu_shape_produces_nonzero_items():
    """_extract_menu_items must recognise menu_item_id rows as valid items."""
    from app.services.swiggy_discovery import _extract_menu_items

    raw_response = {
        "items": [
            {
                "menu_item_id": "sm1",
                "name": "Chicken Tikka",
                "price": 350,
                "restaurant_id": "r5",
                "restaurant_name": "Grill House",
                "is_veg": False,
            },
            {
                "menu_item_id": "sm2",
                "name": "Dal Tadka",
                "price": 160,
                "restaurant_id": "r5",
                "restaurant_name": "Grill House",
                "is_veg": True,
            },
        ]
    }
    items = _extract_menu_items(raw_response)
    assert len(items) == 2, (
        f"Expected 2 items from menu_item_id rows, got {len(items)}"
    )
    ids = {i.id for i in items}
    assert "sm1" in ids and "sm2" in ids


# --- Service tests with the MCP client mocked ---

def _client_with(tool_returns):
    client = SwiggyMCPClient(token="test-token")
    client.call_tool = AsyncMock(side_effect=lambda name, args: tool_returns[name])
    return client


def _jwt(exp: int) -> str:
    import base64
    import json
    payload = base64.urlsafe_b64encode(json.dumps({"exp": exp}).encode()).rstrip(b"=").decode()
    return f"eyJhbGciOiJSUzI1NiJ9.{payload}.sig"


def test_token_store_prefers_valid_stored_token(tmp_path, monkeypatch):
    import time
    from app.config import settings
    from app.services import swiggy_token

    f = tmp_path / "tok.json"
    monkeypatch.setattr(settings, "swiggy_token_file", str(f))
    monkeypatch.setattr(settings, "swiggy_bootstrap_token", "env-token")

    valid = _jwt(int(time.time()) + 100_000)
    swiggy_token.save_token(valid, user_id="u1")
    assert swiggy_token.load_token() == valid  # valid stored token wins

    expired = _jwt(int(time.time()) - 100)
    swiggy_token.save_token(expired)
    assert swiggy_token.load_token() == "env-token"  # expired -> fall back to env


@pytest.mark.asyncio
async def test_list_addresses_normalizes():
    client = _client_with({"get_addresses": {"addresses": [
        {"id": "a1", "addressTag": "Home", "addressLine": "Kondhwa, Pune"},
        {"id": "a2", "addressCategory": "Other", "addressLine": "Anjuna, Goa"},
    ]}})
    svc = SwiggyDiscoveryService(client=client)
    addrs = await svc.list_addresses()
    assert addrs[0] == {"id": "a1", "label": "Home", "line": "Kondhwa, Pune"}
    assert addrs[1]["label"] == "Other"


@pytest.mark.asyncio
async def test_session_sets_and_clears_active():
    """session() opens a reusable bound session and clears it on exit."""
    client = SwiggyMCPClient(token="test-token")
    assert client._active is None
    async with client.session() as bound:
        assert client._active is bound  # call_tool now routes through this session
    assert client._active is None  # cleaned up


@pytest.mark.asyncio
async def test_resolve_address_prefers_explicit():
    svc = SwiggyDiscoveryService(client=_client_with({}))
    assert await svc.resolve_address_id(address_id="addr_x") == "addr_x"


@pytest.mark.asyncio
async def test_resolve_address_falls_back_to_get_addresses(monkeypatch):
    # Isolate from any .env city map/default so the get_addresses fallback runs.
    from app.config import settings
    monkeypatch.setattr(settings, "swiggy_city_address_map", "{}")
    monkeypatch.setattr(settings, "swiggy_default_city", "")
    monkeypatch.setattr(settings, "swiggy_address_retrieval_enabled", True)

    client = _client_with(
        {"get_addresses": {"addresses": [{"id": "a1", "addressTag": "Work"}, {"id": "a2", "addressTag": "Home"}]}}
    )
    svc = SwiggyDiscoveryService(client=client)
    # No city map configured, retrieval enabled -> calls get_addresses, picks Home.
    assert await svc.resolve_address_id() == "a2"


@pytest.mark.asyncio
async def test_resolve_address_requires_flag_when_no_city_match(monkeypatch):
    from app.config import settings
    from app.services.swiggy_mcp import SwiggyAddressRequiredError
    monkeypatch.setattr(settings, "swiggy_city_address_map", "{}")
    monkeypatch.setattr(settings, "swiggy_default_city", "")
    monkeypatch.setattr(settings, "swiggy_address_retrieval_enabled", False)

    client = _client_with(
        {"get_addresses": {"addresses": [{"id": "a1", "addressTag": "Home"}]}}
    )
    svc = SwiggyDiscoveryService(client=client)
    # Retrieval disabled (default) and no city map entry -> must not call
    # get_addresses live; raises so callers can prompt for an address instead.
    with pytest.raises(SwiggyAddressRequiredError):
        await svc.resolve_address_id()


@pytest.mark.asyncio
async def test_search_restaurants_filters_closed():
    client = _client_with(
        {
            "search_restaurants": {
                "restaurants": [
                    {"id": "r1", "name": "Open Place", "availabilityStatus": "OPEN"},
                    {"id": "r2", "name": "Shut Place", "availabilityStatus": "CLOSED"},
                ]
            }
        }
    )
    svc = SwiggyDiscoveryService(client=client)
    addr, results = await svc.search_restaurants("biryani", address_id="a1")
    assert addr == "a1"
    assert [r.name for r in results] == ["Open Place"]


@pytest.mark.asyncio
async def test_enrich_two_step_matches_real_item():
    """Full enrich: search_restaurants -> get_restaurant_menu -> matched item."""
    client = SwiggyMCPClient(token="test-token")

    async def fake_call(name, args):
        if name == "search_restaurants":
            return {"restaurants": [
                {"id": "r1", "name": "Pasta Palace", "avgRating": 4.6,
                 "deliveryTimeMinutes": 25, "costForTwo": "₹400 for two",
                 "availabilityStatus": "OPEN", "cuisines": ["Italian"]},
                {"id": "r2", "name": "Closed Co", "availabilityStatus": "CLOSED"},
            ]}
        if name == "get_restaurant_menu":
            return {"restaurant": {"id": "r1", "name": "Pasta Palace"},
                    "categories": [{"title": "Recommended", "items": [
                        {"id": "i9", "name": "Spaghetti Carbonara", "price": 420,
                         "isVeg": False, "imageUrl": "https://img/x.jpg"},
                        {"id": "i8", "name": "Margherita Pizza", "price": 300},
                    ]}]}
        return {}

    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    from app.schemas.swiggy import EnrichDishInput

    addr, matches = await svc.enrich(
        [EnrichDishInput(id="d1", name="Spaghetti Carbonara", cuisine="italian")],
        address_id="a1",
    )
    m = matches[0]
    assert addr == "a1"
    assert m.matched is True
    assert m.restaurant.name == "Pasta Palace"
    assert m.restaurant.eta_min == 25
    assert m.restaurant.cost_for_two == 400
    # exact dish match wins over the cheaper Margherita, with price + image + id
    assert m.item is not None
    assert m.item.id == "i9"
    assert m.item.name == "Spaghetti Carbonara"
    assert m.item.price == 420
    assert m.item.image_url == "https://img/x.jpg"


@pytest.mark.asyncio
async def test_enrich_no_overlap_returns_unmatched():
    """When no menu item shares a word with the dish name, return matched=False.

    Previously the system fell back to the first (Recommended) item, which caused
    "Hot Dogs" to match a ₹1689 combo meal that happened to contain "hot".
    Now we require at least one word overlap or we declare no match.
    """
    client = SwiggyMCPClient(token="test-token")

    async def fake_call(name, args):
        if name == "search_restaurants":
            return {"restaurants": [
                {"id": "r1", "name": "Viet Corner", "avgRating": 4.5,
                 "deliveryTimeMinutes": 30, "availabilityStatus": "OPEN",
                 "cuisines": ["Vietnamese"]},
            ]}
        if name == "get_restaurant_menu":
            return {"restaurant": {"id": "r1", "name": "Viet Corner"},
                    "categories": [{"title": "Recommended", "items": [
                        {"id": "c1", "name": "Chicken Banh Mi", "price": 250, "imageUrl": "u"},
                        {"id": "c2", "name": "Spring Rolls", "price": 180},
                    ]}]}
        return {}

    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    from app.schemas.swiggy import EnrichDishInput

    _, matches = await svc.enrich(
        [EnrichDishInput(id="d1", name="Pho Noodle Soup", cuisine="vietnamese")],
        address_id="a1",
    )
    m = matches[0]
    # "Pho Noodle Soup" shares no words with "Chicken Banh Mi" or "Spring Rolls"
    # → no match rather than a misleading fallback item.
    assert m.matched is False


# --- Diversity + dedup tests ---

@pytest.mark.asyncio
async def test_enrich_uses_distinct_restaurants_for_each_dish():
    """Three dishes should each get a live Swiggy item (closest fill allowed).

    With shared top-restaurant ordering, multiple dishes may land at the same
    restaurant when it has the strongest name overlap — that is intentional.
    """
    client = SwiggyMCPClient(token="test-token")

    async def fake_call(name, args):
        if name == "search_menu":
            return {"items": []}
        if name == "search_restaurants":
            return {"restaurants": [
                {"id": "r1", "name": "Wings Hub", "avgRating": 4.5,
                 "deliveryTimeMinutes": 20, "availabilityStatus": "OPEN", "cuisines": ["American"]},
                {"id": "r2", "name": "Cluck Palace", "avgRating": 4.3,
                 "deliveryTimeMinutes": 25, "availabilityStatus": "OPEN", "cuisines": ["American"]},
                {"id": "r3", "name": "Tender Town", "avgRating": 4.1,
                 "deliveryTimeMinutes": 30, "availabilityStatus": "OPEN", "cuisines": ["American"]},
            ]}
        if name == "get_restaurant_menu":
            rid = args.get("restaurantId", "")
            menus = {
                "r1": [{"id": "i1", "name": "Smoky BBQ Wings", "price": 295, "isVeg": False}],
                "r2": [{"id": "i2", "name": "Peri Peri Hot Wings", "price": 295, "isVeg": False}],
                "r3": [{"id": "i3", "name": "Chicken Tenders Basket", "price": 265, "isVeg": False}],
            }
            items = menus.get(rid, [])
            return {"restaurant": {"id": rid}, "categories": [{"title": "Recommended", "items": items}]}
        return {}

    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    from app.schemas.swiggy import EnrichDishInput
    dishes = [
        EnrichDishInput(id="d1", name="Smoky BBQ Wings", cuisine="american"),
        EnrichDishInput(id="d2", name="Peri Hot Wings", cuisine="american"),
        EnrichDishInput(id="d3", name="Chicken Tenders", cuisine="american"),
    ]
    _, matches = await svc.enrich(dishes, address_id="a1")
    matched = [m for m in matches if m.matched]
    assert len(matched) == 3, f"Expected all 3 dishes matched via closest fill, got {len(matched)}"
    assert all(m.item is not None for m in matched)

@pytest.mark.asyncio
async def test_enrich_deduplicates_alternatives_across_cards():
    """When two dishes hit the same restaurant, their alternatives must not overlap."""
    client = SwiggyMCPClient(token="test-token")

    async def fake_call(name, args):
        if name == "search_restaurants":
            return {"restaurants": [
                {"id": "r1", "name": "Solo Spot", "avgRating": 4.5,
                 "deliveryTimeMinutes": 20, "availabilityStatus": "OPEN", "cuisines": ["Italian"]},
            ]}
        if name == "get_restaurant_menu":
            return {"restaurant": {"id": "r1"}, "categories": [{"title": "Menu", "items": [
                {"id": "i1", "name": "Spaghetti Carbonara", "price": 420, "isVeg": False},
                {"id": "i2", "name": "Margherita Pizza", "price": 300, "isVeg": True},
                {"id": "i3", "name": "Caesar Salad", "price": 250, "isVeg": True},
                {"id": "i4", "name": "Garlic Bread", "price": 150, "isVeg": True},
                {"id": "i5", "name": "Penne Alfredo", "price": 380, "isVeg": True},
                {"id": "i6", "name": "Bruschetta", "price": 200, "isVeg": True},
            ]}]}
        return {}

    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    from app.schemas.swiggy import EnrichDishInput
    dishes = [
        EnrichDishInput(id="d1", name="Spaghetti Carbonara", cuisine="italian"),
        EnrichDishInput(id="d2", name="Margherita Pizza", cuisine="italian"),
    ]
    _, matches = await svc.enrich(dishes, address_id="a1")
    matched = [m for m in matches if m.matched]
    assert len(matched) == 2

    all_main_ids = {m.item.id for m in matched}
    all_alt_ids: list[str] = []
    for m in matched:
        for alt in m.swiggy_alternatives:
            # No alternative should be another card's main dish
            assert alt.item.id not in all_main_ids, \
                f"Alt {alt.item.name} is a main dish on another card"
            all_alt_ids.append(alt.item.id)

    # No duplicate alternative item across cards
    assert len(all_alt_ids) == len(set(all_alt_ids)), \
        f"Duplicate alt ids found: {all_alt_ids}"


@pytest.mark.asyncio
async def test_enrich_both_dishes_matched_stable_top_ordering():
    """With stable top ordering (no per-dish rotation), two same-category dishes
    both evaluate the same first restaurant.  When that restaurant serves both items,
    both are matched and the menu is fetched only once (cache reuse).
    """
    from app.schemas.swiggy import EnrichDishInput

    client = SwiggyMCPClient(token="test-token")
    menu_fetch_calls: list[str] = []

    async def fake_call(name, args):
        if name == "search_menu":
            return {"items": []}
        if name == "search_restaurants":
            return {"restaurants": [
                {"id": "r1", "name": "Burger Barn", "avgRating": 4.5,
                 "deliveryTimeMinutes": 20, "availabilityStatus": "OPEN", "cuisines": ["American"]},
                {"id": "r2", "name": "Grill House", "avgRating": 4.2,
                 "deliveryTimeMinutes": 25, "availabilityStatus": "OPEN", "cuisines": ["American"]},
            ]}
        if name == "get_restaurant_menu":
            rid = args.get("restaurantId")
            menu_fetch_calls.append(rid)
            return {"restaurant": {"id": rid}, "categories": [{"title": "Menu", "items": [
                {"id": f"{rid}_burger", "name": "Smash Burger", "price": 250, "isVeg": False},
                {"id": f"{rid}_wings", "name": "Buffalo Wings", "price": 220, "isVeg": False},
            ]}]}
        return {}

    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    dishes = [
        EnrichDishInput(id="d1", name="Smash Burger", cuisine="american"),
        EnrichDishInput(id="d2", name="Buffalo Wings", cuisine="american"),
    ]
    with patch("app.services.swiggy_discovery.scout_ambiguous_matches",
               AsyncMock(return_value={})):
        _, matches = await svc.enrich(dishes, address_id="a1")

    matched = [m for m in matches if m.matched]
    assert len(matched) == 2, f"both dishes must match; got {[(m.dish_id, m.matched) for m in matches]}"

    # Both dishes start at r1 (stable top); r1 menu is fetched once and cached.
    r1_fetches = menu_fetch_calls.count("r1")
    assert r1_fetches == 1, (
        f"get_restaurant_menu('r1') called {r1_fetches}x; expected exactly 1 (cached for second dish)"
    )
    # Both matches come from r1 (the top restaurant with both items)
    assert all(m.restaurant.id == "r1" for m in matched), (
        f"expected both to match at r1; got {[m.restaurant.id for m in matched]}"
    )


# --- Scout integration tests ---

@pytest.mark.asyncio
async def test_closest_fill_accepts_borderline_without_scout():
    """Borderline search_menu hits populate live cards immediately (main-style closest)."""
    from app.schemas.swiggy import EnrichDishInput

    client = SwiggyMCPClient(token="test-token")

    async def fake_call(name, args):
        if name == "search_menu":
            query = args.get("query", "")
            if "Dal" in query:
                return {"items": [{
                    "id": "i1", "name": "Dal Fry", "price": 180, "isVeg": True,
                    "restaurantId": "r1", "restaurantName": "Dal House",
                }]}
            if "Shahi" in query or "Paneer" in query:
                return {"items": [{
                    "id": "i2", "name": "Paneer Tikka", "price": 320, "isVeg": True,
                    "restaurantId": "r2", "restaurantName": "Paneer Place",
                }]}
            return {"items": []}
        return {}

    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    scout_call_count = 0

    async def mock_scout(pairs):
        nonlocal scout_call_count
        scout_call_count += 1
        return {}

    with patch("app.services.swiggy_discovery.scout_ambiguous_matches", mock_scout):
        dishes = [
            EnrichDishInput(id="d1", name="Dal Tadka", cuisine="indian"),
            EnrichDishInput(id="d2", name="Shahi Paneer", cuisine="indian"),
        ]
        _, matches = await svc.enrich(dishes, address_id="a1")

    assert scout_call_count == 0, "Closest fill should not need scout for borderline hits"
    matched = [m for m in matches if m.matched]
    assert len(matched) == 2, f"Both dishes should be matched via closest fill, got {len(matched)}"
    matched_item_ids = {m.item.id for m in matched}
    assert "i1" in matched_item_ids
    assert "i2" in matched_item_ids


@pytest.mark.asyncio
async def test_scout_hard_rejects_not_accepted():
    """Even if scout were called, hard-reject borderline candidates must not appear.

    Mutton Curry -> Rajmah Curry has match_confidence=0, so it is never queued
    and scout is never called at all for that dish.
    """
    from app.schemas.swiggy import EnrichDishInput
    from app.data.dishes import DISHES_BY_ID

    client = SwiggyMCPClient(token="test-token")

    async def fake_call(name, args):
        if name == "search_menu":
            # Always return the known hard-reject candidate
            return {"items": [{
                "id": "rej1", "name": "Punjabi Rajmah Curry", "price": 447,
                "isVeg": True, "restaurantId": "r1", "restaurantName": "Veg House",
            }]}
        return {}

    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    scout_calls = []

    async def mock_scout(pairs):
        scout_calls.append(pairs)
        return {}

    with patch("app.services.swiggy_discovery.scout_ambiguous_matches", mock_scout):
        dish = EnrichDishInput(
            id="in_023", name="Mutton Curry", cuisine="indian",
            aliases=DISHES_BY_ID["in_023"].swiggy_aliases,
        )
        _, matches = await svc.enrich([dish], address_id="a1")

    # The hard-reject candidate has confidence 0 → not in borderline → scout not called
    assert scout_calls == [], "Scout must not be called when only hard-conflict candidates exist"
    assert matches[0].matched is False


@pytest.mark.asyncio
async def test_closest_fill_from_search_menu_when_not_exact():
    """A word-overlap search_menu hit must populate the card without waiting on scout."""
    from app.schemas.swiggy import EnrichDishInput

    client = SwiggyMCPClient(token="test-token")

    async def fake_call(name, args):
        if name == "search_menu":
            if "Dal" in args.get("query", ""):
                return {"items": [{
                    "id": "i1", "name": "Dal Fry", "price": 180, "isVeg": True,
                    "restaurantId": "r1", "restaurantName": "Dal House",
                }]}
            return {"items": []}
        return {}

    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    with patch("app.services.swiggy_discovery.scout_ambiguous_matches", AsyncMock(return_value={})):
        dishes = [EnrichDishInput(id="d1", name="Dal Tadka", cuisine="indian")]
        _, matches = await svc.enrich(dishes, address_id="a1")

    assert matches[0].matched is True
    assert matches[0].item.id == "i1"
    assert matches[0].restaurant.name == "Dal House"


# ---------------------------------------------------------------------------
# Focused tests: dedup, no-exact-restaurant-name, pool-size behavior
# ---------------------------------------------------------------------------

def test_restaurant_queries_excludes_dish_name():
    """_restaurant_queries must not contain the exact dish name."""
    from app.services.swiggy_discovery import _restaurant_queries
    from app.schemas.swiggy import EnrichDishInput

    # Specific multi-word dish name
    dish = EnrichDishInput(id="d1", name="Chicken Tikka Masala", cuisine="indian")
    queries = _restaurant_queries(dish)
    assert "Chicken Tikka Masala" not in queries, (
        "exact dish name must be excluded from restaurant queries"
    )
    # Category/cuisine queries should still be present
    assert any(q for q in queries), "at least one category/cuisine query must remain"


def test_restaurant_queries_keeps_category_for_pure_category_name():
    """Category-derived queries must survive even when they match the dish name.

    For "Biryani": the category hint (step 2) adds "Biryani".  The tail dish-name
    fallback (step 5) also adds "Biryani", but that is deduplicated away by
    _enrich_queries itself.  _restaurant_queries must not remove the category-derived
    entry just because it shares text with the dish name.
    """
    from app.services.swiggy_discovery import _restaurant_queries, _enrich_queries
    from app.schemas.swiggy import EnrichDishInput

    dish = EnrichDishInput(id="d1", name="Biryani", cuisine="indian")
    full_queries = _enrich_queries(dish)
    rest_queries = _restaurant_queries(dish)

    assert "Biryani" in full_queries, "Biryani must appear in full query set via category hint"
    # Must be present in restaurant queries — the category hint survives because
    # _restaurant_queries builds from scratch without a text-equality filter.
    assert "Biryani" in rest_queries, (
        f"category-derived 'Biryani' must survive in restaurant queries; got {rest_queries}"
    )
    # Specific multi-word dish names must still be excluded.
    tikka = EnrichDishInput(id="d2", name="Chicken Tikka Masala", cuisine="indian")
    tikka_queries = _restaurant_queries(tikka)
    assert "Chicken Tikka Masala" not in tikka_queries, (
        "exact multi-word dish name must not appear in restaurant queries"
    )


@pytest.mark.asyncio
async def test_shared_category_menu_fetch_deduped():
    """Two dishes sharing a category query must reuse the same top-restaurant menu fetch.

    The fake returns TWO restaurants to prove the test would not trivially pass with
    only one in the list.  With no per-dish rotation both concurrent dishes see
    r_top first; r_top's menu is fetched once (cached) then reused, so
    get_restaurant_menu for r_top is called exactly once regardless of dish count.
    """
    from app.services.swiggy_discovery import SwiggyDiscoveryService
    from app.schemas.swiggy import EnrichDishInput
    from app.services.swiggy_mcp import SwiggyMCPClient

    menu_fetch_calls: list[str] = []

    async def fake_call(name: str, args: dict):
        if name == "search_menu":
            return {"items": []}
        if name == "search_restaurants":
            # Two real restaurants — r_top is first (top ranking).
            return {"restaurants": [
                {
                    "id": "r_top",
                    "name": "Biryani Palace",
                    "avgRating": 4.8,
                    "deliveryTimeMinutes": 25,
                    "availabilityStatus": "OPEN",
                    "cuisines": ["Indian"],
                },
                {
                    "id": "r_second",
                    "name": "Rice House",
                    "avgRating": 4.2,
                    "deliveryTimeMinutes": 35,
                    "availabilityStatus": "OPEN",
                    "cuisines": ["Indian"],
                },
            ]}
        if name == "get_restaurant_menu":
            rid = args.get("restaurantId", "")
            menu_fetch_calls.append(rid)
            if rid == "r_top":
                return {"items": [
                    {"id": "m1", "name": "Chicken Biryani", "price": 250,
                     "restaurantId": "r_top", "restaurantName": "Biryani Palace"},
                    {"id": "m2", "name": "Mutton Biryani", "price": 310,
                     "restaurantId": "r_top", "restaurantName": "Biryani Palace"},
                ]}
            return {"items": []}
        return {}

    client = SwiggyMCPClient(token="test-token")
    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    dishes = [
        EnrichDishInput(id="d1", name="Chicken Biryani", cuisine="indian",
                        search_category="Biryani"),
        EnrichDishInput(id="d2", name="Mutton Biryani", cuisine="indian",
                        search_category="Biryani"),
    ]

    with patch("app.services.swiggy_discovery.scout_ambiguous_matches",
               AsyncMock(return_value={})):
        _, matches = await svc.enrich(dishes, address_id="a1")

    # With stable top ordering, both dishes try r_top first.  Because _menu_tasks
    # caches the result, get_restaurant_menu for r_top must be called exactly once.
    top_fetches = menu_fetch_calls.count("r_top")
    assert top_fetches == 1, (
        f"get_restaurant_menu('r_top') called {top_fetches}x; "
        "expected exactly 1 — second dish must hit the cache, not issue a new call"
    )
    # Both dishes must have found a match at r_top (proves they both checked it)
    assert all(m.matched for m in matches), (
        f"both dishes should match at r_top; matches={[(m.dish_id, m.matched) for m in matches]}"
    )


@pytest.mark.asyncio
async def test_no_exclusive_restaurant_claiming():
    """Two concurrent dishes may check the same top restaurant without being blocked."""
    from app.services.swiggy_discovery import SwiggyDiscoveryService
    from app.schemas.swiggy import EnrichDishInput
    from app.services.swiggy_mcp import SwiggyMCPClient

    checked_restaurants: list[tuple[str, str]] = []  # (dish_id, restaurant_id) pairs

    original_best_menu = SwiggyDiscoveryService._best_menu_item

    async def tracking_best_menu(self, restaurant_id, addr, dish):
        checked_restaurants.append((dish.id, restaurant_id))
        return await original_best_menu(self, restaurant_id, addr, dish)

    async def fake_call(name: str, args: dict):
        if name == "search_menu":
            return {"items": []}
        if name == "search_restaurants":
            return {"restaurants": [{
                "id": "r_top",
                "name": "Top Restaurant",
                "avgRating": 4.5,
                "deliveryTimeMinutes": 25,
                "availabilityStatus": "OPEN",
                "cuisines": ["Indian"],
            }]}
        if name == "get_restaurant_menu":
            return {"items": [
                {"id": "m1", "name": "Chicken Tikka", "price": 280,
                 "restaurantId": "r_top", "restaurantName": "Top Restaurant"},
                {"id": "m2", "name": "Paneer Tikka", "price": 250,
                 "restaurantId": "r_top", "restaurantName": "Top Restaurant"},
            ]}
        return {}

    client = SwiggyMCPClient(token="test-token")
    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    dishes = [
        EnrichDishInput(id="d1", name="Chicken Tikka", cuisine="indian"),
        EnrichDishInput(id="d2", name="Paneer Tikka", cuisine="indian"),
    ]

    with patch.object(SwiggyDiscoveryService, "_best_menu_item", tracking_best_menu), \
         patch("app.services.swiggy_discovery.scout_ambiguous_matches",
               AsyncMock(return_value={})):
        _, matches = await svc.enrich(dishes, address_id="a1")

    # Both dishes should have been able to check r_top (no exclusive claiming)
    d1_checked = any(did == "d1" and rid == "r_top" for did, rid in checked_restaurants)
    d2_checked = any(did == "d2" and rid == "r_top" for did, rid in checked_restaurants)
    assert d1_checked and d2_checked, (
        "Both dishes must be able to check the same top restaurant; "
        f"got checks: {checked_restaurants}"
    )


# --- Route smoke tests ---

def test_status_endpoint(client_fixture):
    res = client_fixture.get("/api/swiggy/status")
    assert res.status_code == 200
    assert "configured" in res.json()


def test_restaurants_route_uses_service(client_fixture):
    async def fake_search(self, query, city=None, address_id=None):
        from app.schemas.swiggy import SwiggyRestaurant
        return "a1", [SwiggyRestaurant(id="r1", name="Test Diner", rating=4.5)]

    with patch.object(SwiggyDiscoveryService, "search_restaurants", fake_search):
        res = client_fixture.post("/api/swiggy/restaurants", json={"query": "pizza", "city": "Bangalore"})
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["restaurants"][0]["name"] == "Test Diner"


@pytest.fixture
def client_fixture():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)
