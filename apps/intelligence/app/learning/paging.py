"""Refresh = next page of the ranking, not a re-roll.

JEV is deterministic, so "Get new picks" (which today only changes the
temperature) would return the same dishes. When a signed-in user repeats the
same request within a few minutes, the dishes already shown are excluded;
after a few pages the cycle restarts from the top.
"""

from __future__ import annotations

import hashlib
import json
import time

from app.learning import store
from app.schemas.request import RecommendationRequest

WINDOW_S = 15 * 60
MAX_PAGES = 3
_KEY = "last_page"


def fingerprint(body: RecommendationRequest) -> str:
    """Same user context + mode + count = same question (temperature/ids ignored)."""
    payload = {
        "ctx": body.user_context.model_dump(exclude_none=True),
        "mode": body.recommendation_config.mode,
        "count": body.recommendation_config.count,
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:24]


def exclusions(user_id: str | None, fp: str, now: float | None = None) -> frozenset[str]:
    if not user_id:
        return frozenset()
    state = store.get_usage(user_id, _KEY, {}) or {}
    now = now or time.time()
    if state.get("fp") == fp and now - state.get("at", 0) < WINDOW_S and state.get("pages", 0) < MAX_PAGES:
        return frozenset(state.get("shown", []))
    return frozenset()


def remember(user_id: str | None, fp: str, shown: list[str], excluded: frozenset[str], now: float | None = None) -> None:
    if not user_id:
        return
    now = now or time.time()
    if excluded:
        state = store.get_usage(user_id, _KEY, {}) or {}
        state.update(shown=[*state.get("shown", []), *shown], pages=state.get("pages", 1) + 1, at=now)
    else:
        state = {"fp": fp, "shown": list(shown), "pages": 1, "at": now}
    store.set_usage(user_id, _KEY, state)
