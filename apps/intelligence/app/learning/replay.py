"""Replay: rebuild learned state from the Node backend's durable signals log.

The model store is a cache; this makes it rebuildable. Pulls the sync-key-
guarded internal feed page by page and folds through the learner in id order.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.learning import learner, store

logger = logging.getLogger("learning")

PAGE_SIZE = 500


async def replay_user(user_id: str, from_scratch: bool = False) -> int:
    """Replay a user's signals from the Node log. Returns signals applied."""
    if not settings.sync_key:
        logger.warning("Replay requested but SYNC_KEY is not configured")
        return 0

    since_id = 0 if from_scratch else store.get_cursor(user_id)
    applied = 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            response = await client.get(
                f"{settings.node_base_url}/api/signals/internal",
                params={"userId": user_id, "sinceId": since_id, "limit": PAGE_SIZE},
                headers={"x-sync-key": settings.sync_key},
            )
            response.raise_for_status()
            data = response.json()
            signals = data.get("signals", [])
            if not signals:
                break
            for signal in signals:
                learner.apply_signal(user_id, signal)
                since_id = max(since_id, int(signal.get("id", 0)))
                applied += 1
            if not data.get("has_more"):
                break

    if applied:
        logger.info("Replayed %s signals for user %s", applied, user_id)
    return applied


async def ensure_user(user_id: str) -> None:
    """Lazy recovery: replay when the store has never seen this user."""
    if store.known_user(user_id):
        return
    try:
        await replay_user(user_id, from_scratch=True)
    except Exception as exc:  # noqa: BLE001 — recovery is best-effort
        logger.warning("Lazy replay failed for %s: %s", user_id, exc)
