"""Preference brain: order record, time-decayed facts, context relations with shrinkage, score part."""

from datetime import datetime, timedelta

import pytest

from app.brain import facts as bf
from app.brain import orders as bo
from app.brain import scoring
from app.brain.relations import Relations
from app.history.normalise import IST
from app.learning import learner
from app.schemas.request import UserContext

NOW = datetime(2026, 10, 8, 12, 0, tzinfo=IST)


def _prof(cuisine, protein, form="curry_gravy", spice=0.5, heavy=0.6):
    return {"cuisine": cuisine, "protein": protein, "form": form, "spice": spice, "heaviness": heavy}


def _order(oid, days_ago, slot, weekday, items, total=400):
    when = (NOW - timedelta(days=days_ago)).replace(hour={"lunch": 13, "dinner": 21, "breakfast": 9}[slot])
    return {"order_id": oid, "ordered_at": when.isoformat(), "meal_slot": slot, "weekday": weekday, "restaurant": "R" + oid,
            "total": total, "items": [{"name": n, "dish_id": d, "quantity": 1, "veg": v, "profile": p} for n, d, v, p in items]}


BIRYANI = ("Chicken Biryani", "in_004", False, _prof("south_indian", "chicken", "rice_biryani", 0.7, 0.8))
BOWL = ("Greek Salad Bowl", None, True, _prof("mediterranean", "veg", "bowl", 0.1, 0.3))
PANEER = ("Paneer Tikka", None, True, _prof("north_indian", "paneer", "grill_kebab_steak", 0.6, 0.5))


def _history():
    """Weekday lunches are light bowls; Friday/Saturday dinners are biryani."""
    out = []
    for i in range(8):
        out.append(_order(f"l{i}", 2 + i * 3, "lunch", "tuesday", [BOWL]))
    for i in range(5):
        out.append(_order(f"d{i}", 1 + i * 7, "dinner", "saturday", [BIRYANI]))
    out.append(_order("p", 40, "dinner", "wednesday", [PANEER]))
    return out


def test_order_record_groups_items_and_ignores_replays():
    payload = {"source": "swiggy_history", "swiggy_order_id": "o1", "ordered_at": "2026-10-01T13:05:00+05:30",
               "meal_slot": "lunch", "weekday": "thursday", "item_name": "Bowl A", "profile": _prof("mediterranean", "chicken")}
    for name in ("Bowl A", "Cold Coffee", "Bowl A"):
        learner.apply_signal("b1", {"id": 0, "type": "order", "payload": {**payload, "item_name": name}, "context": {"time_of_day": "dinner"}})
    learner.apply_signal("b1", {"id": 0, "type": "order", "payload": {"dish_id": "in_002", "dish_name": "Dal Makhani"},
                                "context": {"server_ts": "2026-10-05T15:30:00Z", "time_of_day": "dinner"}})
    orders = bo.load("b1")
    assert [len(o["items"]) for o in orders] == [2, 1]
    assert orders[0]["meal_slot"] == "lunch"  # the order's own time, not the signal context
    app = orders[1]
    assert app["source"] == "app" and app["meal_slot"] == "dinner" and app["items"][0]["profile"]["method"] == "catalog"


def test_facts_favourites_decay_and_habit_gates():
    f = bf.compute(_history(), now=NOW)
    assert f["orders"] == 14 and f["favourites"][0]["name"] == "Greek Salad Bowl" and f["favourites"][0]["orders"] == 8
    assert f["slot_mix"]["lunch"] > f["slot_mix"]["dinner"] and f["reorder_rate"] > 0.8 and f["exploration_rate"] < 0.3
    assert any(x["id"] == "food.exploration" and x["text"] == "Sticks to known favourites" for x in f["facts"])
    assert bf.order_weight({"ordered_at": (NOW - timedelta(days=60)).isoformat()}, NOW) == pytest.approx(0.5)
    few = bf.compute(_history()[:3], now=NOW)
    assert not any(x["id"] == "food.exploration" for x in few["facts"])  # too few orders to claim a habit


def test_relations_link_contexts_and_shrink_sparse_ones():
    rel = Relations(_history(), NOW)
    lunch = rel.predict("lunch", "weekday")["distributions"]
    weekend_dinner = rel.predict("dinner", "weekend")["distributions"]
    assert next(iter(lunch["cuisine"])) == "mediterranean" and next(iter(weekend_dinner["cuisine"])) == "south_indian"
    assert weekend_dinner["form"]["rice_biryani"] > 0.5
    texts = [h["text"] for h in rel.highlights()]
    assert any("Dinner → south indian" in t or "Weekend → south indian" in t for t in texts)
    sparse = Relations(_history()[:1], NOW)  # one lunch order: the dinner context doesn't exist, prediction = user overall
    assert sparse.predict("dinner", None)["distributions"]["cuisine"] == sparse.predict(None, None)["distributions"]["cuisine"]
    assert rel.confidence("slot", "lunch") > rel.confidence("slot", "breakfast") == 0


def test_score_part_follows_the_context(monkeypatch):
    from app.data.dishes import DISHES_BY_ID

    for o in _history():
        for it in o["items"]:
            learner.apply_signal("b2", {"id": 0, "type": "order", "context": {}, "payload": {
                "source": "swiggy_history", "swiggy_order_id": o["order_id"], "ordered_at": o["ordered_at"], "meal_slot": o["meal_slot"],
                "weekday": o["weekday"], "item_name": it["name"], "dish_id": it["dish_id"], "profile": it["profile"]}})
    monkeypatch.setattr(scoring, "datetime", type("D", (), {"now": staticmethod(lambda tz=None: NOW)}))
    dishes = [DISHES_BY_ID["in_004"], DISHES_BY_ID["in_002"]]
    lunch = UserContext.model_validate({"mood": {"primary": "happy"}, "situational": {"time_of_day": "lunch", "day_of_week": "tuesday"}})
    dinner = UserContext.model_validate({"mood": {"primary": "happy"}, "situational": {"time_of_day": "dinner", "day_of_week": "saturday"}})
    s_lunch, s_dinner = scoring.dish_scores("b2", lunch, dishes), scoring.dish_scores("b2", dinner, dishes)
    assert s_dinner["in_004"] > s_lunch["in_004"]  # biryani belongs to weekend dinners
    assert s_dinner["in_004"] > s_dinner["in_002"]  # chicken favourite beats dal at that time
    assert scoring.dish_scores("nobody", lunch, dishes) == {} and scoring.dish_scores(None, lunch, dishes) == {}


def test_shortlist_carries_a_brain_part_only_with_history():
    from app.services.shortlist import build_scored_shortlist

    for o in _history():
        for it in o["items"]:
            learner.apply_signal("b3", {"id": 0, "type": "order", "context": {}, "payload": {
                "source": "swiggy_history", "swiggy_order_id": o["order_id"], "ordered_at": o["ordered_at"], "meal_slot": o["meal_slot"],
                "weekday": o["weekday"], "item_name": it["name"], "dish_id": it["dish_id"], "profile": it["profile"]}})
    ctx = UserContext.model_validate({"mood": {"primary": "happy"}, "situational": {"time_of_day": "dinner", "day_of_week": "saturday", "delivery_preferred": True}})
    assert any("brain" in s.parts for s in build_scored_shortlist(ctx, user_id="b3"))
    assert not any("brain" in s.parts for s in build_scored_shortlist(ctx, user_id="nobody"))


def test_brain_endpoint(client):
    from unittest.mock import patch

    for o in _history()[:4]:
        for it in o["items"]:
            learner.apply_signal("b4", {"id": 0, "type": "order", "context": {}, "payload": {
                "source": "swiggy_history", "swiggy_order_id": o["order_id"], "ordered_at": o["ordered_at"], "meal_slot": o["meal_slot"],
                "weekday": o["weekday"], "item_name": it["name"], "profile": it["profile"]}})
    with patch("app.learning.replay.ensure_user", return_value=None):
        r = client.get("/api/brain/b4", params={"slot": "lunch", "daytype": "weekday"}).json()
    assert r["success"] and r["food"]["orders"] == 4 and r["now"]["slot"] == "lunch" and "orders" not in r
    assert any(f["id"] == "food.top_cuisine" for f in r["facts"])
