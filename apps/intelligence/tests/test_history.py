"""Order-history ingestion: parsing the measured Swiggy formats, privacy, accumulation, item profiles."""

import json
from datetime import datetime
from unittest.mock import patch

import pytest

from app.decisions import jev
from app.history import ingest, normalise as nm, profile as pf

SUMMARY = {
    "orderId": "100000000000001", "restaurantId": "555", "restaurantName": "Bowl Theory", "restaurantAreaName": "Baner",
    "orderTotal": "₹1,249.50", "orderStatus": "Delivered", "orderDeliveryStatus": "Delivered", "orderType": "DELIVERY",
    "orderedItems": "Mediterranean Chicken Bowl (Non Veg) (2), Cold Coffee (Large, Sugar Free) (1)",
    "orderedTime": "September 1, 1:09 PM", "isActiveOrder": False, "actions": [],
}
DETAILS = """Order 100000000000001 — Bowl Theory (Baner)
Delivered | DELIVERY
Placed: 2026-09-01 13:09:42
Items (3):
  - Mediterranean Chicken Bowl (Non Veg) — ₹449 | Non-Veg [Image: https://media-assets.swiggy.com/FOOD_CATALOG/IMAGES/CMS/2026/1/1/abc.png]
      Extra feta ₹49
  - Cold Coffee (Large, Sugar Free) — ₹199 | Veg [Image: https://media-assets.swiggy.com/xyz]
Delivery address: Flat 12, Sunshine CHS, Baner, Pune 411045 (+91 98765 43210)
Total paid: ₹1,249.50
Payment: UPI (secret@okbank)
Reorderable: yes"""
NOW = datetime(2026, 10, 8, 12, 0, tzinfo=nm.IST)


def test_normalise_reads_the_measured_formats():
    o = nm.normalise(SUMMARY, DETAILS, now=NOW)
    assert o.ordered_at == "2026-09-01T13:09:42+05:30" and o.meal_slot == "lunch" and o.weekday == "tuesday" and not o.is_weekend
    assert o.restaurant_name == "Bowl Theory" and o.total == 1249.5 and o.status == "Delivered"
    bowl, coffee = o.items
    assert (bowl.name, bowl.quantity, bowl.price, bowl.veg) == ("Mediterranean Chicken Bowl (Non Veg)", 2, 449.0, False)
    assert bowl.image_url.startswith("https://media-assets.swiggy.com/")
    assert (coffee.name, coffee.quantity, coffee.veg) == ("Cold Coffee (Large, Sugar Free)", 1, True)
    assert o.to_dict()["item_count"] == 3


def test_personal_fields_never_survive():
    blob = json.dumps(nm.normalise(SUMMARY, DETAILS, now=NOW).to_dict())
    for secret in ("Sunshine", "411045", "98765", "secret@okbank", "UPI", "Flat 12"):
        assert secret not in blob


def test_summary_only_and_year_inference():
    o = nm.normalise({**SUMMARY, "orderedTime": "December 30, 9:15 PM"}, None, now=datetime(2026, 1, 5, tzinfo=nm.IST))
    assert o.ordered_at.startswith("2025-12-30T21:15") and o.meal_slot == "dinner"
    assert [(i.name, i.quantity) for i in o.items] == [("Mediterranean Chicken Bowl (Non Veg)", 2), ("Cold Coffee (Large, Sugar Free)", 1)]


@pytest.mark.parametrize("hour,slot", [(2, "late_night"), (5, "breakfast"), (10, "breakfast"), (11, "lunch"), (16, "dinner"), (21, "dinner"), (22, "late_night")])
def test_meal_slots_match_the_api(hour, slot):
    assert nm.meal_slot(hour) == slot


class FakeSwiggy:
    def __init__(self, fail_details=False):
        self.calls, self.fail_details = [], fail_details

    def session(self):
        class _S:
            async def __aenter__(s): return s
            async def __aexit__(s, *a): return False
        return _S()

    async def call_tool(self, name, args):
        self.calls.append((name, args))
        if name == "get_addresses":
            return {"addresses": [{"id": "a-empty"}, {"id": "a-home"}]}
        if name == "get_food_orders":
            if args["addressId"] == "a-empty":
                return {"orders": [], "total": 0}
            return {"orders": [SUMMARY, {**SUMMARY, "orderId": "100000000000002", "orderedItems": "Tarri pohe (1)",
                                         "orderedTime": "June 18, 11:29 AM"}], "total": 2}
        if name == "get_food_order_details":
            if self.fail_details:
                raise RuntimeError("boom")
            return DETAILS if args["orderId"] == "100000000000001" else "Placed: 2026-06-18 11:29:00\n  - Tarri pohe — ₹90 | Veg"
        raise AssertionError(name)


async def test_import_accumulates_and_skips_known_orders():
    fake = FakeSwiggy()
    r = await ingest.import_orders(fake, known_ids=frozenset({"100000000000001"}))
    assert [o.order_id for o in r.orders] == ["100000000000002"]
    assert r.stats()["returned"] == 2 and r.stats()["already_known"] == 1 and r.reported_total == 2
    assert all(a.get("orderCount") == 15 for n, a in fake.calls if n == "get_food_orders")
    details = [a["orderId"] for n, a in fake.calls if n == "get_food_order_details"]
    assert details == ["100000000000002"]  # known orders are never re-fetched
    pohe = r.orders[0].items[0]
    assert pohe.price == 90 and pohe.veg is True and pohe.profile["protein"] == "veg"  # rules profile (JEV off in tests)


async def test_details_failure_falls_back_to_the_summary():
    r = await ingest.import_orders(FakeSwiggy(fail_details=True))
    assert r.stats()["details_failed"] == 2 and all(o.items for o in r.orders)


class FakeJev:
    def __init__(self):
        self.calls = 0

    async def decide(self, kind, state, questions, timeout_s=None):
        self.calls += 1
        choices = {k: ({"cuisine": "mediterranean", "protein": "chicken", "form": "bowl"}[k.split("_")[1]], {}, 0.9)
                   for k in questions if k.split("_")[1] in ("cuisine", "protein", "form")}
        scores = {k: (1.0 if k.endswith("spice") else 3.0, {}, 0.8) for k in questions if k.endswith(("spice", "heavy"))}
        return jev.Decision(model="jev-1.13.0", nouls={}, choices=choices, scores=scores, input_tokens=1, latency_ms=1)


async def test_item_profiles_come_from_jev_and_are_cached():
    fake = FakeJev()
    with patch.object(jev, "get_client", return_value=fake):
        p = (await pf.profile_items([("Mediterranean Chicken Bowl (Non Veg)", False, None)]))["Mediterranean Chicken Bowl (Non Veg)"]
        again = await pf.profile_items([("Mediterranean Chicken Bowl (Non Veg)", False, None)])
    assert (p.cuisine, p.protein, p.form, p.spice, p.heaviness, p.method) == ("mediterranean", "chicken", "bowl", 0.25, 0.75, "jev")
    assert p.catalog_cuisine == "mediterranean" and fake.calls == 1 and again["Mediterranean Chicken Bowl (Non Veg)"] == p


async def test_profile_falls_back_to_catalog_then_rules():
    from app.data.dishes import DISHES_BY_ID

    p = (await pf.profile_items([("Dal Makhani Full", True, "in_002")]))["Dal Makhani Full"]
    assert p.method == "catalog" and p.protein == DISHES_BY_ID["in_002"].protein
    q = (await pf.profile_items([("Mystery Buff Steak", False, None)]))["Mystery Buff Steak"]
    assert (q.method, q.protein) == ("rules", "beef_buff")


def test_import_route(client):
    assert client.post("/api/history/import", json={}).json()["success"] is False  # no user token
    with patch("app.services.swiggy_mcp.SwiggyMCPClient", return_value=FakeSwiggy()):
        r = client.post("/api/history/import", json={"known_order_ids": []}, headers={"x-swiggy-user-token": "t"}).json()
    assert r["success"] and r["stats"]["new"] == 2
    assert "Sunshine" not in json.dumps(r)


def test_history_orders_teach_patterns_at_their_own_time():
    from app.learning import learner, store

    sig = {"id": 0, "type": "order", "payload": {"dish_id": "in_004", "source": "swiggy_history", "meal_slot": "dinner", "weekday": "friday"},
           "context": {"source": "swiggy_history", "time_of_day": "lunch", "day_of_week": "tuesday"}}  # import time
    learner.apply_signal("hist-user", sig)
    pats = store.get_usage("hist-user", "context_patterns", {})
    assert "friday:dinner" in pats and "tuesday:lunch" not in pats
