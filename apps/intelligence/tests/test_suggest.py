"""Suggested for you: familiar picks + one stretch, grounded reasons, caching, outcome tracking."""

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app.brain import suggest as sos
from app.brain import success
from app.data.dishes import DISHES_BY_ID
from app.decisions import jev
from app.learning import learner, store
from tests.test_brain import BIRYANI, BOWL, _history, _order
from tests.test_engine import FakeJev
from tests.test_houses import _feed


@pytest.fixture
def user():
    _feed("s1", _history())
    store.set_usage("s1", "order_occasions", {o["order_id"]: {"label": "work_lunch" if o["meal_slot"] == "lunch" else "treat"}
                                               for o in _history()})
    return "s1"


async def test_suggest_has_one_true_stretch_and_distinct_reasons(user):
    fake = FakeJev(fit=lambda n: 0.8)
    with patch.object(jev, "get_client", return_value=fake):
        r = await sos.suggest(user, slot="lunch", daytype="weekday")
    assert r["cached"] is False and len(r["recommendations"]) == 3 and r["ranker"] == "jev"
    kinds = [r["reasons"][x["dish"]["id"]]["kind"] for x in r["recommendations"]]
    assert kinds.count("stretch") == 1 and r["stretch_dish_id"]
    stretch = DISHES_BY_ID[r["stretch_dish_id"]]
    ordered = {i["dish_id"] for o in _history() for i in o["items"] if i["dish_id"]}
    assert stretch.id not in ordered
    texts = [v["text"] for v in r["reasons"].values()]
    assert len(set(texts)) == len(texts)
    assert r["occasion"] == "work_lunch" and r["situation"] == "fuel" and r["mood_used"] is None  # no mood invented
    assert not any("feeling" in x["ai_reasoning"]["mood_match"] for x in r["recommendations"])


async def test_cache_no_jev_calls_on_repeat_but_new_evidence_and_ttl_recompute(user, monkeypatch):
    fake = FakeJev(fit=lambda n: 0.7)
    with patch.object(jev, "get_client", return_value=fake):
        first = await sos.suggest(user, slot="dinner", daytype="weekend")
        n = len(fake.calls)
        again = await sos.suggest(user, slot="dinner", daytype="weekend")
        assert again["cached"] is True and len(fake.calls) == n and again["recommendations"] == first["recommendations"]
        assert (await sos.suggest(user, slot="dinner", daytype="weekend", refresh=True))["cached"] is False
        _feed(user, [_order("new", 0, "dinner", "saturday", [BIRYANI])])          # new evidence → recompute
        assert (await sos.suggest(user, slot="dinner", daytype="weekend"))["cached"] is False
        later = sos.time.time() + sos.CACHE_TTL_S + 1
        monkeypatch.setattr(sos.time, "time", lambda: later)                       # TTL → recompute (live availability moves)
        assert (await sos.suggest(user, slot="dinner", daytype="weekend"))["cached"] is False


async def test_without_history_there_is_no_stretch():
    r = await sos.suggest("nobody", slot="lunch", daytype="weekday")
    assert r["stretch_dish_id"] is None and len(r["recommendations"]) == 3
    assert all(v["kind"] == "fit" for v in r["reasons"].values())


async def test_runs_are_logged_and_success_joins_orders(user):
    with patch.object(jev, "get_client", return_value=FakeJev()):
        r = await sos.suggest(user, slot="lunch", daytype="weekday")
    row = store.fetchone("SELECT mode, shadow_json FROM recommendation_runs WHERE request_id = ?", (r["request_id"],))
    assert row["mode"] == "sos_home" and json.loads(row["shadow_json"])["suggest"]["stretch"] == r["stretch_dish_id"]
    soon = (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()
    learner.apply_signal(user, {"id": 0, "type": "order", "payload": {"dish_id": r["stretch_dish_id"],
                                                                      "dish_name": DISHES_BY_ID[r["stretch_dish_id"]].name},
                                "context": {"server_ts": soon, "time_of_day": "lunch"}})
    m = success.compute(user)
    assert m["suggestions"] == 1 and m["followed_rate"] == 1.0 and m["exact_rate"] == 1.0 and m["stretch_accept_rate"] == 1.0


def test_success_without_follow_up_order(user):
    store.execute("INSERT INTO recommendation_runs (request_id, user_id, mode, selected_json, shadow_json) VALUES (?, ?, ?, ?, ?)",
                  ("old-1", user, "sos_home", json.dumps(["in_004"]), json.dumps({"suggest": {"stretch": "in_002"}})))
    m = success.compute(user)
    assert m["suggestions"] == 1 and m["followed_rate"] == 0.0 and m["stretch_accept_rate"] == 0.0


def test_suggest_endpoint(client, user):
    with patch("app.learning.replay.ensure_user", return_value=None):
        r = client.post(f"/api/brain/{user}/suggest", json={"slot": "lunch", "daytype": "weekday"}).json()
        m = client.get(f"/api/brain/{user}/success").json()
    assert r["success"] and len(r["recommendations"]) == 3 and r["reasons"]
    assert m["success"] and m["suggestions"] >= 1
