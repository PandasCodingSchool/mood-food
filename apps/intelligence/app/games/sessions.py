"""Game sessions: start → answer → … → decision (persisted in the model store).

Clients only render: the engine picks each next card/question, decides when
to stop, and returns lossless typed signals (in the learner's formats) for
the API to log. Anonymous sessions are allowed (site teaser).

When the session has a Swiggy address, the decision's cards are live: the
posterior ranking is walked (via `services/live_cards`) until `count` dishes
match real items near the user, with Swiggy's restaurant, price and photo.
"""

from __future__ import annotations

import json
import uuid
from typing import Any, Optional

from app.data.dishes import DISHES_BY_ID, DishRecord
from app.decisions import engine as decision_engine
from app.games import engine as g
from app.lab import trace
from app.learning import store
from app.schemas.request import GameData, RecommendationConfig, RecommendationRequest, UserContext
from app.services.shortlist import ScoredDish, build_scored_shortlist, filter_report, score_breakdown

# min_steps: answers collected before the game may stop (leader threshold or JEV commit),
# so one strong answer can't end a game on its own.
GAMES: dict[str, dict[str, int]] = {
    "swipe": {"min_steps": 4, "max_steps": 8},
    "this_or_that": {"min_steps": 3, "max_steps": 6},
    "craving_radar": {"min_steps": 3, "max_steps": 5},
    "story": {"min_steps": 3, "max_steps": 5},
}
# Orchestrator game names → playable engine games.
FROM_ORCHESTRATOR = {
    "swipe": "swipe", "this_or_that": "this_or_that", "craving_radar": "craving_radar",
    "day_story": "story", "mood_checkin": "story", "budget_vibe": "story",
}
CANDIDATES = 24
LIVE_POOL = 10  # posterior-ranked dishes a decision may probe on Swiggy for live cards


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
    return {"step": state["steps"], "min_steps": _min_steps(state), "max_steps": state["max_steps"],
            "leader_probability": round(p, 3)}


# --- lab trace views (only built while a trace is being collected) -----------------

def _posterior_view(logits: dict[str, float], before: Optional[dict[str, float]] = None) -> list[dict[str, Any]]:
    post = g.softmax(logits)
    prior = g.softmax(before) if before else None
    rows = []
    for i in sorted(post, key=post.get, reverse=True):
        row = {"id": i, "name": DISHES_BY_ID[i].name, "logit": trace.r(logits[i], 3), "p": trace.r(post[i])}
        if before:
            row.update(p_before=trace.r(prior[i]), d_logit=trace.r(logits[i] - before[i], 3))
        rows.append(row)
    return rows


def _question_label(q: g.Question) -> str:
    if q.kind == "swipe":
        return f"Swipe: {q.payload['dish']['name']}"
    if q.kind == "duel":
        a, b = q.payload["options"]
        return f"{a['name']} vs {b['name']}"
    return q.payload.get("prompt", q.key)


def _question_scores_view(rows: list[dict[str, Any]], limit: int = 12) -> list[dict[str, Any]]:
    return [{"key": r["key"], "kind": r["question"].kind, "label": _question_label(r["question"]),
             "expected_entropy": trace.r(r["expected_entropy"]), "info_gain": trace.r(r["info_gain"]),
             "answer_probs": {a: trace.r(p, 3) for a, p in r["answer_probs"].items()}} for r in rows[:limit]]


def _pick_question(logits: dict[str, float], questions: list[g.Question]) -> tuple[Optional[g.Question], list[dict]]:
    """`best_question`, plus the scored list it chose from when tracing (same computation)."""
    if not trace.enabled():
        return g.best_question(logits, questions), []
    rows = g.score_questions(logits, questions)
    return (rows[0]["question"] if rows else None), rows


def _thresholds(state: dict) -> dict[str, Any]:
    return {"stop_prob": g.STOP_PROB, "jev_check_from": g.JEV_CHECK_FROM, "jev_stop_conf": g.JEV_STOP_CONF,
            "min_steps": _min_steps(state), "beta": g.BETA}


def _min_steps(state: dict) -> int:
    return min(state.get("min_steps", GAMES[state["game"]]["min_steps"]), state["max_steps"])


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
          max_steps: Optional[int] = None, swiggy_address_id: Optional[str] = None) -> dict[str, Any]:
    game = game or pick_game(user_id)
    if game not in GAMES:
        raise GameError(f"unknown game {game!r}")
    from app.brain.notes import notes

    ctx = ctx.model_copy(update={"habits": notes(user_id)})  # server-side brain lines for JEV (client values dropped)
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
        "min_steps": GAMES[game]["min_steps"],
        "answers": [],
        "swiggy_address_id": swiggy_address_id,
    }
    q, q_rows = _pick_question(state["logits"], _questions(state))
    state["current"] = q.key
    session_id = uuid.uuid4().hex
    if trace.enabled():
        trace.emit("game.start", session_id=session_id, game=game, user_id=user_id, max_steps=state["max_steps"],
                   thresholds=_thresholds(state), filters=filter_report(ctx),
                   candidates=[{"id": s.dish.id, "name": s.dish.name, "cuisine": s.dish.cuisine, "price": s.dish.price_inr,
                                "total": trace.r(s.total, 2), "parts": {k: trace.r(v, 2) for k, v in s.parts.items()}}
                               for s in scored],
                   posterior=_posterior_view(state["logits"]), entropy=trace.r(g.entropy(g.softmax(state["logits"]))),
                   question_scores=_question_scores_view(q_rows), chosen=q.key)
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


async def _decision(state: dict, order: list[str], confidence: Optional[float], request_id: str,
                    user_token: Optional[str] = None) -> dict[str, Any]:
    from app.services import live_cards, recommender

    ctx = _context_after(state)
    post = g.softmax(state["logits"])
    picks: list[ScoredDish] = []
    address_id = state.get("swiggy_address_id")
    for dish_id in order[: max(state["count"], LIVE_POOL) if address_id else state["count"]]:
        d = DISHES_BY_ID[dish_id]
        parts = score_breakdown(d, ctx)
        picks.append(ScoredDish(d, sum(parts.values()), parts))
    request = RecommendationRequest(user_context=ctx, recommendation_config=RecommendationConfig(count=state["count"]), request_id=request_id)
    cards = recommender.recommendations_from_ranking(
        request, picks, confidence={i: min(0.95, 0.5 + post[i]) for i in order}, model="game_engine", response_time_s=0.0,
    )
    live = await live_cards.build(cards.recommendations, state["count"], address_id, user_token) if address_id \
        else live_cards.LiveCards(selected=cards.recommendations)
    if trace.enabled():
        by_id = {p.dish.id: p for p in picks}
        trace.emit("game.decision", live_status=live.status, address_set=bool(address_id), confidence_source=(
                       "jev_commit" if confidence is not None else "posterior"),
                   pool=[{"id": p.dish.id, "name": p.dish.name, "posterior": trace.r(post[p.dish.id]), "total": trace.r(p.total, 2),
                          "parts": {k: trace.r(v, 2) for k, v in p.parts.items()}, "selected": any(r.dish.id == p.dish.id for r in live.selected),
                          "live": p.dish.id in live.matches} for p in picks],
                   picks=[{"id": r.dish.id, "name": r.dish.name, "rank": r.rank, "card_confidence": r.confidence,
                           "posterior": trace.r(post[r.dish.id]), "parts": {k: trace.r(v, 2) for k, v in by_id[r.dish.id].parts.items()},
                           "reasoning": r.ai_reasoning.model_dump(mode="json")} for r in live.selected])
    cards = cards.model_copy(update={
        "recommendations": live.selected, "swiggy_matches": live.matches or None,
        "swiggy_address_id": live.address_id, "live_status": live.status,
    })
    return {
        "dish_ids": [r.dish.id for r in live.selected],
        "confidence": round(confidence if confidence is not None else post[live.selected[0].dish.id], 3),
        "live_status": live.status,
        "recommendations": cards.model_dump(mode="json"),
        # Pass to /api/ai-recommendations for live Swiggy cards built from the same signals.
        "game_data": ctx.game_data.model_dump(mode="json") if ctx.game_data else None,
    }


async def answer(session_id: str, answer: dict[str, Any], reaction_ms: Optional[int] = None,
                 user_token: Optional[str] = None) -> dict[str, Any]:
    state = load(session_id)
    if state["status"] != "active":
        raise GameError("session already finished")
    q = next((x for x in _questions(state) if x.key == state["current"]), None)
    if q is None:
        raise GameError("no pending question")
    label = _answer_label(q, answer)

    before = dict(state["logits"])
    state["logits"] = g.apply(state["logits"], q.effects[label])
    state["asked"].append(q.key)
    state["answers"].append({"key": q.key, "label": label})
    state["steps"] += 1
    signals = _answer_signals(q, label, reaction_ms)

    order = g.ranked(state["logits"])
    top, p = g.leader(state["logits"])
    next_q, q_rows = _pick_question(state["logits"], _questions(state))
    can_stop = state["steps"] >= _min_steps(state)
    done = state["steps"] >= state["max_steps"] or next_q is None or (can_stop and p >= g.STOP_PROB)
    stop_reason = ("max_steps" if state["steps"] >= state["max_steps"] else "no_questions_left" if next_q is None
                   else "leader_threshold" if done else "continue")
    jev_check: dict[str, Any] = {"ran": False, "reason": (
        "game already decided" if done else f"collecting {_min_steps(state)} answers first" if not can_stop
        else f"leader {p:.2f} < {g.JEV_CHECK_FROM}")}
    confidence = None
    if not done and can_stop and p >= g.JEV_CHECK_FROM:
        ctx = _context_after(state)
        top4 = [ScoredDish(DISHES_BY_ID[i], 0.0, {}) for i in order[:4]]
        commit = await decision_engine.commit(ctx, top4, seed=f"{session_id}:{state['steps']}")
        jev_check = {"ran": commit is not None, "candidates": [DISHES_BY_ID[i].name for i in order[:4]], "result": commit}
        if commit is None:
            jev_check["reason"] = "JEV unavailable (see jev/engine events)"
        if commit and commit["confidence"] >= g.JEV_STOP_CONF and commit["dish_id"] in order[:2]:
            done, confidence = True, commit["confidence"]
            order = [commit["dish_id"], *[i for i in order if i != commit["dish_id"]]]
            stop_reason = "jev_commit"
        elif commit:
            jev_check["reason"] = (f"confidence {commit['confidence']:.2f} < {g.JEV_STOP_CONF}" if commit["confidence"] < g.JEV_STOP_CONF
                                   else "JEV's pick is not in the engine's top 2")

    if trace.enabled():
        post_before, post_after = g.softmax(before), g.softmax(state["logits"])
        trace.emit("game.step", step=state["steps"], question={"key": q.key, "kind": q.kind, "label": _question_label(q)},
                   answer=answer, label=label, reaction_ms=reaction_ms, thresholds=_thresholds(state),
                   posterior=_posterior_view(state["logits"], before),
                   entropy_before=trace.r(g.entropy(post_before)), entropy_after=trace.r(g.entropy(post_after)),
                   leader={"id": top, "name": DISHES_BY_ID[top].name, "p": trace.r(p)},
                   jev_check=jev_check, stop_reason=stop_reason, done=done,
                   next_question_scores=_question_scores_view(q_rows) if not done else [],
                   next_question=next_q.key if next_q is not None and not done else None)
    result: dict[str, Any] = {"session_id": session_id, "game": state["game"], "signals": signals}
    if done:
        state["status"] = "done"
        decision = await _decision(state, order, confidence, request_id=session_id, user_token=user_token)
        result["signals"] += _final_signals(state, decision["dish_ids"])
        trace.emit("game.signals", signals=result["signals"])
        result.update(done=True, decision=decision)
    else:
        state["current"] = next_q.key
        result.update(done=False, question=_public(next_q))
    result["progress"] = _progress(state)
    _save(session_id, state)
    return result
