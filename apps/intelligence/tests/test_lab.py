"""Intelligence Lab: zero-cost tracing, the dev-only gate, and the trace contract the UI reads."""

import json
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import settings
from app.decisions import jev
from app.games import engine as g
from app.games import sessions
from app.lab import trace
from app.routes import lab
from app.schemas.request import Mood, Situational, UserContext

CTX = UserContext(mood=Mood(primary="tired", energy_level=2),
                  situational=Situational(time_of_day="dinner", weather="rainy", delivery_preferred=True))
ANSWERS = {
    "swipe": lambda q: {"liked": True},
    "this_or_that": lambda q: {"winner_id": q["options"][0]["id"]},
    "craving_radar": lambda q: {"yes": q["tag"] in ("crunchy", "spicy")},
    "story": lambda q: {"option_id": q["options"][0]["id"]},
    "bracket": lambda q: {"winner_id": q["options"][0]["id"]},
    "roulette": lambda q: {"accept": q["spin"] >= 2},
}


@pytest.fixture
def lab_client():
    app = FastAPI()
    app.include_router(lab.router)
    with TestClient(app) as c:
        yield c


class ConfidentJev:
    """Commits to the first option with 0.9 — enough to end a game once checked."""

    async def decide(self, kind, state, questions, timeout_s=None):
        keys = list(state["candidates"])
        trace.emit("jev.call", call=kind, fake=True)
        return jev.Decision(model="jev-1.13.0", nouls={}, scores={}, input_tokens=1, latency_ms=1,
                            choices={"commit": (keys[0], {k: (0.9 if k == keys[0] else 0.1 / (len(keys) - 1)) for k in keys}, 0.9)})


# --- collector ---------------------------------------------------------------------

def test_emit_is_a_noop_outside_collect():
    assert not trace.enabled()
    trace.emit("x", a=1)  # nothing to append to — must not raise
    with trace.collect() as events:
        assert trace.enabled()
        trace.emit("x", a=1)
    assert [e["kind"] for e in events] == ["x"] and events[0]["a"] == 1 and "t_ms" in events[0]
    assert not trace.enabled()


async def test_untraced_game_responses_carry_no_trace():
    s = sessions.start("story", CTX, None)
    r = await sessions.answer(s["session_id"], {"option_id": s["question"]["options"][0]["id"]})
    assert "trace" not in s and "trace" not in r


# --- gate --------------------------------------------------------------------------

def test_lab_is_never_available_in_production(monkeypatch):
    monkeypatch.setattr(settings, "lab_enabled", True)
    monkeypatch.setattr(settings, "environment", "production")
    assert not lab.lab_available()
    monkeypatch.setattr(settings, "environment", "development")
    assert lab.lab_available()
    monkeypatch.setattr(settings, "lab_enabled", False)
    assert not lab.lab_available()


def test_lab_routes_not_mounted_by_default(client):
    assert settings.lab_enabled is False
    assert client.get("/api/lab/health").status_code == 404


# --- game trace contract -------------------------------------------------------------

def _play(c, game, max_rounds=12):
    start = c.post("/api/lab/games/session", json={"user_context": CTX.model_dump(mode="json"), "game": game}).json()
    sid, q, steps = start["result"]["session_id"], start["result"]["question"], []
    for _ in range(max_rounds):
        r = c.post(f"/api/lab/games/session/{sid}/answer", json={"answer": ANSWERS[game](q)}).json()
        steps.append(r)
        if r["result"]["done"]:
            return start, steps
        q = r["result"]["question"]
    raise AssertionError("game never finished")


@pytest.mark.parametrize("game", list(sessions.GAMES))
def test_game_trace_shows_every_decision(lab_client, game):
    start, steps = _play(lab_client, game)
    ev = next(e for e in start["trace"] if e["kind"] == "game.start")
    assert ev["filters"]["catalog"] >= ev["filters"]["kept"] > 0
    assert len(ev["candidates"]) == len(ev["posterior"]) and all(c["parts"] for c in ev["candidates"])
    assert ev["chosen"] == ev["question_scores"][0]["key"] == start["result"]["question"]["key"]

    for r in steps:
        step = next(e for e in r["trace"] if e["kind"] == "game.step")
        assert sum(p["p"] for p in step["posterior"]) == pytest.approx(1.0, abs=1e-3)
        assert all("d_logit" in p and "p_before" in p for p in step["posterior"])
        assert step["leader"]["p"] == max(p["p"] for p in step["posterior"])
        assert step["done"] == r["result"]["done"] and (step["stop_reason"] == "continue") == (not step["done"])
        if not step["done"]:
            gains = [s["info_gain"] for s in step["next_question_scores"]]
            assert gains == sorted(gains, reverse=True)
            assert step["next_question"] == step["next_question_scores"][0]["key"] == r["result"]["question"]["key"]

    final = steps[-1]["trace"]
    decision = next(e for e in final if e["kind"] == "game.decision")
    assert [p["id"] for p in decision["picks"]] == steps[-1]["result"]["decision"]["dish_ids"]
    assert all(p["reasoning"]["mood_match"] for p in decision["picks"])
    assert any(e["kind"] == "explain" and e["sources"]["psychological_hook"] for e in final)
    assert any(e["kind"] == "game.signals" for e in final)
    json.dumps(start), json.dumps(steps)  # the UI gets plain JSON


def test_jev_commit_shows_up_with_probabilities(lab_client):
    with patch.object(jev, "get_client", return_value=ConfidentJev()):
        start = lab_client.post("/api/lab/games/session", json={"user_context": CTX.model_dump(mode="json"), "game": "story"}).json()
        sid = start["result"]["session_id"]
        state = sessions.load(sid)
        state["logits"] = {k: (3.5 if i == 0 else 0.0) for i, k in enumerate(state["logits"])}  # leader ~0.6
        state["steps"] = state["min_steps"] - 1  # this answer reaches min_steps
        sessions._save(sid, state)
        r = lab_client.post(f"/api/lab/games/session/{sid}/answer",
                            json={"answer": {"option_id": start["result"]["question"]["options"][0]["id"]}}).json()
    step = next(e for e in r["trace"] if e["kind"] == "game.step")
    commit = next(e for e in r["trace"] if e["kind"] == "engine.commit")
    assert step["stop_reason"] == "jev_commit" and step["jev_check"]["ran"] and step["jev_check"]["result"]["confidence"] == 0.9
    assert commit["ran"] and commit["confidence"] == 0.9 and len(commit["probabilities"]) == 4
    assert len(commit["option_order"]) == 4


def test_score_questions_matches_best_question():
    s = sessions.start("craving_radar", CTX, None)
    state = sessions.load(s["session_id"])
    qs = sessions._questions(state)
    rows = g.score_questions(state["logits"], qs)
    assert rows[0]["question"] is g.best_question(state["logits"], qs)
    assert all(r["info_gain"] >= -1e-9 for r in rows)


# --- recommendation trace ---------------------------------------------------------------

def test_recommend_trace_has_blend_table_and_timings(lab_client, monkeypatch):
    from tests.test_engine import FakeJev

    monkeypatch.setattr(settings, "ranker_provider", "jev")
    with patch.object(jev, "get_client", return_value=FakeJev(fit=lambda n: 0.9 if "Dal" in n else 0.3)):
        r = lab_client.post("/api/lab/recommend", json={"user_context": CTX.model_dump(mode="json"), "request_id": "lab-1",
                                                       "recommendation_config": {"count": 3}}).json()
    kinds = [e["kind"] for e in r["trace"]]
    assert {"pipeline.shortlist", "engine.rank", "pipeline.rank", "engine.commit", "pipeline.summary"} <= set(kinds)
    rank = next(e for e in r["trace"] if e["kind"] == "engine.rank")
    assert rank["provider"] == "jev" and rank["jev_weight"] == settings.jev_weight
    assert all(row["blended"] == pytest.approx((1 - rank["jev_weight"]) * row["rule_norm"] + rank["jev_weight"] * row["jev_fit"], abs=1e-3)
               for row in rank["rows"] if row["jev_fit"] is not None)
    summary = next(e for e in r["trace"] if e["kind"] == "pipeline.summary")
    assert summary["ranker"] == "jev" and summary["latency_ms"]["total"] >= 0
    assert len(r["result"]["recommendations"]) == 3


# --- other lab endpoints ----------------------------------------------------------------------

def test_catalog_health_and_playground_errors(lab_client):
    hits = lab_client.get("/api/lab/catalog", params={"q": "dal"}).json()
    assert hits["total"] > 0 and all("dal" in d["name"].lower() or "dal" in d["cuisine"].lower() for d in hits["dishes"])
    full = lab_client.get(f"/api/lab/catalog/{hits['dishes'][0]['id']}").json()
    assert "sensory" in full and "swiggy_aliases" in full
    assert lab_client.get("/api/lab/catalog/nope").status_code == 404
    health = lab_client.get("/api/lab/health").json()
    assert health["catalog"]["dishes"] > 400 and "configured" in health["jev"]
    assert lab_client.post("/api/lab/jev", json={"state": {}, "questions": {"q": {"type": "noul", "instructions": "x"}}}).status_code == 503


def test_map_items_trace(lab_client):
    r = lab_client.post("/api/lab/map-items", json={"items": ["Dal Makhani (Half)", "Zzzz Unknown Thing"]}).json()
    by_item = {x["item"]: x for x in r["result"]}
    assert by_item["Dal Makhani (Half)"]["dish"] == "Dal Makhani"
    ev = next(e for e in r["trace"] if e["kind"] == "food_graph.map")
    assert {i["item"] for i in ev["items"]} == set(by_item)


def test_jev_switch_is_per_request(lab_client):
    fake = ConfidentJev()
    with patch.object(settings, "jev_api_key", "k"), patch.object(jev, "_client", fake):
        assert jev.get_client() is fake
        with jev.switched_off():
            assert jev.get_client() is None
        assert jev.get_client() is fake  # restored
        start = lab_client.post("/api/lab/games/session", json={"user_context": CTX.model_dump(mode="json"), "game": "story"}).json()
        sid = start["result"]["session_id"]
        state = sessions.load(sid)
        state["logits"] = {k: (3.5 if i == 0 else 0.0) for i, k in enumerate(state["logits"])}
        state["steps"] = state["min_steps"] - 1  # this answer reaches min_steps
        sessions._save(sid, state)
        r = lab_client.post(f"/api/lab/games/session/{sid}/answer", params={"jev": "false"},
                            json={"answer": {"option_id": start["result"]["question"]["options"][0]["id"]}}).json()
    commit = next(e for e in r["trace"] if e["kind"] == "engine.commit")
    assert commit == {**commit, "ran": False, "reason": "JEV off (no key, or switched off for this run)"}


# --- Swiggy read-only guard ----------------------------------------------------------------

WRITE_TOOLS = ["update_food_cart", "get_food_cart", "track_food_order", "flush_food_cart", "apply_food_coupon", "place_food_order", "confirm_order",
               "create_address", "delete_address", "update_cart", "clear_cart", "some_new_tool"]


@pytest.mark.parametrize("tool", WRITE_TOOLS)
async def test_lab_mode_refuses_every_non_discovery_tool(monkeypatch, tool):
    from unittest.mock import AsyncMock

    from app.services import swiggy_mcp

    monkeypatch.setattr(settings, "lab_enabled", True)
    client = swiggy_mcp.SwiggyMCPClient(token="tok")
    network = AsyncMock(side_effect=AssertionError("must not reach Swiggy"))
    monkeypatch.setattr(client, "_call_once", network, raising=False)
    for call in (client.call_tool, client.call_tool_once):
        with pytest.raises(swiggy_mcp.SwiggyWriteBlockedError):
            await call(tool, {})
    network.assert_not_called()


async def test_read_tools_pass_the_guard_and_writes_work_outside_lab(monkeypatch):
    from app.services import swiggy_mcp

    async def fake(self, name, arguments):
        return {"ok": name}

    monkeypatch.setattr(swiggy_mcp.SwiggyMCPClient, "_call_tool", fake)
    client = swiggy_mcp.SwiggyMCPClient(token="tok")
    monkeypatch.setattr(settings, "lab_enabled", True)
    assert await client.call_tool("search_menu", {}) == {"ok": "search_menu"}
    monkeypatch.setattr(settings, "lab_enabled", False)
    assert await client.call_tool("update_food_cart", {}) == {"ok": "update_food_cart"}  # product path unchanged


def test_lab_addresses_endpoint_hides_phone_numbers(lab_client):
    from app.services import swiggy_mcp

    async def fake(self, name, arguments):
        assert name == "get_addresses"
        return {"addresses": [{"id": "a1", "addressLine": "12 MG Road", "phoneNumber": "9999999999", "addressTag": "Home"}]}

    with patch.object(swiggy_mcp.SwiggyMCPClient, "_call_tool", fake), \
         patch("app.services.swiggy_token.load_token", return_value="tok"):
        r = lab_client.get("/api/lab/swiggy/addresses").json()
    assert r["result"]["addresses"] == [{"id": "a1", "label": "Home", "line": "12 MG Road"}]
    assert "9999999999" not in json.dumps(r)
    assert any(e["kind"] == "swiggy.call" and e["tool"] == "get_addresses" for e in r["trace"])


def test_food_graph_summary(lab_client):
    lab_client.post("/api/lab/map-items", json={"items": ["Dal Makhani (Half)"]})
    s = lab_client.get("/api/lab/food-graph/summary").json()
    assert s["dishes"] > 400 and s["coverage"]["sensory_profile"] == s["dishes"]
    assert sum(s["by"]["cuisine"].values()) == s["dishes"]
    assert s["mapping_cache"]["items"] >= 1 and s["mapping_cache"]["recent"][0]["dish"] == "Dal Makhani"
    full = lab_client.get("/api/lab/catalog", params={"limit": 1000, "full": "true"}).json()
    assert full["total"] == s["dishes"] and "sensory" in full["dishes"][0]
