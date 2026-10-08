"""Instamart grocery stream: parsing, go-to paging, profiles, facts (cooking habits, pantry, graph), storage."""

import json
from datetime import datetime
from unittest.mock import patch

from app.decisions import jev
from app.history import grocery as gr, grocery_facts as gf, grocery_profile as gp
from app.history.normalise import IST

NOW = datetime(2026, 10, 8, 12, 0, tzinfo=IST)
ORDER = {"orderId": "IM1", "createdAt": "2026-10-06T08:30:00+05:30", "itemCount": 3, "totalAmount": 412.4, "orderType": "INSTAMART",
         "storeName": "Baner Dark Store", "status": "DELIVERED",
         "deliveryAddress": {"id": "a1", "addressLine": "Flat 12, Sunshine CHS", "phoneNumber": "9876543210"},
         "paymentMethod": "UPI", "items": [{"name": "Amul Taaza Milk 1L", "quantity": 2, "itemId": "i1"}, {"name": "Onion 1kg", "quantity": 1}]}
GO_TO = {"productId": "p1", "displayName": "Pedigree Adult Wet Dog Food", "brand": "Pedigree", "variations": [
    {"displayName": "Pedigree Adult Wet Dog Food", "brandName": "Pedigree", "quantityDescription": "130 g",
     "price": {"offerPrice": 69, "mrp": 75}, "vegClassifier": "NONVEG", "imageUrl": "https://instamart.example/p1.png"}]}


def test_normalise_order_drops_personal_fields():
    o = gr.normalise_order(ORDER)
    assert o.ordered_at.startswith("2026-10-06T08:30") and o.meal_slot == "breakfast" and o.weekday == "tuesday"
    assert [(i.name, i.quantity) for i in o.items] == [("Amul Taaza Milk 1L", 2.0), ("Onion 1kg", 1.0)] and o.total == 412.4
    blob = json.dumps(o.to_dict())
    for secret in ("Sunshine", "9876543210", "UPI"):
        assert secret not in blob


def test_rules_know_pet_food_is_not_food():
    assert gp._rules("Pedigree Adult Wet Dog Food, Chicken & Liver", None).category == "non_food"


def test_epoch_timestamps_and_go_to_items():
    assert gr.normalise_order({**ORDER, "createdAt": 1791273000000}).ordered_at.startswith("2026-10-06")
    i = gr.normalise_go_to(GO_TO)
    assert (i.name, i.brand, i.pack, i.price, i.veg, i.product_id) == ("Pedigree Adult Wet Dog Food", "Pedigree", "130 g", 69.0, "non_veg", "p1")


class FakeIM:
    def __init__(self):
        self.calls = []

    def session(self):
        class _S:
            async def __aenter__(s): return s
            async def __aexit__(s, *a): return False
        return _S()

    async def call_tool(self, name, args):
        self.calls.append((name, args))
        if name == "get_orders":
            return {"orders": [ORDER] if args["orderType"] == "INSTAMART" else [ORDER, {**ORDER, "orderId": "IM2", "orderType": "DASH"}], "hasMore": False}
        if name == "get_addresses":
            return {"addresses": [{"id": "a1"}]}
        if name == "your_go_to_items":
            return {"products": [GO_TO], "nextOffset": 4}  # the live server repeats the last page
        raise AssertionError(name)


async def test_import_dedupes_orders_and_repeated_go_to_pages():
    fake = FakeIM()
    r = await gr.import_groceries(fake, known_ids=frozenset({"IM2"}))
    assert [o.order_id for o in r.orders] == ["IM1"] and r.returned == 2 and r.already_known == 1
    assert len(r.go_to) == 1 and sum(1 for n, _ in fake.calls if n == "your_go_to_items") == 2
    assert all(a["count"] == 20 for n, a in fake.calls if n == "get_orders")
    assert r.go_to[0].profile["category"] == "non_food"  # rules fallback in tests
    assert r.orders[0].items[0].profile["category"] == "dairy"


async def test_grocery_profiles_from_jev_force_non_food_roles():
    class FakeJev:
        async def decide(self, kind, state, questions, timeout_s=None):
            ch = {k: ("non_food" if k.endswith("category") else "ready_to_eat" if k.endswith("role") else "neutral", {}, 0.9)
                  for k in questions if not k.endswith("health")}
            return jev.Decision(model="m", nouls={}, choices=ch, scores={k: (2.0, {}, 0.8) for k in questions if k.endswith("health")},
                                input_tokens=1, latency_ms=1)
    with patch.object(jev, "get_client", return_value=FakeJev()):
        p = (await gp.profile_groceries([("All Out Liquid", "All Out", None)]))["All Out Liquid"]
    assert (p.category, p.cooking_role, p.healthiness, p.method, p.is_food) == ("non_food", "non_food", 0.5, "jev", False)


def _o(oid, day, items):
    return {"order_id": oid, "ordered_at": f"2026-{day}T09:00:00+05:30", "meal_slot": "breakfast", "weekday": "monday",
            "items": [{"name": n, "quantity": q, "profile": {"category": c, "cooking_role": r, "cuisine_hint": "indian",
                                                             "healthiness": 0.7, "veg": "veg"}} for n, q, c, r in items]}


MILK = ("Milk 1L", 2, "dairy", "scratch_ingredient")
ATTA = ("Atta 5kg", 1, "staples", "scratch_ingredient")
CHIPS = ("Chips", 1, "snacks", "snack_drink")
NOODLES = ("Instant Noodles", 4, "ready_to_eat", "ready_to_eat")


def test_facts_cooking_index_restock_pantry_and_graph():
    orders = [_o("1", "09-20", [MILK, ATTA]), _o("2", "09-27", [MILK, CHIPS]), _o("3", "10-04", [MILK, ATTA, NOODLES]), _o("4", "10-07", [MILK])]
    go_to = [{"name": "Dog Food", "profile": {"category": "non_food", "cooking_role": "non_food"}}]
    f = gf.compute(orders, go_to, now=NOW)
    assert f["top_items"][0]["name"] == "Milk 1L" and f["top_items"][0]["purchases"] == 4
    assert 0.55 <= f["cooking_index"] <= 1 and f["cooking_label"] == "cooks from scratch often"
    milk = next(c for c in f["restock"] if c["name"] == "Milk 1L")
    assert milk["every_days"] == 7 and milk["days_since"] == 1 and milk["restock_due"] is False
    assert {"a": "Atta 5kg", "b": "Milk 1L", "orders": 2} in f["co_purchase"]
    left = {p["name"]: p["likely_left"] for p in f["likely_pantry"]}
    assert left["Milk 1L"] > left["Chips"] > 0 and "Atta 5kg" in left  # chips: 11 of a snack's 14 days used
    assert f["household"] == ["dog"] and any(x["id"] == "grocery.household.dog" for x in f["facts"])
    assert f["diet_mix"] == {"veg": 1.0}


def test_cooking_index_waits_for_evidence():
    f = gf.compute([_o("1", "10-01", [CHIPS])], [], now=NOW)
    assert f["cooking_index"] is None and f["evidence"]["food_units"] < f["evidence"]["cooking_index_needs"]


def test_learner_keeps_groceries_and_brain_endpoint(client):
    from app.learning import learner

    learner.apply_signal("g-user", {"id": 0, "type": "grocery_order", "payload": {**_o("9", "10-07", [MILK, ATTA]), "source": "instamart_history"}})
    learner.apply_signal("g-user", {"id": 0, "type": "grocery_go_to", "payload": {"items": [{"name": "Dog Food", "profile": {"category": "non_food"}}]}})
    with patch("app.learning.replay.ensure_user", return_value=None):
        r = client.get("/api/brain/g-user/groceries").json()
    assert r["groceries"]["orders"] == 1 and r["groceries"]["household"] == ["dog"]


def test_groceries_route(client):
    assert client.post("/api/history/groceries/import", json={}).json()["success"] is False
    with patch("app.services.swiggy_mcp.SwiggyMCPClient", return_value=FakeIM()):
        r = client.post("/api/history/groceries/import", json={}, headers={"x-swiggy-user-token": "t"}).json()
    assert r["success"] and r["stats"]["new_orders"] == 2 and r["facts"]["top_items"]
    assert "Sunshine" not in json.dumps(r)
