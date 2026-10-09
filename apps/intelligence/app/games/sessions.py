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
import random
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
# so one strong answer can't end a game on its own. Structured games (bracket, roulette)
# end only when their format does: champion crowned / dish accepted / spins used.
GAMES: dict[str, dict[str, int]] = {
    "swipe": {"min_steps": 4, "max_steps": 8},
    "this_or_that": {"min_steps": 3, "max_steps": 6},
    "craving_radar": {"min_steps": 3, "max_steps": 5},
    "story": {"min_steps": 3, "max_steps": 4},            # three beats of the day + a craving beat
    "bracket": {"min_steps": 7, "max_steps": 7, "structured": 1},   # 4 + 2 + 1 knockout duels
    "roulette": {"min_steps": 1, "max_steps": 3, "structured": 1},  # accept, or re-spin up to 3 times
}
# Orchestrator / mobile game names → playable engine games.
FROM_ORCHESTRATOR = {
    "swipe": "swipe", "this_or_that": "this_or_that", "craving_radar": "craving_radar",
    "day_story": "story", "mood_checkin": "story", "budget_vibe": "story",
    "bracket": "bracket", "wheel": "roulette", "blind_bet": "roulette",
}
ROULETTE_SEGMENTS = 6
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


def _slot(state: dict) -> Optional[str]:
    return (state["ctx"].get("situational") or {}).get("time_of_day")


def _story_questions(state: dict) -> list[g.Question]:
    from app.games import story_beats as sb

    steps = state["story"]["steps"]
    i = len(state["answers"])
    if i >= len(steps):
        return []
    previous = state["answers"][-1]["label"] if state["answers"] else None
    return [g.story_question(state["ids"], steps[i], previous, i, len(steps),
                             sb.COLD_OPENS[state["story"]["tod"]] if i == 0 else None)]


def _bracket_questions(state: dict) -> list[g.Question]:
    b = state["bracket"]
    r = len(b["rounds"]) - 1
    m = len(b["winners"][r])
    if m >= len(b["rounds"][r]):
        return []
    a, other = b["rounds"][r][m]
    matches = len(b["rounds"][r])
    name = {4: "Quarterfinal", 2: "Semifinal", 1: "Final"}.get(matches, f"Round {r + 1}")
    return [g.duel_question(f"bracket:r{r}:m{m}", a, other, state["ids"], {"round": name, "match": m + 1, "matches": matches})]


def _spin_target(state: dict, k: int) -> str:
    """Where spin k lands: seeded per session; stretch segments weighted by the user's appetite for new food."""
    rl = state["roulette"]
    landed: list[str] = []
    for j in range(k + 1):
        rng = random.Random(f"{rl['seed']}:{j}")
        options = [i for i in rl["segments"] if i not in landed]
        weights = [rl["stretch_weight"] if i in rl["stretch"] else 1.0 for i in options]
        landed.append(rng.choices(options, weights=weights, k=1)[0])
    return landed[k]


def _roulette_questions(state: dict) -> list[g.Question]:
    rl = state["roulette"]
    k = len(state["answers"])
    if rl.get("accepted") or k >= state["max_steps"]:
        return []
    return [g.spin_question(k + 1, _spin_target(state, k), rl["segments"], set(rl["stretch"]), state["ids"],
                            spins_left=state["max_steps"] - k - 1)]


def _questions(state: dict) -> list[g.Question]:
    asked = set(state["asked"])
    game = state["game"]
    if game == "swipe":
        return g.swipe_questions(state["ids"], asked)
    if game == "this_or_that":
        return g.duel_questions(state["logits"], asked)
    if game == "craving_radar":
        return g.craving_questions(state["ids"], asked, _slot(state))
    if game == "bracket":
        return _bracket_questions(state)
    if game == "roulette":
        return _roulette_questions(state)
    return _story_questions(state)


def next_story_bases(state: dict) -> list[str]:
    """Base text of the *next* story beat for each choice of the current one (personalisation prefetch)."""
    from app.games import story_beats as sb

    if state.get("game") != "story":
        return []
    steps, i = state["story"]["steps"], len(state["answers"])
    if i + 1 >= len(steps):
        return []
    current, nxt = steps[i], steps[i + 1]
    return [sb.narrative(nxt["beat"], nxt["perspective"], c["id"]) for c in sb.BEATS[current["beat"]]["choices"]]


async def personalise_question(question: dict, state: dict) -> dict:
    """Story scenes rewritten around the user's habits (cached; base text otherwise)."""
    if state.get("game") != "story":
        return question
    from app.games import personalise

    habits = UserContext.model_validate(state["ctx"]).habits
    return await personalise.enrich(question, habits, next_story_bases(state))


def _setup(state: dict, user_id: Optional[str]) -> None:
    """Per-game state: story sequence for the time of day, bracket seeding, roulette wheel."""
    game = state["game"]
    if game == "story":
        from datetime import datetime

        from app.games import story_beats as sb
        from app.history.normalise import IST

        now = datetime.now(IST)
        state["story"] = {"tod": sb.time_of_day(now), "steps": sb.sequence(now)}
        state["max_steps"] = min(state["max_steps"], len(state["story"]["steps"]))
    elif game == "bracket":
        seeds = g.bracket_seeds(state["logits"])
        if len(seeds) < 8:
            raise GameError("not enough candidates for a bracket")
        state["bracket"] = {"seeds": seeds, "rounds": [[[seeds[a], seeds[b]] for a, b in g.SEED_ORDER]], "winners": [[]]}
    elif game == "roulette":
        state["roulette"] = _wheel(state, user_id)


def _wheel(state: dict, user_id: Optional[str]) -> dict:
    """Six segments: three familiar favourites-for-now + three stretch dishes.

    A stretch dish was never ordered and steps outside the user's habits: its cuisine or
    protein differs from their top ones (judged from item profiles, so it works even
    when their orders don't map to catalog dishes). Stretch picks are spread out.
    """
    from app.brain import facts as brain_facts
    from app.brain import orders as brain_orders
    from app.history.profile import CATALOG_CUISINE

    ranked_ids = g.ranked(state["logits"])
    orders = brain_orders.load(user_id) if user_id else []
    food = brain_facts.compute(orders) if orders else {}
    ordered = {i.get("dish_id") for o in orders for i in o.get("items") or [] if i.get("dish_id")}
    top_cuisines = {CATALOG_CUISINE.get(c) for c in list(food.get("cuisine_mix", {}))[:2]} - {None}
    top_proteins = set(list(food.get("protein_mix", {}))[:1])
    half = ROULETTE_SEGMENTS // 2
    familiar = ranked_ids[:half]

    def outside_habits(i: str) -> bool:
        d = DISHES_BY_ID[i]
        if not orders:  # no history: anything a step away from the leaders counts
            return all(g.dish_similarity(d, DISHES_BY_ID[f]) < 0.6 for f in familiar)
        return i not in ordered and (d.cuisine not in top_cuisines or d.protein not in top_proteins)

    stretch: list[str] = []
    # First a different protein (real variety), then a different cuisine; always spread out.
    passes = [lambda i: DISHES_BY_ID[i].protein not in top_proteins, lambda i: True] if top_proteins else [lambda i: True]
    for allowed in passes:
        for i in ranked_ids[half:]:
            if len(stretch) == half:
                break
            if i not in stretch and allowed(i) and outside_habits(i) \
                    and all(g.dish_similarity(DISHES_BY_ID[i], DISHES_BY_ID[j]) < 0.6 for j in stretch):
                stretch.append(i)
    stretch += [i for i in ranked_ids[half:] if i not in stretch and i not in familiar][: half - len(stretch)]
    explore = food.get("exploration_rate")
    segments = [x for pair in zip(familiar, stretch) for x in pair]   # alternate familiar / stretch around the wheel
    return {"segments": segments, "stretch": stretch, "seed": uuid.uuid4().hex,
            "stretch_weight": round(0.6 + (explore if explore is not None else 0.4), 2)}


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
        return (f"{q.payload['round']}: " if q.payload.get("round") else "") + f"{a['name']} vs {b['name']}"
    if q.kind == "spin":
        return f"Spin {q.payload['spin']}: {q.payload['landed']['name']}" + (" (stretch)" if q.payload["landed"].get("stretch") else "")
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
    _setup(state, user_id)
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
    if q.kind == "spin":
        return "accept" if answer.get("accept") else "respin"
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
    if q.kind == "spin" and q.payload["landed"].get("stretch"):
        # A stretch dish offered: accepting or re-spinning is the learner's wildcard verdict.
        return [{"type": "wildcard_verdict", "payload": {"dish_id": q.payload["landed"]["id"], "accepted": label == "accept",
                                                         "source": "game_engine"}}]
    return []


def _final_signals(state: dict, decision_ids: list[str]) -> list[dict]:
    out: list[dict] = []
    if state["game"] == "craving_radar":
        yes = [a["key"][4:] for a in state["answers"] if a["label"] == "yes"]
        no = [a["key"][4:] for a in state["answers"] if a["label"] == "no"]
        out.append({"type": "craving", "payload": {"tags": yes, "rejected": no, "source": "game_engine"}})
    if state["game"] == "story":
        from app.games import story_beats as sb

        picks = [(a["key"].split(":", 1)[1], a["label"]) for a in state["answers"]]
        vector = sb.mood_vector(picks)
        out.append({"type": "day_story", "payload": {
            "mood_vector": vector, "mood": sb.nearest_mood(vector), "time_of_day": state["story"]["tod"],
            "answers": [{"scene": b, "option": c} for b, c in picks], "source": "game_engine",
        }})
    if state["game"] == "bracket":
        out.append({"type": "bracket", "payload": {"picks": decision_ids[:2], "source": "game_engine"}})
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
    update: dict[str, Any] = {}
    if state["game"] == "story":
        from app.games import story_beats as sb

        picks = [(a["key"].split(":", 1)[1], a["label"]) for a in state["answers"]]
        update["mood"] = ctx.mood.model_copy(update={"primary": sb.nearest_mood(sb.mood_vector(picks))})
        tags += [{"crave_spicy": "spicy", "crave_sweet": "sweet"}[c] for _, c in picks if c in ("crave_spicy", "crave_sweet")]
    return ctx.model_copy(update={**update, "game_data": game.model_copy(update={
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


def _advance(state: dict, q: g.Question, label: str) -> None:
    """Move a structured game forward after an answer."""
    if q.key.startswith("bracket:"):
        b = state["bracket"]
        r = len(b["rounds"]) - 1
        b["winners"][r].append(label)
        if len(b["winners"][r]) == len(b["rounds"][r]) and len(b["winners"][r]) > 1:
            w = b["winners"][r]
            b["rounds"].append([[w[i], w[i + 1]] for i in range(0, len(w), 2)])
            b["winners"].append([])
    elif q.kind == "spin":
        state["roulette"].setdefault("landed", []).append(q.payload["landed"]["id"])
        if label == "accept":
            state["roulette"]["accepted"] = q.payload["landed"]["id"]


def _structured_order(state: dict, order: list[str]) -> list[str]:
    """Bracket: champion, runner-up, then the posterior. Roulette: the accepted (or best) dish and its two nearest neighbours."""
    if state["game"] == "bracket":
        final = state["bracket"]["rounds"][-1][0]
        champ = state["bracket"]["winners"][-1][0]
        top2 = [champ, final[1] if final[0] == champ else final[0]]
        return top2 + [i for i in order if i not in top2]
    chosen = state["roulette"].get("accepted") or order[0]   # all spins re-spun: the best remaining dish
    target = DISHES_BY_ID[chosen]
    post = g.softmax(state["logits"])
    neighbours = sorted((i for i in order if i != chosen),
                        key=lambda i: (g.dish_similarity(DISHES_BY_ID[i], target), post[i]), reverse=True)
    return [chosen, *neighbours[:2], *[i for i in order if i != chosen and i not in neighbours[:2]]]


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
    _advance(state, q, label)

    order = g.ranked(state["logits"])
    top, p = g.leader(state["logits"])
    next_q, q_rows = _pick_question(state["logits"], _questions(state))
    structured = bool(GAMES[state["game"]].get("structured"))
    can_stop = state["steps"] >= _min_steps(state) and not structured
    done = state["steps"] >= state["max_steps"] or next_q is None or (can_stop and p >= g.STOP_PROB)
    stop_reason = ("max_steps" if state["steps"] >= state["max_steps"] else "no_questions_left" if next_q is None
                   else "leader_threshold" if done else "continue")
    if structured and done:
        stop_reason = ("champion_crowned" if state["game"] == "bracket"
                       else "accepted" if state["roulette"].get("accepted") else "spins_used")
        order = _structured_order(state, order)
    jev_check: dict[str, Any] = {"ran": False, "reason": (
        "game already decided" if done else "structured game: ends when its format does" if structured
        else f"collecting {_min_steps(state)} answers first" if not can_stop else f"leader {p:.2f} < {g.JEV_CHECK_FROM}")}
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
        result.update(done=False, question=await personalise_question(_public(next_q), state))
    result["progress"] = _progress(state)
    _save(session_id, state)
    return result
