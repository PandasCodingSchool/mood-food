"""Tests for the structured menu browse route (SwiggyDiscoveryService.
get_restaurant_menu_structured) and the AI menu chat service (menu_chat.py),
mocking the MCP client / ChatOpenAI the same way test_swiggy.py / test_game_assist.py do.
"""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.swiggy import MenuChatMessage, MenuChatPreferences, MenuChatRequest, SwiggyMenuItem
from app.services.menu_chat import get_menu_chat_reply
from app.services.swiggy_discovery import SwiggyDiscoveryService
from app.services.swiggy_mcp import SwiggyMCPClient


def _client_with(tool_returns):
    client = SwiggyMCPClient(token="test-token")
    client.call_tool = AsyncMock(side_effect=lambda name, args: tool_returns[name])
    return client


# --- get_restaurant_menu_structured ---

@pytest.mark.asyncio
async def test_get_restaurant_menu_structured_preserves_categories_and_normalizes_items():
    raw = {
        "restaurant": {
            "id": "r1", "name": "Pimlico", "deliveryTime": 32,
            "cuisines": ["Continental", "Japanese"],
        },
        "categories": [
            {"title": "Recommended", "items": [
                {"id": "i1", "name": "Chicken Parmigiano", "price": 645, "isVeg": False},
            ]},
            {"title": "Starters", "items": [
                {"id": "i2", "name": "Garlic Bread", "price": 220, "isVeg": True},
            ]},
        ],
    }
    client = _client_with({"get_restaurant_menu": raw})
    svc = SwiggyDiscoveryService(client=client)

    addr, restaurant, categories = await svc.get_restaurant_menu_structured("r1", address_id="a1")

    assert addr == "a1"
    assert restaurant is not None
    assert restaurant.name == "Pimlico"
    assert restaurant.eta_min == 32
    assert [c["title"] for c in categories] == ["Recommended", "Starters"]
    assert categories[0]["items"][0].name == "Chicken Parmigiano"
    assert categories[0]["items"][0].price == 645
    assert categories[1]["items"][0].name == "Garlic Bread"
    # only one page fetched — the second page must have returned nothing new to stop pagination
    assert client.call_tool.call_count == 2  # page 1 has data, page 2 empty => stop


@pytest.mark.asyncio
async def test_get_restaurant_menu_structured_stops_when_page_empty():
    calls = {"n": 0}

    async def fake_call(name, args):
        calls["n"] += 1
        if args["page"] == 1:
            return {
                "restaurant": {"id": "r1", "name": "Pimlico"},
                "categories": [{"title": "Mains", "items": [
                    {"id": "i1", "name": "Dosa", "price": 100, "isVeg": True},
                ]}],
            }
        return {"restaurant": {"id": "r1", "name": "Pimlico"}, "categories": []}

    client = SwiggyMCPClient(token="test-token")
    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    addr, restaurant, categories = await svc.get_restaurant_menu_structured("r1", address_id="a1")
    assert len(categories) == 1
    assert calls["n"] == 2  # page 1 (data) + page 2 (empty, stops)


@pytest.mark.asyncio
async def test_get_restaurant_menu_structured_dedupes_items_across_pages():
    async def fake_call(name, args):
        if args["page"] == 1:
            return {
                "restaurant": {"id": "r1", "name": "Pimlico"},
                "categories": [{"title": "Mains", "items": [
                    {"id": "i1", "name": "Dosa", "price": 100, "isVeg": True},
                ]}],
            }
        if args["page"] == 2:
            # same item repeated (e.g. overlapping page window) plus one new
            return {
                "restaurant": {"id": "r1", "name": "Pimlico"},
                "categories": [{"title": "Mains", "items": [
                    {"id": "i1", "name": "Dosa", "price": 100, "isVeg": True},
                    {"id": "i2", "name": "Idli", "price": 80, "isVeg": True},
                ]}],
            }
        return {"restaurant": {"id": "r1", "name": "Pimlico"}, "categories": []}

    client = SwiggyMCPClient(token="test-token")
    client.call_tool = AsyncMock(side_effect=fake_call)
    svc = SwiggyDiscoveryService(client=client)

    addr, restaurant, categories = await svc.get_restaurant_menu_structured("r1", address_id="a1")
    ids = {i.id for c in categories for i in c["items"]}
    assert ids == {"i1", "i2"}


# --- menu_chat ---

def _mock_llm(payload: dict) -> MagicMock:
    llm = MagicMock()
    resp = MagicMock()
    resp.content = json.dumps(payload)
    llm.invoke.return_value = resp
    return llm


def _make_categories():
    from app.schemas.swiggy import SwiggyMenuItem
    return [
        {"title": "Mains", "items": [
            SwiggyMenuItem(id="i1", name="Butter Chicken", price=350, is_veg=False),
            SwiggyMenuItem(id="i2", name="Paneer Tikka", price=280, is_veg=True),
        ]},
    ]


def test_menu_chat_happy_path_filters_to_valid_item_ids():
    llm = _mock_llm({
        "reply": "The Paneer Tikka is a great vegetarian pick!",
        "suggested_item_ids": ["i2", "not-a-real-id"],
    })
    req = MenuChatRequest(
        restaurant_id="r1",
        address_id="a1",
        messages=[MenuChatMessage(role="user", content="I'm vegetarian, what should I get?")],
    )
    result = get_menu_chat_reply(req, "Spice House", _make_categories(), llm=llm)
    assert result.success is True
    assert "Paneer Tikka" in result.reply
    assert result.suggested_item_ids == ["i2"]  # invalid id filtered out


def test_menu_chat_requires_last_message_from_user():
    req = MenuChatRequest(
        restaurant_id="r1",
        address_id="a1",
        messages=[MenuChatMessage(role="assistant", content="Hi there!")],
    )
    result = get_menu_chat_reply(req, "Spice House", _make_categories(), llm=_mock_llm({}))
    assert result.success is False


def test_menu_chat_soft_fails_on_llm_error():
    llm = MagicMock()
    llm.invoke.side_effect = RuntimeError("boom")
    req = MenuChatRequest(
        restaurant_id="r1",
        address_id="a1",
        messages=[MenuChatMessage(role="user", content="What's good here?")],
    )
    result = get_menu_chat_reply(req, "Spice House", _make_categories(), llm=llm)
    assert result.success is True  # soft-fail, not a hard error — chat UX must stay usable
    assert result.reply
    assert result.suggested_item_ids == []


def test_menu_chat_includes_dish_context_and_personalization_in_prompt(monkeypatch):
    from app.schemas.swiggy import MenuChatDishContext

    monkeypatch.setattr(
        "app.learning.persona.get",
        lambda user_id: {"archetype": "Comfort Seeker", "blurb": "", "drift_line": ""},
    )
    monkeypatch.setattr(
        "app.learning.tradeoffs.get_weights",
        lambda user_id: {"comfort": 0.4, "price": 0.3, "health": 0.1, "speed": 0.1, "adventure": 0.1},
    )

    llm = _mock_llm({"reply": "Sure!", "suggested_item_ids": []})
    req = MenuChatRequest(
        restaurant_id="r1",
        address_id="a1",
        dish_context=MenuChatDishContext(dish_id="d1", dish_name="Butter Chicken", why="comfort food"),
        messages=[MenuChatMessage(role="user", content="Anything similar?")],
        user_id="u1",
    )
    get_menu_chat_reply(req, "Spice House", _make_categories(), llm=llm)

    system_prompt = llm.invoke.call_args[0][0][0].content
    assert "Butter Chicken" in system_prompt
    assert "Comfort Seeker" in system_prompt
    assert "comfort" in system_prompt.lower()


def test_menu_chat_includes_allergies_and_dietary_prefs_as_hard_constraints():
    llm = _mock_llm({"reply": "Sure!", "suggested_item_ids": []})
    req = MenuChatRequest(
        restaurant_id="r1",
        address_id="a1",
        messages=[MenuChatMessage(role="user", content="What's good here?")],
        preferences=MenuChatPreferences(
            diets=["vegetarian"], allergies=["peanuts", "shellfish"], cuisines=["indian"],
        ),
    )
    get_menu_chat_reply(req, "Spice House", _make_categories(), llm=llm)

    system_prompt = llm.invoke.call_args[0][0][0].content
    assert "vegetarian" in system_prompt.lower()
    assert "peanuts" in system_prompt.lower()
    assert "shellfish" in system_prompt.lower()
    assert "ALLERGIES" in system_prompt


def test_menu_chat_prompt_includes_every_menu_item_no_truncation():
    # A large menu (well past the old 60-item cap) must appear in full —
    # Captain should never reason over only a subset of the live menu.
    categories = [
        {
            "title": "Mains",
            "items": [
                SwiggyMenuItem(id=f"i{i}", name=f"Dish {i}", price=100 + i, is_veg=True)
                for i in range(120)
            ],
        }
    ]
    llm = _mock_llm({"reply": "Sure!", "suggested_item_ids": []})
    req = MenuChatRequest(
        restaurant_id="r1",
        address_id="a1",
        messages=[MenuChatMessage(role="user", content="What's good here?")],
    )
    get_menu_chat_reply(req, "Spice House", categories, llm=llm)

    system_prompt = llm.invoke.call_args[0][0][0].content
    assert "Dish 0" in system_prompt
    assert "Dish 119" in system_prompt
