"""Adaptive game engine: info-gain questions, early stop, lossless signals, endpoints."""

from unittest.mock import AsyncMock, patch

import pytest

from app.data.dishes import DISHES_BY_ID
from app.decisions import jev
from app.games import engine as g
from app.games import sessions
from app.schemas.request import Mood, Situational, UserContext

CTX = UserContext(mood=Mood(primary="tired", energy_level=2),
                  situational=Situational(time_of_day="dinner", weather="rainy", delivery_preferred=True))


async def _play(game, chooser, ctx=CTX, user_id=None):
    s = sessions.start(game, ctx, user_id)
    sid, q, seen, signals = s["session_id"], s["question"], [s["question"]], []
    for _ in range(12):
        r = await sessions.answer(sid, chooser(q))
        signals += r["signals"]
        if r["done"]:
            return r, seen, signals
        q = r["question"]
        seen.append(q)
    raise AssertionError("game never finished")


def test_math_helpers():
    p = g.softmax({"a": 0.0, "b": 0.0})
    assert p == {"a": 0.5, "b": 0.5}
    assert g.entropy(p) == pytest.approx(0.6931, abs=1e-3)
    q = g.Question("k", "yes_no", {}, {"yes": {"a": 1.0, "b": -1.0}, "no": {"a": -1.0, "b": 1.0}})
    useless = g.Question("u", "yes_no", {}, {"yes": {}, "no": {}})
    assert g.best_question({"a": 0.0, "b": 0.0}, [useless, q]) is q  # informative question wins


@pytest.mark.parametrize("game", list(sessions.GAMES))
async def test_every_game_finishes_with_a_decision(game):
    choosers = {
        "swipe": lambda q: {"liked": True},
        "this_or_that": lambda q: {"winner_id": q["options"][0]["id"]},
        "craving_radar": lambda q: {"yes": q["tag"] == "spicy"},
        "story": lambda q: {"option_id": q["options"][-1]["id"]},
    }
    result, seen, signals = await _play(game, choosers[game])
    assert len(seen) <= sessions.GAMES[game]["max_steps"]
    assert len({q["key"] for q in seen}) == len(seen)  # never repeats a question
    decision = result["decision"]
    assert len(decision["dish_ids"]) == 3
    recs = decision["recommendations"]["recommendations"]
    assert [r["dish"]["id"] for r in recs] == decision["dish_ids"]
    assert all(r["ai_reasoning"]["mood_match"] for r in recs)
    assert signals[-1]["type"] == "game_signals"


async def test_swipe_likes_pull_the_decision():
    target = None

    def chooser(q):
        nonlocal target
        target = target or q["dish"]["id"]  # love the first dish shown, pass on the rest
        return {"liked": q["dish"]["id"] == target}

    result, _, signals = await _play("swipe", chooser)
    assert target in result["decision"]["dish_ids"]
    swipes = [s for s in signals if s["type"] == "swipe"]
    assert swipes[0]["payload"] == {"dish_id": target, "dish_name": DISHES_BY_ID[target].name,
                                    "liked": True, "reaction_time": None, "source": "game_engine"}


async def test_craving_answers_shape_the_decision_and_signal():
    result, seen, signals = await _play("craving_radar", lambda q: {"yes": q["tag"] in ("crunchy", "spicy")})
    craving = next(s for s in signals if s["type"] == "craving")["payload"]
    asked = {q["tag"] for q in seen}
    assert set(craving["tags"]) == asked & {"crunchy", "spicy"}
    assert set(craving["rejected"]) == asked - {"crunchy", "spicy"}
    if craving["tags"]:
        top = DISHES_BY_ID[result["decision"]["dish_ids"][0]]
        assert any(top.sensory[t if t != "spicy" else "spicy"] >= 0.5 for t in craving["tags"])
    assert result["decision"]["game_data"]["craving_tags"] == craving["tags"]


async def test_story_emits_mood_vector():
    _, _, signals = await _play("story", lambda q: {"option_id": q["options"][0]["id"]})
    story = next(s for s in signals if s["type"] == "day_story")["payload"]
    assert story["mood_vector"] and story["answers"]


def test_duel_translates_to_tradeoff_dimensions():
    cheap = next(d for d in DISHES_BY_ID.values() if d.price_inr <= 100 and d.adventurousness_score <= 2)
    fancy = next(d for d in DISHES_BY_ID.values() if d.price_inr >= 450 and d.adventurousness_score >= 7)
    duel = sessions.duel_dimensions(cheap, fancy)
    assert duel and duel["winner"] == duel["dimension_a"] and duel["dimension_a"] != duel["dimension_b"]
    assert {duel["dimension_a"], duel["dimension_b"]} <= set(sessions._DIMS)


async def test_jev_commit_ends_the_game_early():
    class ConfidentJev:
        async def decide(self, kind, state, questions, timeout_s=None):
            keys = list(state["candidates"])
            return jev.Decision(model="jev-1.13.0", nouls={}, scores={}, input_tokens=1, latency_ms=1,
                                choices={"commit": (keys[0], {k: (0.9 if k == keys[0] else 0.0) for k in keys}, 0.9)})

    s = sessions.start("story", CTX, None)
    state = sessions.load(s["session_id"])
    # A clear-but-not-decisive leader (~0.47 of the mass): worth a JEV commit check.
    state["logits"] = {k: (3.0 if i == 0 else 0.0) for i, k in enumerate(state["logits"])}
    sessions._save(s["session_id"], state)
    with patch.object(jev, "get_client", return_value=ConfidentJev()):
        r = await sessions.answer(s["session_id"], {"option_id": s["question"]["options"][0]["id"]})
    assert r["done"] is True and r["decision"]["confidence"] == 0.9


async def test_invalid_answers_and_finished_sessions():
    s = sessions.start("this_or_that", CTX, None)
    with pytest.raises(sessions.GameError):
        await sessions.answer(s["session_id"], {"winner_id": "not-an-option"})
    with pytest.raises(sessions.GameError):
        await sessions.answer("nope", {})
    with pytest.raises(sessions.GameError):
        sessions.start("chess", CTX, None)


def test_orchestrator_picks_a_playable_game():
    assert sessions.pick_game(None) == "story"
    with patch("app.learning.orchestrator.game_plan", return_value={"games": [{"game": "craving_radar", "eig": 0.4}]}):
        assert sessions.pick_game("u1") == "craving_radar"


def test_endpoints_round_trip(client):
    start = client.post("/api/games/session", json={"user_context": CTX.model_dump(mode="json"), "game": "swipe"})
    assert start.status_code == 200
    body = start.json()
    sid, q = body["session_id"], body["question"]
    assert q["kind"] == "swipe" and q["dish"]["name"]
    r = client.post(f"/api/games/session/{sid}/answer", json={"answer": {"liked": True}, "reaction_ms": 420}).json()
    assert r["signals"][0]["payload"]["reaction_time"] == 420
    assert client.get(f"/api/games/session/{sid}").json()["step"] == 1
    assert client.post("/api/games/session", json={"user_context": CTX.model_dump(mode="json"), "game": "chess"}).status_code == 400
    assert client.get("/api/games/session/missing").status_code == 404
