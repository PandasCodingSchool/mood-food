"""Server-driven adaptive games (swipe, this-or-that, craving radar, story)."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.games import sessions
from app.schemas.request import UserContext

router = APIRouter(prefix="/api/games", tags=["games"])


class StartRequest(BaseModel):
    user_context: UserContext
    game: Optional[str] = None          # omit to let the orchestrator pick
    user_id: Optional[str] = None       # omit for anonymous (site teaser)
    count: int = Field(default=3, ge=1, le=5)
    max_steps: Optional[int] = Field(default=None, ge=1, le=10)


class AnswerRequest(BaseModel):
    answer: dict[str, Any]
    reaction_ms: Optional[int] = Field(default=None, ge=0)


@router.post("/session")
async def start(body: StartRequest) -> dict:
    try:
        return await run_in_threadpool(sessions.start, body.game, body.user_context, body.user_id, body.count, body.max_steps)
    except sessions.GameError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/session/{session_id}/answer")
async def answer(session_id: str, body: AnswerRequest) -> dict:
    try:
        return await sessions.answer(session_id, body.answer, body.reaction_ms)
    except sessions.GameError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/session/{session_id}")
async def status(session_id: str) -> dict:
    try:
        state = await run_in_threadpool(sessions.load, session_id)
    except sessions.GameError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"session_id": session_id, "game": state["game"], "status": state["status"],
            "step": state["steps"], "max_steps": state["max_steps"], "current": state.get("current")}
