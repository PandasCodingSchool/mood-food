"""GPT-first recommendation route with progressive live enrichment.

Flow:
  1. Build deterministic shortlist (hard-filter + score).
  2. GPT ranks the shortlist and returns a small candidate pool
     (pool_size = min(max(count*2, count+3), shortlist length)).
     One GPT call only; result is cached by mood+profile+candidates.
  3. Progressively enrich the GPT-ranked pool in small waves.
     Wave 1 covers count+1 items.  Stop as soon as ≥ count live matches
     are found.  Only probe the next wave when needed.
  4. Final selection: GPT order preserved; live-matched items first; fill
     remaining slots from the highest-ranked unmatched GPT candidates.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

from fastapi import APIRouter, Request

from app.data.dishes import DISHES_BY_ID
from app.schemas.request import RecommendationRequest
from app.schemas.response import (
    PracticalDetails,
    Recommendation,
    RecommendationResponse,
    Restaurant,
)
from app.schemas.swiggy import EnrichDishInput
from app.services import recommender
from app.services.shortlist import build_shortlist

logger = logging.getLogger(__name__)

router = APIRouter()

# Coalesce duplicate in-flight requests by (request_id|address|cache-ish key).
_INFLIGHT: dict[str, asyncio.Future] = {}


def _flight_key(request: RecommendationRequest) -> str:
    if request.request_id:
        return f"rid:{request.request_id}"
    mood = request.user_context.mood.primary
    addr = request.swiggy_address_id or ""
    count = request.recommendation_config.count
    return f"auto:{mood}|{addr}|{count}|{request.recommendation_config.temperature}"


def _dish_enrich_input(rec: Recommendation) -> EnrichDishInput:
    dish = DISHES_BY_ID.get(rec.dish.id)
    return EnrichDishInput(
        id=rec.dish.id,
        name=rec.dish.name,
        cuisine=rec.dish.cuisine,
        aliases=list(dish.swiggy_aliases or []) if dish else [],
        search_category=dish.swiggy_search_category if dish else None,
    )


def _inject_live_data(
    recs: list[Recommendation],
    live_facts: dict[str, dict],
) -> list[Recommendation]:
    """Return a new list with restaurant/price/image updated from live_facts."""
    out: list[Recommendation] = []
    for r in recs:
        live = live_facts.get(r.dish.id)
        if live and live.get("restaurant"):
            rest = live["restaurant"]
            item = live.get("item") or {}
            out.append(r.model_copy(update={
                "image_url": item.get("image_url") or r.image_url,
                "restaurant": Restaurant(
                    name=rest.get("name", "Local Kitchen"),
                    rating=float(rest.get("rating") or 4.0),
                    distance_km=float(rest.get("distance_km") or 2.0),
                    delivery_time_min=int(rest.get("eta_min") or 30),
                    is_open=bool(rest.get("is_open", True)),
                ),
                "practical_details": r.practical_details.model_copy(update={
                    "estimated_price": float(
                        item.get("price") or r.practical_details.estimated_price
                    ),
                }),
            }))
        else:
            out.append(r)
    return out


@router.post("/api/ai-recommendations", response_model=RecommendationResponse)
async def get_recommendations(
    body: RecommendationRequest,
    request: Request,
) -> RecommendationResponse:
    key = _flight_key(body)
    existing = _INFLIGHT.get(key)
    if existing is not None and not existing.done():
        logger.info("ai-recommendations: coalescing duplicate request key=%s", key)
        return await existing

    loop = asyncio.get_event_loop()
    fut: asyncio.Future = loop.create_future()
    _INFLIGHT[key] = fut
    try:
        result = await _run_pipeline(body, request)
        if not fut.done():
            fut.set_result(result)
        return result
    except Exception as exc:
        if not fut.done():
            fut.set_exception(exc)
        raise
    finally:
        async def _clear():
            await asyncio.sleep(0.5)
            if _INFLIGHT.get(key) is fut:
                _INFLIGHT.pop(key, None)
        asyncio.create_task(_clear())


async def _run_pipeline(
    body: RecommendationRequest,
    request: Request,
) -> RecommendationResponse:
    t0 = time.time()
    final_count = body.recommendation_config.count
    shortlist = build_shortlist(body.user_context, body.recommendation_config)
    logger.info(
        "ai-recommendations: shortlist=%d mood=%s address=%s",
        len(shortlist), body.user_context.mood.primary, body.swiggy_address_id,
    )

    # Step 1 — GPT ranks the shortlist and returns a bounded candidate pool.
    pool_size = min(max(final_count * 2, final_count + 3), len(shortlist))
    pool_config = body.recommendation_config.model_copy(update={"count": pool_size})
    pool_body = body.model_copy(update={"recommendation_config": pool_config})

    gpt_response = recommender.get_recommendations(
        pool_body, candidate_dishes=shortlist, live_facts=None
    )
    is_cache_hit = bool(gpt_response.ai_metadata and gpt_response.ai_metadata.cache_hit)
    gpt_pool: list[Recommendation] = list(gpt_response.recommendations)

    if not body.swiggy_address_id or not gpt_pool:
        final_recs = [
            r.model_copy(update={"rank": i + 1})
            for i, r in enumerate(gpt_pool[:final_count])
        ]
        return gpt_response.model_copy(update={
            "recommendations": final_recs,
            "live_status": "offline",
            "request_id": body.request_id,
        })

    # Step 2 — Progressive live enrichment of the GPT-ranked pool.
    live_facts: dict[str, dict] = {}
    addr: Optional[str] = body.swiggy_address_id
    live_status = "offline"

    user_token = request.headers.get("x-swiggy-user-token")
    from app.services.swiggy_token import load_token
    from app.services.swiggy_mcp import SwiggyMCPClient
    from app.services.swiggy_discovery import SwiggyDiscoveryService

    token = user_token or load_token()
    if token:
        client = SwiggyMCPClient(token=token)
        service = SwiggyDiscoveryService(client=client)

        wave_start = 0
        wave_size = final_count + 1  # First wave: one more than needed

        while wave_start < len(gpt_pool):
            wave = gpt_pool[wave_start : wave_start + wave_size]
            to_enrich = [
                _dish_enrich_input(r)
                for r in wave
                if r.dish.id not in live_facts
            ]
            if to_enrich:
                try:
                    addr, matches = await service.enrich(to_enrich, address_id=addr)
                    for m in matches:
                        if m.matched:
                            live_facts[m.dish_id] = m.model_dump()
                except Exception as exc:
                    logger.warning("ai-recommendations: swiggy enrich failed: %s", exc)
                    break

            if len(live_facts) >= final_count:
                break  # Enough live matches — stop probing.

            wave_start += wave_size
            # Next wave: just enough to fill remaining slots + 1 buffer.
            wave_size = max(1, final_count - len(live_facts) + 1)

        logger.info(
            "ai-recommendations: live_matches=%d/%d (pool=%d shortlist=%d)",
            len(live_facts), len(gpt_pool), pool_size, len(shortlist),
        )

    # Step 3 — Final selection: GPT order, live-matched first, fill from ranked unmatched.
    live_recs = [r for r in gpt_pool if r.dish.id in live_facts]
    unmatched_recs = [r for r in gpt_pool if r.dish.id not in live_facts]

    if len(live_recs) >= final_count:
        selected = live_recs[:final_count]
    else:
        selected = live_recs + unmatched_recs[:final_count - len(live_recs)]

    selected = _inject_live_data(selected, live_facts)
    selected = [r.model_copy(update={"rank": i + 1}) for i, r in enumerate(selected)]

    matched_for_response = {
        r.dish.id: live_facts[r.dish.id]
        for r in selected
        if r.dish.id in live_facts
    }
    # Only include actual swiggy matches from dishes included in the final response.
    # (live_facts may contain extras from the pool that were not selected.)

    if matched_for_response and len(matched_for_response) == len(selected):
        live_status = "live"
    elif matched_for_response:
        live_status = "partial"
    elif body.swiggy_address_id:
        live_status = "offline"

    elapsed = round(time.time() - t0, 2)
    logger.info(
        "ai-recommendations: done elapsed=%.2fs pool=%d live=%d status=%s cache_hit=%s",
        elapsed, pool_size, len(matched_for_response), live_status, is_cache_hit,
    )

    return gpt_response.model_copy(update={
        "recommendations": selected,
        "swiggy_matches": matched_for_response or None,
        "swiggy_address_id": addr,
        "live_status": live_status,
        "request_id": body.request_id,
    })
