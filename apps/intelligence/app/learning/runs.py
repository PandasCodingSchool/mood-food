"""Decision telemetry: one ``recommendation_runs`` row per recommendation.

Records what was considered (shortlist), how it was ranked, what was shown,
and how long each stage took, keyed by the request id the API also stores on
its predictions/signals — so outcomes (order, veto, post-meal) can be joined
back to the decision. Written after the response; failures only log.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from app.learning import store

logger = logging.getLogger("learning")


def record(
    request_id: Optional[str],
    *,
    user_id: Optional[str],
    mode: Optional[str],
    ranker_provider: str,
    model: Optional[str],
    shortlist: list[str],
    ranked: list[str],
    selected: list[str],
    fallback_used: bool,
    cache_hit: bool,
    live_status: Optional[str],
    latency_ms: dict[str, float],
    tokens: Optional[int],
    shadow: Optional[dict[str, Any]] = None,
) -> None:
    if not request_id:
        return
    try:
        store.execute(
            """INSERT INTO recommendation_runs (
                   request_id, user_id, mode, ranker_provider, model, shortlist_json, ranked_json,
                   selected_json, fallback_used, cache_hit, live_status, latency_json, tokens, shadow_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (request_id) DO NOTHING""",
            (
                request_id, user_id, mode, ranker_provider, model,
                json.dumps(shortlist), json.dumps(ranked), json.dumps(selected),
                fallback_used, cache_hit, live_status, json.dumps(latency_ms), tokens,
                json.dumps(shadow) if shadow else None,
            ),
        )
    except Exception as exc:  # noqa: BLE001 — telemetry must never break a request
        logger.warning("recommendation_runs write failed: %s", exc)


def attach_shadow(request_id: str, shadow: dict[str, Any]) -> None:
    """Add a background (shadow) ranking to an existing run."""
    try:
        store.execute(
            "UPDATE recommendation_runs SET shadow_json = ? WHERE request_id = ?",
            (json.dumps(shadow), request_id),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("recommendation_runs shadow update failed: %s", exc)


def get(request_id: str) -> Optional[dict[str, Any]]:
    row = store.fetchone("SELECT * FROM recommendation_runs WHERE request_id = ?", (request_id,))
    if row is None:
        return None
    out = {k: row[k] for k in row.keys()}
    for key in ("shortlist_json", "ranked_json", "selected_json", "latency_json", "shadow_json"):
        if out.get(key):
            out[key[: -len("_json")]] = json.loads(out.pop(key))
        else:
            out.pop(key, None)
    return out
