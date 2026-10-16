"""What the intelligence knows about a user (the preference brain). Grows phase by phase."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.security import require_sync_key

router = APIRouter(prefix="/api/brain", tags=["brain"])


@router.get("/{user_id}/groceries", dependencies=[Depends(require_sync_key)])
async def groceries(user_id: str) -> dict:
    """Grocery facts over every Instamart order and the latest go-to list accumulated for this user."""
    from app.history.grocery_facts import compute
    from app.learning import replay, store

    await replay.ensure_user(user_id)

    def run() -> dict:
        orders = list((store.get_usage(user_id, "grocery_orders", {}) or {}).values())
        return compute(orders, store.get_usage(user_id, "grocery_go_to", []) or [])

    return {"success": True, "user_id": user_id, "groceries": await run_in_threadpool(run)}


@router.get("/{user_id}", dependencies=[Depends(require_sync_key)])
async def brain(user_id: str, slot: str | None = None, daytype: str | None = None, refresh: bool = False) -> dict:
    """Facts (food + groceries), context relations and the prediction for now (or a given slot/daytype)."""
    from app.brain import summary
    from app.learning import replay

    await replay.ensure_user(user_id)
    data = await summary.view(user_id, slot, daytype, refresh=refresh)
    data.pop("orders", None)
    return {"success": True, **data}


class SuggestRequest(BaseModel):
    slot: Optional[str] = None        # default: now (IST)
    daytype: Optional[str] = None     # weekday | weekend; default: today
    weather: Optional[str] = None
    count: int = Field(default=3, ge=2, le=5)
    swiggy_address_id: Optional[str] = None
    refresh: bool = False


@router.post("/{user_id}/suggest", dependencies=[Depends(require_sync_key)])
async def suggest(user_id: str, body: SuggestRequest, request: Request) -> dict:
    """Suggested for you (home screen): brain-driven picks for now + one stretch, cached per evidence."""
    from app.brain import suggest as sos
    from app.learning import replay

    await replay.ensure_user(user_id)
    result = await sos.suggest(user_id, slot=body.slot, daytype=body.daytype, weather=body.weather, count=body.count,
                               address_id=body.swiggy_address_id, user_token=request.headers.get("x-swiggy-user-token"),
                               refresh=body.refresh)
    return {"success": True, **result}


@router.get("/{user_id}/success", dependencies=[Depends(require_sync_key)])
async def success(user_id: str) -> dict:
    """How suggestions performed: followed by an order, exact / similar, stretch accepted."""
    from app.brain import success as metrics

    return {"success": True, **(await run_in_threadpool(metrics.compute, user_id))}
