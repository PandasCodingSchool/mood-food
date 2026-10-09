"""Story v2 (time-aware, reactive), bracket, meal roulette, time-aware decks, story personalisation."""

import asyncio
import json
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.data.dishes import DISHES_BY_ID
from app.games import engine as g
from app.games import personalise, sessions
from app.games import story_beats as sb
from app.history.normalise import IST
from app.schemas.request import Mood, Situational, UserContext

CTX = UserContext(mood=Mood(primary="tired", energy_level=3),
                  situational=Situational(time_of_day="dinner", weather="rainy", delivery_preferred=True))


async def _play(game, chooser, ctx=CTX, user_id=None):
    s = sessions.start(game, ctx, user_id)
    sid, q, seen, signals = s["session_id"], s["question"], [s["question"]], []
    for _ in range(12):
        r = await sessions.answer(sid, chooser(q))
        signals += r["signals"]
        if r["done"]:
            return r, seen, signals, sid
        q = r["question"]
        seen.append(q)
    raise AssertionError("never finished")


# --- story v2 ----------------------------------------------------------------------------

@pytest.mark.parametrize("hour,tod,first", [(8, "morning", ("morning", "present")), (13, "afternoon", ("morning", "past")),
                                             (19, "evening", ("morning", "past")), (23, "night", ("lunch", "past"))])
def test_story_sequence_follows_the_time_of_day(hour, tod, first):
    steps = sb.sequence(datetime(2026, 10, 9, hour, 0, tzinfo=IST))
    assert sb.time_of_day(datetime(2026, 10, 9, hour, 0, tzinfo=IST)) == tod
    assert (steps[0]["beat"], steps[0]["perspective"]) == first and steps[-1] == {"beat": "craving", "perspective": tod}
    assert len(steps) == 4


def test_story_reacts_to_the_previous_choice_and_resolves_a_mood():
    assert sb.narrative("lunch", "present", "morning_skip").startswith("Lunchtime — and your stomach")
    assert sb.narrative("lunch", "present", None) == sb.BEATS["lunch"]["narratives"]["present"]
    tired = sb.mood_vector([("morning", "morning_snooze"), ("lunch", "lunch_skip"), ("evening", "evening_couch")])
    assert sb.nearest_mood(tired) in ("tired", "relaxed") and tired["energy"] < 0.5


async def test_story_session_runs_in_order_and_feeds_the_decision(monkeypatch):
    evening = sb.sequence(datetime(2026, 10, 9, 20, tzinfo=IST))
    monkeypatch.setattr(sb, "sequence", lambda now: evening)
    monkeypatch.setattr(sb, "time_of_day", lambda now: "evening")
    answers = iter(["morning_skip", "lunch_skip", "evening_couch", "crave_spicy"])
    r, seen, signals, _ = await _play("story", lambda q: {"option_id": next(answers)})
    assert [q["key"] for q in seen] == ["story:morning", "story:lunch", "story:evening", "story:craving"]
    assert seen[0]["cold_open"] and seen[1]["prompt"].startswith("Lunchtime — and your stomach")  # reacts to the skip
    assert seen[0]["step"] == 1 and seen[0]["of"] == 4
    story = next(s for s in signals if s["type"] == "day_story")["payload"]
    assert story["mood"] and story["answers"][-1] == {"scene": "craving", "option": "crave_spicy"}
    assert "spicy" in r["decision"]["game_data"]["craving_tags"]


# --- bracket ----------------------------------------------------------------------------------

async def test_bracket_runs_seven_duels_and_crowns_a_champion():
    s = sessions.start("bracket", CTX, None)
    seeds = sessions.load(s["session_id"])["bracket"]["seeds"]
    assert len(set(seeds)) == 8
    r, seen, signals, _ = await _play("bracket", lambda q: {"winner_id": q["options"][0]["id"]})
    assert [q["round"] for q in seen] == ["Quarterfinal"] * 4 + ["Semifinal"] * 2 + ["Final"]
    assert len(seen) == 7 and r["progress"]["step"] == 7
    champ, runner = r["decision"]["dish_ids"][:2]
    assert {champ, runner} == {seen[-1]["options"][0]["id"], seen[-1]["options"][1]["id"]} and champ == seen[-1]["options"][0]["id"]
    assert next(x for x in signals if x["type"] == "bracket")["payload"]["picks"] == [champ, runner]
    assert sum(1 for x in signals if x["type"] == "this_or_that") == 7


def test_bracket_seeds_are_spread_out():
    s = sessions.start("bracket", CTX, None)
    seeds = sessions.load(s["session_id"])["bracket"]["seeds"]
    pairs = [(a, b) for i, a in enumerate(seeds) for b in seeds[i + 1:]]
    near_twins = sum(g.dish_similarity(DISHES_BY_ID[a], DISHES_BY_ID[b]) > 0.85 for a, b in pairs)
    assert near_twins <= 2


# --- meal roulette -------------------------------------------------------------------------------

async def test_roulette_wheel_accept_and_neighbours():
    s = sessions.start("roulette", CTX, None)
    wheel = sessions.load(s["session_id"])["roulette"]
    assert len(wheel["segments"]) == 6 and len(wheel["stretch"]) == 3 and set(wheel["stretch"]) <= set(wheel["segments"])
    q = s["question"]
    assert q["kind"] == "spin" and q["landed"]["id"] in wheel["segments"] and q["spins_left"] == 2
    r = await sessions.answer(s["session_id"], {"accept": True})
    assert r["done"] and r["decision"]["dish_ids"][0] == q["landed"]["id"] and len(r["decision"]["dish_ids"]) == 3


async def test_roulette_respins_land_elsewhere_and_log_stretch_verdicts():
    r, seen, signals, _ = await _play("roulette", lambda q: {"accept": False})
    landed = [q["landed"]["id"] for q in seen]
    assert len(seen) == 3 and len(set(landed)) == 3
    stretch_spins = [q for q in seen if q["landed"]["stretch"]]
    verdicts = [x for x in signals if x["type"] == "wildcard_verdict"]
    assert len(verdicts) == len(stretch_spins) and all(v["payload"]["accepted"] is False for v in verdicts)
    assert r["decision"]["dish_ids"][0] not in landed  # every landed dish was re-spun: the best other dish wins


def test_roulette_stretch_dishes_are_new_to_the_user():
    from tests.test_brain import _history
    from tests.test_houses import _feed

    _feed("r1", _history())
    s = sessions.start("roulette", CTX, "r1")
    wheel = sessions.load(s["session_id"])["roulette"]
    ordered = {i["dish_id"] for o in _history() for i in o["items"] if i["dish_id"]}
    assert not set(wheel["stretch"]) & ordered


def test_roulette_stretch_leaves_the_users_habits_even_without_catalog_matches():
    from tests.test_brain import _order, _prof
    from tests.test_houses import _feed

    chicken_bowls = [_order(f"c{i}", i + 1, "lunch", "tuesday",
                            [("Mediterranean Chicken Bowl", None, False, _prof("mediterranean", "chicken", "bowl"))]) for i in range(6)]
    _feed("r2", chicken_bowls)  # nothing maps to the catalog
    s = sessions.start("roulette", CTX, "r2")
    wheel = sessions.load(s["session_id"])["roulette"]
    stretch = [DISHES_BY_ID[i] for i in wheel["stretch"]]
    assert all(d.protein != "chicken" or d.cuisine != "mediterranean" for d in stretch)
    assert any(d.protein != "chicken" for d in stretch)


# --- time-aware decks ------------------------------------------------------------------------------

def test_craving_deck_depends_on_the_meal():
    ids = list(DISHES_BY_ID)[:20]
    breakfast = {q.payload["tag"] for q in g.craving_questions(ids, set(), "breakfast")}
    late = {q.payload["tag"] for q in g.craving_questions(ids, set(), "late_night")}
    assert "smoky" not in breakfast and "brothy" not in breakfast and "melty" in late
    assert {q.payload["tag"] for q in g.craving_questions(ids, set(), None)} == set(g.CRAVING_TAGS)


# --- personalisation -------------------------------------------------------------------------------

HABITS = ["Orders mostly at lunch (100%)", "Loves mediterranean food (55% of orders)"]
BASE = "It's around lunch. Your stomach reminds you the morning was intense."


async def test_personalise_without_key_keeps_the_base_text():
    q = {"kind": "choice", "prompt": BASE, "base_prompt": BASE}
    assert await personalise.enrich(q, HABITS) == q


async def test_personalise_rewrites_validates_and_caches(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "openai_api_key", "k")
    personalise._CACHE.clear()
    good = SimpleNamespace(content=json.dumps({"text": "Lunch already, and your usual Mediterranean bowl is calling after that morning."}))
    llm = AsyncMock(return_value=good)
    with patch("app.llm.JsonChat.ainvoke", new=llm):
        q = await personalise.enrich({"kind": "choice", "prompt": BASE, "base_prompt": BASE}, HABITS)
        again = await personalise.enrich({"kind": "choice", "prompt": BASE, "base_prompt": BASE}, HABITS)
    assert q["personalised"] and "Mediterranean" in q["prompt"] and again["prompt"] == q["prompt"] and llm.await_count == 1
    personalise._CACHE.clear()
    bad = SimpleNamespace(content=json.dumps({"text": "You've had 9 bowls this week."}))  # number not in the facts
    with patch("app.llm.JsonChat.ainvoke", new=AsyncMock(return_value=bad)):
        q = await personalise.enrich({"kind": "choice", "prompt": BASE, "base_prompt": BASE}, HABITS)
    assert q["prompt"] == BASE and "personalised" not in q


async def test_next_beat_variants_are_prefetched(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "openai_api_key", "k")
    personalise._CACHE.clear()
    llm = AsyncMock(side_effect=lambda msgs: SimpleNamespace(content=json.dumps({"text": "A personal take on your day."})))
    with patch("app.llm.JsonChat.ainvoke", new=llm):
        await personalise.enrich({"kind": "choice", "prompt": BASE, "base_prompt": BASE}, HABITS,
                                 next_bases=["Evening A.", "Evening B.", "Evening C."])
        await asyncio.sleep(0.05)
    assert llm.await_count == 4 and all(personalise._key(b, HABITS) in personalise._CACHE for b in ("Evening A.", "Evening B.", "Evening C."))
