"""Decision engine (JEV live), grounded explanations, refresh paging, hero polish."""

import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import settings
from app.data.dishes import DISHES_BY_ID
from app.decisions import engine, jev
from app.schemas.request import GameData, Mood, Preferences, Situational, UserContext
from app.schemas.response import AiReasoning
from app.services import explain
from app.services.shortlist import build_scored_shortlist


def _ctx(**kw):
    return UserContext(
        mood=Mood(primary=kw.get("mood", "tired"), energy_level=kw.get("energy", 2)),
        situational=Situational(time_of_day="dinner", weather=kw.get("weather", "rainy"), delivery_preferred=True),
        preferences=kw.get("prefs"),
        game_data=kw.get("game"),
    )


class FakeJev:
    """Stands in for JevClient: fit = a fixed function of the dish, commit picks c1."""

    def __init__(self, fit=lambda name: 0.5, commit_conf=0.8, fail=False):
        self.fit, self.commit_conf, self.fail, self.calls = fit, commit_conf, fail, []

    async def decide(self, kind, state, questions, timeout_s=None):
        self.calls.append(kind)
        if self.fail:
            return None
        cands = state["candidates"]
        nouls = {k: self.fit(cands[k[4:]]["name"]) for k in questions if k.startswith("fit_")}
        choices = {}
        if "commit" in questions:
            keys = list(cands)
            choices["commit"] = (keys[0], {k: (self.commit_conf if k == keys[0] else (1 - self.commit_conf) / (len(keys) - 1)) for k in keys}, self.commit_conf)
        return jev.Decision(model="jev-1.13.0", nouls=nouls, choices=choices, scores={}, input_tokens=900, latency_ms=12.0)


# --- engine ---------------------------------------------------------------------

async def test_engine_blends_and_diversifies():
    ctx = _ctx()
    shortlist = build_scored_shortlist(ctx)
    # JEV loves anything with "Chicken" — without MMR the top 3 would all be chicken.
    fake = FakeJev(fit=lambda n: 0.95 if "Chicken" in n else 0.3)
    with patch.object(jev, "get_client", return_value=fake):
        res = await engine.rank(ctx, shortlist)
    assert res.provider == "jev" and res.jev_fit
    top3 = res.ranked[:3]
    assert len({(s.dish.cuisine, s.dish.protein) for s in top3}) >= 2


async def test_engine_without_jev_is_deterministic_order():
    ctx = _ctx()
    shortlist = build_scored_shortlist(ctx)
    res = await engine.rank(ctx, shortlist, diversity="low")
    assert res.provider == "deterministic"
    assert [s.dish.id for s in res.ranked] == [s.dish.id for s in sorted(shortlist, key=lambda s: s.total, reverse=True)]


async def test_engine_excludes_already_shown():
    ctx = _ctx()
    shortlist = build_scored_shortlist(ctx)
    shown = frozenset(s.dish.id for s in shortlist[:3])
    res = await engine.rank(ctx, shortlist, exclude=shown)
    assert not shown & {s.dish.id for s in res.ranked}


async def test_commit_and_suggested_count(monkeypatch):
    ctx = _ctx()
    ranked = build_scored_shortlist(ctx)
    with patch.object(jev, "get_client", return_value=FakeJev(commit_conf=0.82)):
        c = await engine.commit(ctx, ranked, seed="s")
    assert c["confidence"] == 0.82 and c["dish_id"] in {s.dish.id for s in ranked[:4]}
    assert engine.suggested_count(c, 3) == 1
    assert engine.suggested_count({"confidence": 0.5}, 3) == 2
    assert engine.suggested_count({"confidence": 0.2}, 3) == 3
    assert engine.suggested_count(None, 3) == 3


# --- explanations ------------------------------------------------------------------

def test_explanations_are_grounded_in_the_breakdown():
    ctx = _ctx()
    top = build_scored_shortlist(ctx)[0]
    r = explain.explain(top, ctx, seed="req-1")
    assert r.mood_match and r.context_fit and r.psychological_hook
    assert "rainy" in r.mood_match or "low-energy" in r.mood_match
    assert "₹" not in r.context_fit  # live price may differ: bands only
    assert 1 <= len(r.context_tags) <= 3
    assert explain.explain(top, ctx, seed="req-1") == r  # stable per request


def test_history_and_craving_hooks():
    from app.schemas.request import History, RecentOrder

    pav = DISHES_BY_ID["in_007"]
    ctx = UserContext(
        mood=Mood(primary="happy"),
        history=History(recent_orders=[RecentOrder(dish="Pav Bhaji", date="2026-01-01T00:00:00Z"),
                                       RecentOrder(dish="Pav Bhaji", date="2026-01-08T00:00:00Z")]),
    )
    scored = next(s for s in build_scored_shortlist(ctx, size=200) if s.dish.id == pav.id)
    assert "favourite" in explain.explain(scored, ctx, seed="x").psychological_hook.lower()

    crave = _ctx(game=GameData(type="craving_radar", craving_tags=["crunchy", "spicy"]))
    top = build_scored_shortlist(crave)[0]
    assert "craving" in explain.explain(top, crave, seed="x").psychological_hook.lower()


def test_mood_profile_reads_naturally():
    assert explain.mood_profile(_ctx()).startswith("A rainy evening")


# --- paging -----------------------------------------------------------------------

@pytest.fixture
def store_tmp(tmp_path, monkeypatch):
    from app.learning import store

    monkeypatch.setattr(settings, "model_store_path", str(tmp_path / "m.db"))
    store.close()
    yield
    store.close()


def test_refresh_pages_then_cycles(store_tmp):
    from app.learning import paging

    fp, now = "fp1", 1_000_000.0
    assert paging.exclusions("u", fp, now) == frozenset()
    paging.remember("u", fp, ["a", "b", "c"], frozenset(), now)
    page2 = paging.exclusions("u", fp, now + 10)
    assert page2 == {"a", "b", "c"}
    paging.remember("u", fp, ["d", "e", "f"], page2, now + 10)
    assert paging.exclusions("u", fp, now + 20) == {"a", "b", "c", "d", "e", "f"}
    paging.remember("u", fp, ["g", "h", "i"], frozenset("abcdef"), now + 20)
    assert paging.exclusions("u", fp, now + 30) == frozenset()  # 3 pages → start over
    assert paging.exclusions("u", "other", now + 30) == frozenset()
    assert paging.exclusions("u", fp, now + 10_000) == frozenset()  # window expired
    assert paging.exclusions(None, fp) == frozenset()


def test_fingerprint_ignores_temperature():
    from app.learning import paging
    from app.schemas.request import RecommendationConfig, RecommendationRequest

    a = RecommendationRequest(user_context=_ctx(), recommendation_config=RecommendationConfig(temperature=0.5), request_id="1")
    b = RecommendationRequest(user_context=_ctx(), recommendation_config=RecommendationConfig(temperature=0.9), request_id="2")
    assert paging.fingerprint(a) == paging.fingerprint(b)


# --- polish ------------------------------------------------------------------------

async def test_polish_rephrases_or_falls_back(monkeypatch):
    from app.services import polish

    base = AiReasoning(mood_match="Warm and filling — right for a rainy evening.", context_fit="x", psychological_hook="One of your repeat favourites.")
    good = MagicMock()
    good.ainvoke = AsyncMock(return_value=SimpleNamespace(content='{"mood_match": "Cosy, warm and filling for this rainy night.", "psychological_hook": "A favourite you keep coming back to."}'))
    out = await polish.polish(base, "Dal Makhani", llm=good)
    assert out.mood_match.startswith("Cosy") and out.context_fit == "x"

    rambling = MagicMock()
    rambling.ainvoke = AsyncMock(return_value=SimpleNamespace(content='{"mood_match": "' + "word " * 40 + '", "psychological_hook": "ok"}'))
    assert await polish.polish(base, "Dal Makhani", llm=rambling) is None

    slow = MagicMock()

    async def _slow(_):
        import asyncio
        await asyncio.sleep(5)

    slow.ainvoke = _slow
    monkeypatch.setattr(settings, "polish_timeout_s", 0.05)
    assert await polish.polish(base, "Dal Makhani", llm=slow) is None


# --- route, JEV live ------------------------------------------------------------------

def _post(payload, fake, tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.learning import store
    from app.main import app

    monkeypatch.setattr(settings, "model_store_path", str(tmp_path / "r.db"))
    monkeypatch.setattr(settings, "ranker_provider", "jev")
    store.close()
    with TestClient(app) as client, patch.object(jev, "get_client", return_value=fake), \
         patch("app.routes.recommendations.recommender.get_recommendations", new=AsyncMock(side_effect=AssertionError("GPT must not run"))):
        return client.post("/api/ai-recommendations", json=payload).json()


def test_route_jev_live_end_to_end(tmp_path, monkeypatch):
    fake = FakeJev(fit=lambda n: 0.9 if "Dal" in n else 0.4, commit_conf=0.8)
    payload = {"user_context": _ctx().model_dump(), "request_id": "req-engine-1",
               "recommendation_config": {"count": 3}}
    data = _post(payload, fake, tmp_path, monkeypatch)
    assert data["success"] is True and len(data["recommendations"]) == 3
    assert data["meta"]["ranker"] == "jev"
    assert data["meta"]["commit_confidence"] == 0.8 and data["meta"]["suggested_count"] == 1
    assert {"rank", "commit"} <= set(fake.calls)
    top = data["recommendations"][0]
    assert top["ai_reasoning"]["mood_match"] and top["confidence"] > 0


def test_route_jev_down_falls_back_to_gpt(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.learning import store
    from app.main import app
    from tests.test_routes import MOCK_RESPONSE

    monkeypatch.setattr(settings, "model_store_path", str(tmp_path / "f.db"))
    monkeypatch.setattr(settings, "ranker_provider", "jev")
    store.close()
    gpt = AsyncMock(return_value=MOCK_RESPONSE)
    with TestClient(app) as client, patch.object(jev, "get_client", return_value=FakeJev(fail=True)), \
         patch("app.routes.recommendations.recommender.get_recommendations", new=gpt):
        data = client.post("/api/ai-recommendations", json={"user_context": _ctx().model_dump()}).json()
    gpt.assert_awaited_once()
    assert data["meta"]["ranker"] == "gpt"
    assert data["recommendations"][0]["dish"]["id"] == "in_002"


def test_route_refresh_returns_next_page(tmp_path, monkeypatch):
    fake = FakeJev(fit=lambda n: 0.6)
    payload = {"user_context": _ctx().model_dump(), "user_id": "pager", "recommendation_config": {"count": 3, "temperature": 0.6}}
    first = _post({**payload, "request_id": "p1"}, fake, tmp_path, monkeypatch)
    payload["recommendation_config"]["temperature"] = 0.9  # mobile's "Get new picks"
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client, patch.object(jev, "get_client", return_value=fake):
        second = client.post("/api/ai-recommendations", json={**payload, "request_id": "p2"}).json()
    ids1 = {r["dish"]["id"] for r in first["recommendations"]}
    ids2 = {r["dish"]["id"] for r in second["recommendations"]}
    assert ids1 and ids2 and not ids1 & ids2
