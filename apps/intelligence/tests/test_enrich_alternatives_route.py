"""Tests for POST /api/swiggy/enrich-alternatives — live-matches healthier_swap
/budget_swap alternatives, streamed in after the original recommendation's
match (see intelligence/app/routes/swiggy.py:enrich_alternatives)."""

from unittest.mock import patch

import pytest

from app.schemas.swiggy import EnrichedMatch, SwiggyMenuItem
from app.services.swiggy_discovery import SwiggyDiscoveryService
from app.services.swiggy_mcp import SwiggyAddressRequiredError, SwiggyAuthError


@pytest.fixture
def client_fixture():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


def _matched(dish_id: str) -> EnrichedMatch:
    return EnrichedMatch(
        dish_id=dish_id,
        matched=True,
        item=SwiggyMenuItem(id=f"item_{dish_id}", name=f"Item {dish_id}", price=199.0),
    )


def test_enrich_alternatives_empty_items_returns_success_empty_matches(client_fixture):
    res = client_fixture.post("/api/swiggy/enrich-alternatives", json={"items": []})
    assert res.status_code == 200
    body = res.json()
    assert body == {
        "success": True,
        "address_id": None,
        "matches": [],
        "error": None,
        "address_required": False,
    }


def test_enrich_alternatives_matches_multiple_dishes_in_one_call(client_fixture):
    calls = []

    async def fake_enrich(self, dishes, city=None, address_id=None):
        calls.append(list(dishes))
        return "addr1", [_matched(d.id) for d in dishes]

    payload = {
        "items": [
            {"rec_id": "rec1", "dish_id": "d1", "type": "healthier_swap", "name": "Daal Rice"},
            {"rec_id": "rec1", "dish_id": "d2", "type": "budget_swap", "name": "Poha"},
        ]
    }

    with patch.object(SwiggyDiscoveryService, "enrich", fake_enrich):
        res = client_fixture.post("/api/swiggy/enrich-alternatives", json=payload)

    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["address_id"] == "addr1"
    assert len(calls) == 1  # single batched enrich() call, not one per item
    assert {d.id for d in calls[0]} == {"d1", "d2"}
    result_dish_ids = {m["dish_id"] for m in body["matches"]}
    assert result_dish_ids == {"d1", "d2"}


def test_enrich_alternatives_dedupes_same_dish_id_across_recs(client_fixture):
    calls = []

    async def fake_enrich(self, dishes, city=None, address_id=None):
        calls.append(list(dishes))
        return "addr1", [_matched(d.id) for d in dishes]

    payload = {
        "items": [
            {"rec_id": "rec1", "dish_id": "shared", "type": "healthier_swap", "name": "Daal Rice"},
            {"rec_id": "rec2", "dish_id": "shared", "type": "budget_swap", "name": "Daal Rice"},
        ]
    }

    with patch.object(SwiggyDiscoveryService, "enrich", fake_enrich):
        res = client_fixture.post("/api/swiggy/enrich-alternatives", json=payload)

    assert res.status_code == 200
    body = res.json()
    assert len(calls[0]) == 1  # deduped to a single dish input
    assert len(body["matches"]) == 2  # fanned back out to both recs
    rec_ids = {m["rec_id"] for m in body["matches"]}
    assert rec_ids == {"rec1", "rec2"}


def test_enrich_alternatives_unmatched_dish_omitted_from_response(client_fixture):
    async def fake_enrich(self, dishes, city=None, address_id=None):
        return "addr1", [EnrichedMatch(dish_id=d.id, matched=False) for d in dishes]

    payload = {
        "items": [{"rec_id": "rec1", "dish_id": "d1", "type": "healthier_swap", "name": "Daal Rice"}]
    }

    with patch.object(SwiggyDiscoveryService, "enrich", fake_enrich):
        res = client_fixture.post("/api/swiggy/enrich-alternatives", json=payload)

    assert res.status_code == 200
    assert res.json()["matches"] == []


def test_enrich_alternatives_address_required_returns_flag(client_fixture):
    async def fake_enrich(self, dishes, city=None, address_id=None):
        raise SwiggyAddressRequiredError("no address configured")

    payload = {
        "items": [{"rec_id": "rec1", "dish_id": "d1", "type": "healthier_swap", "name": "Daal Rice"}]
    }

    with patch.object(SwiggyDiscoveryService, "enrich", fake_enrich):
        res = client_fixture.post("/api/swiggy/enrich-alternatives", json=payload)

    assert res.status_code == 200
    body = res.json()
    assert body["success"] is False
    assert body["address_required"] is True


def test_enrich_alternatives_swiggy_auth_error_returns_error_not_500(client_fixture):
    async def fake_enrich(self, dishes, city=None, address_id=None):
        raise SwiggyAuthError("token expired")

    payload = {
        "items": [{"rec_id": "rec1", "dish_id": "d1", "type": "healthier_swap", "name": "Daal Rice"}]
    }

    with patch.object(SwiggyDiscoveryService, "enrich", fake_enrich):
        res = client_fixture.post("/api/swiggy/enrich-alternatives", json=payload)

    assert res.status_code == 200
    body = res.json()
    assert body["success"] is False
    assert body["error"]
