"""Game sessions: start → answer → … → decision (persisted in the model store).

Clients only render: the engine picks each next card/question, decides when
to stop, and returns lossless typed signals (in the learner's formats) for
the API to log. Anonymous sessions are allowed (site teaser).
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

from app.data.dishes import DISHES_BY_ID, DishRecord
from app.decisions import engine as decision_engine
from app.games import engine as g
from app.learning import store
from app.schemas.request import GameData, RecommendationConfig, RecommendationRequest, UserContext
from app.services.shortlist import ScoredDish, build_scored_shortlist, score_breakdown

GAMES: dict[str, dict[str, int]] = {
    "swipe": {"max_steps": 8},
    "this_or_that": {"max_steps": 6},
    "craving_radar": {"max_steps": 5},
    "story": {"max_steps": 5},
}
# Orchestrator game names → playable engine games.
FROM_ORCHESTRATOR = {
    "swipe": "swipe", "this_or_that": "this_or_that", "craving_radar": "craving_radar",
    "day_story": "story", "mood_checkin": "story", "budget_vibe": "story",
}
CANDIDATES = 24


class GameError(ValueError):
    pass


def pick_game(user_id: Optional[str]) -> str:
    """The orchestrator's most informative playable game for this user (default: story)."""
    if user_id:
        from app.learning import orchestrator

        try:
            for entry in orchestrator.game_plan(user_id).get("games", []):
                name = entry.get("game") if isinstance(entry, dict) else entry
                if name in FROM_ORCHESTRATOR:
                    return FROM_ORCHESTRATOR[name]
        except Exception:  # noqa: BLE001 — fall back to a sensible default
            pass
    return "story"


def _questions(state: dict) -> list[g.Question]:
    asked = set(state["asked"])
    game = state["game"]
    if game == "swipe":
        return g.swipe_questions(state["ids"], asked)
    if game == "this_or_that":
        return g.duel_questions(state["logits"], asked)
    if game == "craving_radar":
        return g.craving_questions(state["ids"], asked)
    return g.story_questions(state["ids"], asked)


def _public(q: g.Question) -> dict[str, Any]:
    return {"key": q.key, "kind": q.kind, **q.payload}


def _progress(state: dict) -> dict[str, Any]:
    top, p = g.leader(state["logits"])
    return {"step": state["steps"], "max_steps": state["max_steps"], "leader_probability": round(p, 3)}


def _save(session_id: str, state: dict) -> None:
    store.execute(
        """INSERT INTO game_sessions (id, user_id, game, status, state_json, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET status = excluded.status, state_json = excluded.state_json,
             updated_at = CURRENT_TIMESTAMP""",
        (session_id, state.get("user_id"), state["game"], state["status"], json.dumps(state)),
    )


def load(session_id: str) -> dict:
    row = store.fetchone("SELECT state_json FROM game_sessions WHERE id = ?", (session_id,))
    if row is None:
        raise GameError("unknown session")
    return json.loads(row["state_json"])


def start(game: Optional[str], ctx: UserContext, user_id: Optional[str], count: int = 3,
          max_steps: Optional[int] = None) -> dict[str, Any]:
    game = game or pick_game(user_id)
    if game not in GAMES:
        raise GameError(f"unknown game {game!r}")
    scored = build_scored_shortlist(ctx, RecommendationConfig(count=count), size=CANDIDATES, user_id=user_id)
    if len(scored) < 2:
        raise GameError("not enough candidates for a game")
    state = {
        "game": game,
        "user_id": user_id,
        "status": "active",
        "ctx": ctx.model_dump(mode="json"),
        "count": count,
        "ids": [s.dish.id for s in scored],
        "logits": g.initial_logits({s.dish.id: s.total for s in scored}),
        "asked": [],
        "steps": 0,
        "max_steps": min(max_steps or GAMES[game]["max_steps"], GAMES[game]["max_steps"]),
        "answers": [],
    }
    q = g.best_question(state["logits"], _questions(state))
    state["current"] = q.key
    session_id = uuid.uuid4().hex
    _save(session_id, state)
    return {"session_id": session_id, "game": game, "question": _public(q), "progress": _progress(state)}


# --- signals (learner formats) --------------------------------------------------

_DIMS = ("price", "health", "speed", "adventure", "comfort")


def _dim_values(d: DishRecord) -> dict[str, float]:
    s = d.sensory or {}
    comfort = (s.get("warm", 0.5) + s.get("creamy", 0.5) + s.get("heavy", 0.5)) / 3
    return {
        "price": -d.price_inr / 500, "health": d.health_score / 10, "speed": -d.prep_time_min / 40,
        "adventure": d.adventurousness_score / 10, "comfort": comfort,
    }


def duel_dimensions(winner: DishRecord, loser: DishRecord) -> Optional[dict[str, str]]:
    """Translate a dish duel into the learner's trade-off duel (what won over what)."""
    w, lo = _dim_values(winner), _dim_values(loser)
    diff = {k: w[k] - lo[k] for k in _DIMS}
    a = max(diff, key=diff.get)
    b = min(diff, key=diff.get)
    if diff[a] <= 0.05 or diff[b] >= -0.05 or a == b:
        return None
    return {"dimension_a": a, "dimension_b": b, "winner": a}


def _answer_label(q: g.Question, answer: dict[str, Any]) -> str:
    if q.kind == "swipe":
        return "like" if answer.get("liked") else "pass"
    if q.kind == "yes_no":
        return "yes" if answer.get("yes") else "no"
    label = str(answer.get("winner_id") if q.kind == "duel" else answer.get("option_id"))
    if label not in q.effects:
        raise GameError(f"invalid answer for {q.key}")
    return label


def _answer_signals(q: g.Question, label: str, reaction_ms: Optional[int]) -> list[dict]:
    if q.kind == "swipe":
        d = DISHES_BY_ID[q.payload["dish"]["id"]]
        return [{"type": "swipe", "payload": {"dish_id": d.id, "dish_name": d.name, "liked": label == "like",
                                              "reaction_time": reaction_ms, "source": "game_engine"}}]
    if q.kind == "duel":
        a, b = (o["id"] for o in q.payload["options"])
        winner, loser = DISHES_BY_ID[label], DISHES_BY_ID[b if label == a else a]
        duel = duel_dimensions(winner, loser)
        return [{"type": "this_or_that", "payload": {"duels": [duel] if duel else [], "winner_id": winner.id,
                                                     "loser_id": loser.id, "source": "game_engine"}}]
    return []


def _final_signals(state: dict, decision_ids: list[str]) -> list[dict]:
    out: list[dict] = []
    if state["game"] == "craving_radar":
        yes = [a["key"][4:] for a in state["answers"] if a["label"] == "yes"]
        no = [a["key"][4:] for a in state["answers"] if a["label"] == "no"]
        out.append({"type": "craving", "payload": {"tags": yes, "rejected": no, "source": "game_engine"}})
    if state["game"] == "story":
        pulls: dict[str, list[float]] = {}
        for a in state["answers"]:
            opt = g.scene_option(a["key"][6:], a["label"])
            for dim, target, _ in (opt or {}).get("pulls", []):
                pulls.setdefault(dim, []).append(target)
        out.append({"type": "day_story", "payload": {
            "mood_vector": {k: round(sum(v) / len(v), 2) for k, v in pulls.items()},
            "answers": [{"scene": a["key"][6:], "option": a["label"]} for a in state["answers"]],
            "source": "game_engine",
        }})
    out.append({"type": "game_signals", "payload": {"game": state["game"], "steps": state["steps"],
                                                    "decision": decision_ids, "source": "game_engine"}})
    return out


# --- decision -------------------------------------------------------------------

def _context_after(state: dict) -> UserContext:
    """The user context enriched with what the game revealed (for scoring + copy)."""
    ctx = UserContext.model_validate(state["ctx"])
    game = ctx.game_data or GameData(type=state["game"])
    liked = [DISHES_BY_ID[a["key"][6:]].name for a in state["answers"] if a["key"].startswith("swipe:") and a["label"] == "like"]
    disliked = [DISHES_BY_ID[a["key"][6:]].name for a in state["answers"] if a["key"].startswith("swipe:") and a["label"] == "pass"]
    tags = [a["key"][4:] for a in state["answers"] if a["key"].startswith("tag:") and a["label"] == "yes"]
    return ctx.model_copy(update={"game_data": game.model_copy(update={
        "type": state["game"],
        "liked": [*game.liked, *liked],
        "disliked": [*game.disliked, *disliked],
        "craving_tags": [*game.craving_tags, *tags],
    })})


def _decision(state: dict, order: list[str], confidence: Optional[float], request_id: str) -> dict[str, Any]:
    from app.services import recommender

    ctx = _context_after(state)
    post = g.softmax(state["logits"])
    picks: list[ScoredDish] = []
    for dish_id in order[: state["count"]]:
        d = DISHES_BY_ID[dish_id]
        parts = score_breakdown(d, ctx)
        picks.append(ScoredDish(d, sum(parts.values()), parts))
    request = RecommendationRequest(user_context=ctx, recommendation_config=RecommendationConfig(count=state["count"]), request_id=request_id)
    cards = recommender.recommendations_from_ranking(
        request, picks, confidence={i: min(0.95, 0.5 + post[i]) for i in order}, model="game_engine", response_time_s=0.0,
    )
    return {
        "dish_ids": [p.dish.id for p in picks],
        "confidence": round(confidence if confidence is not None else post[order[0]], 3),
        "recommendations": cards.model_dump(mode="json"),
        # Pass to /api/ai-recommendations for live Swiggy cards built from the same signals.
        "game_data": ctx.game_data.model_dump(mode="json") if ctx.game_data else None,
    }


async def answer(session_id: str, answer: dict[str, Any], reaction_ms: Optional[int] = None) -> dict[str, Any]:
    state = load(session_id)
    if state["status"] != "active":
        raise GameError("session already finished")
    q = next((x for x in _questions(state) if x.key == state["current"]), None)
    if q is None:
        raise GameError("no pending question")
    label = _answer_label(q, answer)

    state["logits"] = g.apply(state["logits"], q.effects[label])
    state["asked"].append(q.key)
    state["answers"].append({"key": q.key, "label": label})
    state["steps"] += 1
    signals = _answer_signals(q, label, reaction_ms)

    order = g.ranked(state["logits"])
    top, p = g.leader(state["logits"])
    next_q = g.best_question(state["logits"], _questions(state))
    done = p >= g.STOP_PROB or state["steps"] >= state["max_steps"] or next_q is None
    confidence = None
    if not done and p >= g.JEV_CHECK_FROM:
        ctx = _context_after(state)
        top4 = [ScoredDish(DISHES_BY_ID[i], 0.0, {}) for i in order[:4]]
        commit = await decision_engine.commit(ctx, top4, seed=f"{session_id}:{state['steps']}")
        if commit and commit["confidence"] >= g.JEV_STOP_CONF and commit["dish_id"] in order[:2]:
            done, confidence = True, commit["confidence"]
            order = [commit["dish_id"], *[i for i in order if i != commit["dish_id"]]]

    result: dict[str, Any] = {"session_id": session_id, "game": state["game"], "signals": signals}
    if done:
        state["status"] = "done"
        decision = _decision(state, order, confidence, request_id=session_id)
        result["signals"] += _final_signals(state, decision["dish_ids"])
        result.update(done=True, decision=decision)
    else:
        state["current"] = next_q.key
        result.update(done=False, question=_public(next_q))
    result["progress"] = _progress(state)
    _save(session_id, state)
    return result
