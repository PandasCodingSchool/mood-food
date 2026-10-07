"""Food graph: Swiggy item → dish mapping, cache, order-history import, scout cache."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings
from app.decisions import jev
from app.food_graph import mapping


def _fake_jev(picks: dict[str, tuple[str, float]]):
    """picks: item name -> (chosen option label 'd1'/'none_of_these', probability)."""
    client = MagicMock()

    async def decide(kind, state, questions, timeout_s=None):
        choices = {}
        for key, entry in state.items():
            name = entry["menu_item"]
            if name in picks:
                choice, p = picks[name]
                choices[key] = (choice, {choice: p}, p)
        return jev.Decision(model="jev-1.13.0", nouls={}, choices=choices, scores={}, input_tokens=100, latency_ms=5)

    client.decide = AsyncMock(side_effect=decide)
    return client


def test_normalise_strips_portions_and_tags():
    assert mapping.normalise("Chicken Biryani (Serves 1) [Bestseller]") == "chicken biryani"
    assert mapping.normalise("Paneer Butter Masala - Half") == "paneer butter masala"
    assert mapping.normalise("Veg Momos 8 Pcs") == "veg momos"


def test_candidates_respect_protein_and_veg():
    names = [d.name for d in mapping.candidates("Hyderabadi Chicken Dum Biryani", is_veg=False)]
    assert "Hyderabadi Mutton Biryani" not in names and any("Chicken" in n for n in names)
    veg = mapping.candidates("Paneer Tikka Masala", is_veg=True)
    assert veg and all("non_veg" not in d.dietary_tags for d in veg)


async def test_exact_match_needs_no_model():
    with patch.object(jev, "get_client", return_value=None):
        out = await mapping.map_items([("Dal Makhani (Serves 1)", True)])
    m = out["Dal Makhani (Serves 1)"]
    assert m.dish_id == "in_002" and m.method == "exact"
    assert mapping.lookup("dal makhani") is not None  # cached


async def test_jev_maps_and_caches_including_no_match():
    client = _fake_jev({"Hyderabadi Chicken Dum Biryani": ("d2", 0.93), "Mystery Platter": ("none_of_these", 0.9)})
    with patch.object(jev, "get_client", return_value=client):
        out = await mapping.map_items([("Hyderabadi Chicken Dum Biryani", False), ("Mystery Platter", None)])
    biryani = out["Hyderabadi Chicken Dum Biryani"]
    assert biryani.method == "jev" and biryani.dish_id is not None
    assert mapping.dish(biryani.dish_id).protein == "chicken"
    # second call comes from the cache: no model call
    with patch.object(jev, "get_client", return_value=_fake_jev({})) as again:
        cached = await mapping.map_items([("Hyderabadi Chicken Dum Biryani", False)])
    assert cached["Hyderabadi Chicken Dum Biryani"].dish_id == biryani.dish_id
    again.return_value.decide.assert_not_called()


async def test_low_confidence_stays_unresolved_and_uncached():
    client = _fake_jev({"Chicken Something Special": ("d1", 0.55)})
    with patch.object(jev, "get_client", return_value=client):
        out = await mapping.map_items([("Chicken Something Special", False)])
    assert out["Chicken Something Special"].dish_id is None
    assert mapping.lookup("Chicken Something Special") is None


def test_order_summary_follows_documented_schema():
    from app.services.swiggy_order import _normalize_order_summary

    raw = {
        "orderId": "o1", "restaurantId": "r9", "restaurantName": "Paradise", "orderTotal": "₹540",
        "orderStatus": "Delivered", "orderType": "food", "orderedItems": "Chicken Biryani x 2, Double Ka Meetha x 1",
        "orderedTime": "2026-10-01T20:15:00+05:30", "isActiveOrder": False,
        "actions": [{"type": "REORDER", "priority": 1, "title": "Reorder", "isEnabled": True,
                     "reorderMeta": {"orderItems": [{"name": "Chicken Biryani", "menu_item_id": "m1"}, {"name": "Double Ka Meetha"}]}}],
    }
    o = _normalize_order_summary(raw)
    assert (o.restaurant_name, o.restaurant_id, o.ordered_at, o.status) == ("Paradise", "r9", "2026-10-01T20:15:00+05:30", "Delivered")
    assert o.item_names == ["Chicken Biryani", "Double Ka Meetha"]
    del raw["actions"]
    assert _normalize_order_summary(raw).item_names == ["Chicken Biryani", "Double Ka Meetha"]


async def test_get_orders_sends_only_documented_params():
    from app.services.swiggy_order import SwiggyOrderService

    client = MagicMock()
    client.call_tool = AsyncMock(return_value={"success": True, "data": {"orders": []}})
    await SwiggyOrderService(client=client).get_orders("addr_1", 5)
    client.call_tool.assert_awaited_once_with("get_food_orders", {"addressId": "addr_1"})


def test_swiggy_history_endpoint_maps_items(client, monkeypatch):
    from contextlib import asynccontextmanager

    from app.services import swiggy_order

    orders_payload = {"success": True, "data": {"orders": [
        {"orderId": "o1", "restaurantId": "r1", "restaurantName": "Paradise", "orderTotal": "₹540",
         "orderStatus": "Delivered", "orderType": "food", "orderedItems": "Dal Makhani x 1, Garlic Naan x 2",
         "orderedTime": "2026-10-01T20:15:00+05:30", "isActiveOrder": False, "actions": []},
    ]}}

    async def fake_call(name, args):
        if name == "get_addresses":
            return {"success": True, "data": {"addresses": [{"id": "addr_recent"}]}}
        assert name == "get_food_orders" and args == {"addressId": "addr_recent"}
        return orders_payload

    class FakeService:
        def __init__(self, token=None):
            self.client = MagicMock()
            self.client.call_tool = AsyncMock(side_effect=fake_call)

            @asynccontextmanager
            async def session():
                yield None

            self.client.session = session

        most_recent_address_id = swiggy_order.SwiggyOrderService.most_recent_address_id
        get_orders = swiggy_order.SwiggyOrderService.get_orders

    monkeypatch.setattr(swiggy_order, "SwiggyOrderService", FakeService)
    resp = client.post("/api/food-graph/swiggy-history", json={}, headers={"x-swiggy-user-token": "t"}).json()
    assert resp["success"] is True
    items = resp["orders"][0]["items"]
    assert {i["name"]: i["dish_id"] for i in items} == {"Dal Makhani": "in_002", "Garlic Naan": items[1]["dish_id"]}
    assert items[1]["dish_name"] == "Garlic Naan"


def test_swiggy_history_requires_user_token(client):
    assert client.post("/api/food-graph/swiggy-history", json={}).json()["success"] is False


def test_form_guard_and_synonyms():
    # keema pav is not keema paratha (different form); keema isn't a protein signal
    assert "Chicken Keema Paratha" not in [d.name for d in mapping.candidates("Chicken Keema Pav", is_veg=False)]
    # makhani == butter
    assert "Paneer Butter Masala" in [d.name for d in mapping.candidates("Special Paneer Makhani", is_veg=True)]
    assert "Butter Chicken" in [d.name for d in mapping.candidates("Murgh Makhani", is_veg=False)]
