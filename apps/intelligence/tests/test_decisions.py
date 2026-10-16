"""JEV decision layer: question builders, client guards, shadow ranking (no network)."""

import json
import re
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings
from app.data.dishes import DISHES_BY_ID
from app.decisions import jev, questions, ranker
from app.schemas.request import Budget, GameData, Mood, Preferences, Situational, UserContext

CANDS = [DISHES_BY_ID[i] for i in ("in_002", "in_010", "it_008", "in_007")]


def _ctx():
    return UserContext(
        mood=Mood(primary="tired", energy_level=2, hunger_level=8, stress_level=5, social_context="solo"),
        preferences=Preferences(dietary_restrictions=["vegetarian"], allergies=["nuts"], cuisine_types=["indian"]),
        situational=Situational(time_of_day="dinner", weather="rainy", budget=Budget(max=400)),
        game_data=GameData(type="craving_radar", craving_tags=["brothy"], disliked=["Caesar Salad"]),
    )


def _fake_sdk(nouls=None, choice=None, fail=None):
    sdk = MagicMock()
    if fail:
        sdk.system_one = AsyncMock(side_effect=fail)
        return sdk
    resp = SimpleNamespace(
        model="jev-1.13.0",
        nouls={k: SimpleNamespace(noul=v) for k, v in (nouls or {}).items()},
        choices={k: SimpleNamespace(choice=c, probabilities=p, confidence=conf) for k, (c, p, conf) in (choice or {}).items()},
        scores={},
        usage=SimpleNamespace(input_tokens=500),
    )
    sdk.system_one = AsyncMock(return_value=resp)
    return sdk


# --- question builders --------------------------------------------------------

def test_person_state_uses_words_not_numbers():
    person = questions.person_state(_ctx())
    assert person["energy"] == "low" and person["hunger"] == "high" and person["stress"] == "medium"
    assert person["budget"] == "mid-range or cheaper"
    assert person["diet"] == ["vegetarian"] and person["allergies"] == ["nuts"]
    assert person["cravings"] == ["brothy"]
    assert not re.search(r"\d", json.dumps(person)), "Jev is weak at numbers — buckets only"


def test_ranking_state_and_nouls_line_up():
    state = questions.ranking_state(_ctx(), CANDS)
    assert list(state["candidates"]) == ["c1", "c2", "c3", "c4"]
    assert state["candidates"]["c1"]["name"] == CANDS[0].name
    assert state["candidates"]["c1"]["price"] in {"budget", "mid-range", "premium"}
    qs = questions.candidate_fit_nouls(CANDS)
    assert list(qs) == ["fit_c1", "fit_c2", "fit_c3", "fit_c4"]
    assert "`candidates.c3`" in qs["fit_c3"].instructions


def test_empty_fields_dropped():
    person = questions.person_state(UserContext(mood=Mood(primary="happy")))
    assert set(person) == {"mood", "energy"}


def test_shuffled_choice_is_seeded_and_complete():
    opts = {f"c{i}": None for i in range(1, 6)}
    a = jev.shuffled_choice("q", opts, "seed-1")
    b = jev.shuffled_choice("q", opts, "seed-1")
    assert list(a.criteria) == list(b.criteria)
    assert set(a.criteria) == set(opts)
    orders = {tuple(jev.shuffled_choice("q", opts, f"s{i}").criteria) for i in range(20)}
    assert len(orders) > 1


# --- client guards -------------------------------------------------------------

async def test_decide_maps_answers():
    client = jev.JevClient(_fake_sdk(nouls={"fit_c1": 0.9}, choice={"commit": ("c1", {"c1": 0.8, "c2": 0.2}, 0.7)}), "jev-1.13.0")
    d = await client.decide("t", {"x": 1}, {"fit_c1": object()})
    assert d.nouls == {"fit_c1": 0.9}
    assert d.choices["commit"] == ("c1", {"c1": 0.8, "c2": 0.2}, 0.7)
    assert d.model == "jev-1.13.0" and d.input_tokens == 500


async def test_decide_returns_none_on_error_and_breaker_opens(monkeypatch):
    monkeypatch.setattr(settings, "jev_breaker_failures", 2)
    monkeypatch.setattr(settings, "jev_breaker_cooldown_s", 60.0)
    sdk = _fake_sdk(fail=RuntimeError("down"))
    client = jev.JevClient(sdk, "m")
    assert await client.decide("t", {}, {"q": object()}) is None
    assert await client.decide("t", {}, {"q": object()}) is None
    assert not client.breaker.allow()
    calls = sdk.system_one.call_count
    assert await client.decide("t", {}, {"q": object()}) is None
    assert sdk.system_one.call_count == calls  # open breaker: no network call
    client.breaker.open_until = time.monotonic() - 1
    assert client.breaker.allow()


async def test_oversized_state_skipped(monkeypatch):
    monkeypatch.setattr(settings, "jev_max_state_chars", 50)
    sdk = _fake_sdk(nouls={"q": 1.0})
    assert await jev.JevClient(sdk, "m").decide("t", {"blob": "x" * 100}, {"q": object()}) is None
    sdk.system_one.assert_not_called()


def test_no_key_no_client():
    assert jev.get_client() is None


# --- shadow ranking ---------------------------------------------------------------

async def test_rank_orders_by_fit_and_reports_commit():
    nouls = {"fit_c1": 0.3, "fit_c2": 0.95, "fit_c3": 0.1, "fit_c4": 0.6}
    fake = jev.JevClient(_fake_sdk(nouls=nouls, choice={"commit": ("c2", {"c1": 0.1, "c2": 0.85, "c3": 0.05}, 0.8)}), "jev-1.13.0")
    with patch.object(jev, "get_client", return_value=fake):
        out = await ranker.rank(_ctx(), CANDS, seed="r1")
    assert out["ranked"] == ["in_010", "in_007", "in_002", "it_008"]
    assert out["commit"]["dish_id"] == "in_010" and out["commit"]["confidence"] == 0.8
    assert out["scores"]["in_010"] == 0.95


async def test_rank_none_without_client():
    assert await ranker.rank(_ctx(), CANDS, seed="r") is None


def test_agreement():
    assert ranker.agreement(["a", "b", "c", "d"], ["c", "a", "x"]) == round(2 / 3, 3)
    assert ranker.agreement([], ["a"]) is None


def test_route_shadow_attaches_jev_ranking(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.learning import runs, store
    from app.main import app
    from tests.test_routes import MOCK_RESPONSE

    monkeypatch.setattr(settings, "model_store_path", str(tmp_path / "m.db"))
    store.close()
    monkeypatch.setattr(settings, "ranker_provider", "shadow")

    async def fake_rank(ctx, shortlist, seed):
        return {"provider": "jev", "model": "jev-1.13.0", "ranked": [d.id for d in shortlist][::-1], "scores": {}}

    payload = {"user_context": {"mood": {"primary": "happy"}}, "request_id": "req-shadow-1"}
    # Context-managed client keeps the event loop alive for background tasks (as uvicorn does).
    with TestClient(app) as client, \
         patch("app.routes.recommendations.recommender.get_recommendations", return_value=MOCK_RESPONSE), \
         patch("app.routes.recommendations.jev_ranker.rank", side_effect=fake_rank):
        assert client.post("/api/ai-recommendations", json=payload).status_code == 200
        deadline = time.time() + 2
        run = None
        while time.time() < deadline:
            run = runs.get("req-shadow-1")
            if run and run.get("shadow"):
                break
            time.sleep(0.02)
    assert run and run["shadow"]["provider"] == "jev"
    assert "agreement_top3_vs_gpt" in run["shadow"]
    store.close()
