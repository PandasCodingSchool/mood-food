"""What the intelligence knows about a user (the preference brain). Grows phase by phase."""

from __future__ import annotations

from fastapi import APIRouter, Depends
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
async def brain(user_id: str, slot: str | None = None, daytype: str | None = None) -> dict:
    """Facts (food + groceries), context relations and the prediction for now (or a given slot/daytype)."""
    from app.brain import summary
    from app.learning import replay

    await replay.ensure_user(user_id)
    data = await run_in_threadpool(summary.build, user_id, slot, daytype)
    data.pop("orders", None)
    return {"success": True, **data}
