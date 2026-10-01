"""Learning-layer endpoints: signal ingestion, learned profile, replay,
group consensus, and twin-taste discovery."""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.data.dishes import DISHES_BY_ID
from app.learning import (
    ann,
    calibration,
    entropy,
    learner,
    mood_map,
    orchestrator,
    patterns,
    persona,
    replay,
    store,
    tradeoffs,
    user_model,
)

logger = logging.getLogger("learning")

router = APIRouter()


def _check_sync_key(x_sync_key: Optional[str]) -> None:
    if settings.sync_key and x_sync_key != settings.sync_key:
        raise HTTPException(status_code=403, detail="Forbidden")


class SignalIn(BaseModel):
    id: int = 0
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)


class LearnBatch(BaseModel):
    user_id: str
    signals: list[SignalIn]


class ReplayRequest(BaseModel):
    user_id: str
    from_scratch: bool = False


class GroupConsensusRequest(BaseModel):
    member_ids: list[str] = Field(default_factory=list)
    guest_swipes: list[dict[str, Any]] = Field(default_factory=list)
    count: int = 3


@router.post("/api/learn/signals")
async def learn_signals(batch: LearnBatch, x_sync_key: Optional[str] = Header(default=None)) -> dict:
    _check_sync_key(x_sync_key)
    await replay.ensure_user(batch.user_id)
    return learner.apply_batch(batch.user_id, [s.model_dump() for s in batch.signals])


@router.post("/api/learn/replay")
async def learn_replay(request: ReplayRequest, x_sync_key: Optional[str] = Header(default=None)) -> dict:
    _check_sync_key(x_sync_key)
    if request.from_scratch:
        # Only this user's rows are wiped implicitly by refolding from id 0 —
        # cursor reset makes the fold idempotent from the start of the log.
        store.execute("DELETE FROM signal_cursor WHERE user_id = ?", (request.user_id,))
        store.execute("DELETE FROM user_vectors WHERE user_id = ?", (request.user_id,))
        store.execute("DELETE FROM user_mood_map WHERE user_id = ?", (request.user_id,))
        store.execute("DELETE FROM tradeoff_weights WHERE user_id = ?", (request.user_id,))
        store.execute("DELETE FROM calibration_stats WHERE user_id = ?", (request.user_id,))
        store.execute("DELETE FROM usage_stats WHERE user_id = ?", (request.user_id,))
        store.execute("DELETE FROM mood_checkins WHERE user_id = ?", (request.user_id,))
        store.execute("DELETE FROM recent_picks WHERE user_id = ?", (request.user_id,))
        store.execute("DELETE FROM personas WHERE user_id = ?", (request.user_id,))
    applied = await replay.replay_user(request.user_id, from_scratch=request.from_scratch)
    return {"success": True, "applied": applied}


@router.get("/api/profile/{user_id}")
async def learned_profile(user_id: str) -> dict:
    await replay.ensure_user(user_id)
    plan = orchestrator.game_plan(user_id)
    accuracy = calibration.rolling_accuracy(user_id)
    persona_info = persona.get(user_id)

    checkin = store.fetchone(
        "SELECT energy, stress, hunger, social FROM mood_checkins WHERE user_id = ? ORDER BY signal_id DESC LIMIT 1",
        (user_id,),
    )
    key = mood_map.mood_key(
        checkin["energy"] if checkin else None,
        checkin["stress"] if checkin else None,
        checkin["social"] if checkin else None,
    )

    return {
        "user_id": user_id,
        "confidence": plan["confidence"],
        "question_budget": plan["question_budget"],
        "mode": plan["mode"],
        "game_plan": plan["games"],
        "uncertainty": plan["uncertainty"],
        "accuracy_meter": accuracy,
        "persona": persona_info,
        "mood_map_top": [
            {"archetype": archetype, "weight": round(weight, 3)}
            for archetype, weight in mood_map.top_archetypes(user_id, key)
        ],
        "tradeoff_weights": tradeoffs.get_weights(user_id),
        "entropy_state": {
            "entropy": entropy.order_entropy(user_id),
            "in_rut": entropy.in_rut(user_id),
        },
        "next_meal_prediction": patterns.next_meal_prediction(
            user_id, {"day_of_week": "", "time_of_day": ""}
        ),
        "n_signals": store.get_usage(user_id, "n_signals", 0),
    }


@router.post("/api/group/consensus")
async def group_consensus(request: GroupConsensusRequest) -> dict:
    from app.learning import group

    for member_id in request.member_ids:
        await replay.ensure_user(member_id)
    options = group.consensus(request.member_ids, request.guest_swipes, request.count)
    return {"success": bool(options), "options": options}


@router.get("/api/twin-taste/{user_id}")
async def twin_taste(user_id: str, count: int = 6) -> dict:
    """Dishes loved by taste neighbours but unseen by this user. Aggregates only."""
    await replay.ensure_user(user_id)
    neighbours = ann.nearest_users(user_id, top_k=10)
    if not neighbours:
        return {"success": False, "neighbor_count": 0, "dishes": []}

    seen_rows = store.fetchall(
        "SELECT DISTINCT dish_id FROM recent_picks WHERE user_id = ?", (user_id,)
    )
    seen = {row["dish_id"] for row in seen_rows}

    counts: dict[str, int] = {}
    for neighbour_id, _score in neighbours:
        rows = store.fetchall(
            """SELECT DISTINCT dish_id FROM recent_picks
               WHERE user_id = ? AND kind IN ('order', 'like') AND dish_id IS NOT NULL""",
            (neighbour_id,),
        )
        for row in rows:
            if row["dish_id"] not in seen:
                counts[row["dish_id"]] = counts.get(row["dish_id"], 0) + 1

    ranked = sorted(counts.items(), key=lambda pair: -pair[1])[:count]
    return {
        "success": True,
        "neighbor_count": len(neighbours),
        "dishes": [
            {
                "dish_id": dish_id,
                "dish_name": DISHES_BY_ID[dish_id].name if dish_id in DISHES_BY_ID else dish_id,
                "loved_by": n,
            }
            for dish_id, n in ranked
        ],
    }
