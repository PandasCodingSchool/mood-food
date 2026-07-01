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

    client = _client_with(
        {"get_addresses": {"addresses": [{"id": "a1", "addressTag": "Work"}, {"id": "a2", "addressTag": "Home"}]}}
    )
    svc = SwiggyDiscoveryService(client=client)
    # No city map configured -> calls get_addresses, picks the Home address.
    assert await svc.resolve_address_id() == "a2"


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
async def test_enrich_falls_back_to_representative_item():
    """When no item name overlaps, fall back to the first (Recommended) item."""
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
    assert m.matched is True
    assert m.item is not None  # representative fallback, not None
    assert m.item.id == "c1"   # first Recommended item
    assert m.item.price == 250


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
