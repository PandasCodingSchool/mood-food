"""Swiggy order history import (the preference brain's main evidence).

Swiggy shows only the most recent orders, so the API calls this often and
passes the order ids it already stores; only new orders come back (details,
dish mapping and item profiles included). Personal fields are never returned.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.security import require_sync_key

logger = logging.getLogger("history")
router = APIRouter(prefix="/api/history", tags=["history"])


class ImportRequest(BaseModel):
    known_order_ids: list[str] = Field(default_factory=list, max_length=5000)
    address_id: Optional[str] = None


@router.post("/import", dependencies=[Depends(require_sync_key)])
async def import_history(body: ImportRequest, request: Request) -> dict:
    from app.history.ingest import import_orders
    from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPClient

    token = request.headers.get("x-swiggy-user-token")
    if not token:
        return {"success": False, "error": "x-swiggy-user-token required", "orders": []}
    try:
        result = await import_orders(SwiggyMCPClient(token=token), frozenset(body.known_order_ids), body.address_id)
    except SwiggyAuthError as exc:
        return {"success": False, "error": f"token rejected: {exc}", "token_rejected": True, "orders": []}
    except Exception as exc:  # noqa: BLE001 — import is best-effort; the next refresh retries
        logger.warning("history import failed: %s", type(exc).__name__)
        return {"success": False, "error": type(exc).__name__, "orders": []}
    return {"success": True, "stats": result.stats(), "orders": [o.to_dict() for o in result.orders]}


@router.post("/groceries/import", dependencies=[Depends(require_sync_key)])
async def import_groceries(body: ImportRequest, request: Request) -> dict:
    """The linked user's Instamart orders (new ones only) + go-to items, profiled, with grocery facts."""
    from dataclasses import asdict

    from app.config import settings
    from app.history.grocery import import_groceries as run
    from app.history.grocery_facts import compute
    from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPClient

    token = request.headers.get("x-swiggy-user-token")
    if not token:
        return {"success": False, "error": "x-swiggy-user-token required", "orders": []}
    try:
        result = await run(SwiggyMCPClient(token=token, mcp_url=settings.swiggy_instamart_mcp_url), frozenset(body.known_order_ids))
    except SwiggyAuthError as exc:
        return {"success": False, "error": f"token rejected: {exc}", "token_rejected": True, "orders": []}
    except Exception as exc:  # noqa: BLE001 — best-effort, retried on the next refresh
        logger.warning("grocery import failed: %s", type(exc).__name__)
        return {"success": False, "error": type(exc).__name__, "orders": []}
    orders = [o.to_dict() for o in result.orders]
    go_to = [asdict(i) for i in result.go_to]
    return {"success": True, "stats": result.stats(), "orders": orders, "go_to": go_to, "facts": compute(orders, go_to)}
