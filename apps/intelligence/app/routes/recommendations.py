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

from starlette.concurrency import run_in_threadpool
from typing import Optional

from fastapi import APIRouter, Request

from app.config import settings
from app.data.dishes import DISHES_BY_ID
from app.decisions import engine, ranker as jev_ranker
from app.lab import trace
from app.learning import live_state, paging, runs
from app.schemas.request import RecommendationRequest
from app.schemas.response import (
    LearnedMeta,
    PracticalDetails,
    Recommendation,
    RecommendationResponse,
)
from app.services import live_cards, recommender
from app.services.shortlist import ScoredDish, build_scored_shortlist, filter_report, score_breakdown

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


# Strong refs so fire-and-forget tasks aren't garbage-collected mid-flight.
_BACKGROUND: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _BACKGROUND.add(task)
    task.add_done_callback(_BACKGROUND.discard)


async def _shadow_rank(body: RecommendationRequest, shortlist, gpt_ranked: list[str], recorded) -> None:
    """JEV ranks the same shortlist after the user has their answer; both orders are stored."""
    try:
        result = await jev_ranker.rank(body.user_context, shortlist, seed=body.request_id or "")
        if result is None:
            return
        result["agreement_top3_vs_gpt"] = jev_ranker.agreement(result["ranked"], gpt_ranked)
        await recorded  # the run row must exist before we attach to it
        await run_in_threadpool(runs.attach_shadow, body.request_id, result)
    except Exception as exc:  # noqa: BLE001 — shadow work never affects users
        logger.warning("shadow rank failed: %s", exc)


def _learned_wildcard_ids(body: RecommendationRequest) -> list[str]:
    """Anti-rut wildcards: explicit wildcard mode, or a detected boredom loop."""
    if not body.user_id:
        return []
    from app.learning import entropy

    if body.recommendation_config.mode == "wildcard" or entropy.in_rut(body.user_id):
        return entropy.wildcard_candidates(body.user_id, limit=3)
    return []


def _attach_learning(
    body: RecommendationRequest,
    response: RecommendationResponse,
    wildcard_ids: list[str],
) -> RecommendationResponse:
    """Attach predicted scores, wildcard flags, learned meta, and insights."""
    mode = body.recommendation_config.mode
    if not body.user_id:
        return response.model_copy(update={"meta": LearnedMeta(mode=mode)})

    from app.learning import calibration, confidence as confidence_mod, embeddings
    from app.learning import patterns, persona, user_model
    from app.learning.orchestrator import question_budget

    user_id = body.user_id
    wildcard_set = set(wildcard_ids)
    updated_recs: list[Recommendation] = []
    for rec in response.recommendations:
        predicted = None
        vec = embeddings.get_dish_vector(rec.dish.id)
        if vec is not None:
            raw = user_model.score_dish(user_id, vec)
            if raw is not None:
                predicted = round(max(0.0, min(1.0, (raw + 1.0) / 2.0)), 3)
        updated_recs.append(
            rec.model_copy(update={
                "predicted_score": predicted,
                "is_wildcard": rec.dish.id in wildcard_set,
            })
        )

    budget, conf = question_budget(user_id)
    if body.request_id:
        for rec in updated_recs:
            calibration.record_prediction(
                user_id, body.request_id, rec.dish.id,
                rec.predicted_score if rec.predicted_score is not None else 0.5,
                conf,
            )

    persona_info = persona.get(user_id)
    situational = body.user_context.situational
    prediction_context = {
        "day_of_week": situational.day_of_week if situational else "",
        "time_of_day": situational.time_of_day if situational else "",
    }
    insights = response.insights
    if insights:
        insights = insights.model_copy(update={
            "next_meal_prediction": patterns.next_meal_prediction(user_id, prediction_context),
            "persona_drift": persona_info.get("drift_line") if persona_info else None,
        })

    return response.model_copy(update={
        "recommendations": updated_recs,
        "insights": insights,
        "meta": LearnedMeta(
            confidence=conf,
            question_budget=budget,
            persona=persona_info.get("archetype") if persona_info else None,
            mode=mode,
            accuracy_meter=calibration.rolling_accuracy(user_id),
        ),
    })


async def _run_pipeline(
    body: RecommendationRequest,
    request: Request,
) -> RecommendationResponse:
    t0 = time.time()
    # Learning-store reads (SQLite) and embedding lookups are blocking: keep
    # them off the event loop.
    body = await run_in_threadpool(live_state.apply_learned_state, body)
    final_count = body.recommendation_config.count
    scored = await run_in_threadpool(
        build_scored_shortlist, body.user_context, body.recommendation_config, user_id=body.user_id
    )
    t_shortlist = time.time()

    # Anti-rut: make sure wildcard candidates are in front of the ranker.
    wildcard_ids = await run_in_threadpool(_learned_wildcard_ids, body)
    if wildcard_ids:
        shortlist_ids = {s.dish.id for s in scored}
        for wid in wildcard_ids:
            if wid not in shortlist_ids and wid in DISHES_BY_ID:
                parts = score_breakdown(DISHES_BY_ID[wid], body.user_context)
                scored.append(ScoredDish(DISHES_BY_ID[wid], sum(parts.values()), parts))
    shortlist = [s.dish for s in scored]
    if trace.enabled():
        trace.emit("pipeline.shortlist", context_used=body.user_context.model_dump(mode="json", exclude_none=True),
                   filters=filter_report(body.user_context), wildcards=wildcard_ids, size=len(scored),
                   candidates=[{"id": x.dish.id, "name": x.dish.name, "cuisine": x.dish.cuisine, "price": x.dish.price_inr,
                                "total": trace.r(x.total, 2), "parts": {k: trace.r(v, 2) for k, v in x.parts.items()}}
                               for x in scored])
    logger.info(
        "ai-recommendations: shortlist=%d mood=%s address=%s",
        len(shortlist), body.user_context.mood.primary, body.swiggy_address_id,
    )

    # Step 1 — GPT ranks the shortlist and returns a bounded candidate pool.
    pool_size = min(max(final_count * 2, final_count + 3), len(shortlist))
    pool_config = body.recommendation_config.model_copy(update={"count": pool_size})
    pool_body = body.model_copy(update={"recommendation_config": pool_config})

    ranker_used = "gpt"
    eng: Optional[engine.EngineResult] = None
    fp = paging.fingerprint(body)
    excluded: frozenset[str] = frozenset()
    if settings.ranker_provider == "jev":
        excluded = await run_in_threadpool(paging.exclusions, body.user_id, fp)
        eng = await engine.rank(body.user_context, scored, exclude=excluded, diversity=body.recommendation_config.diversity or "medium")
    if eng is not None and eng.provider == "jev":
        ranker_used = "jev"
        conf = {i: eng.jev_fit.get(i, 0.4 + 0.4 * eng.blended[i]) for i in eng.blended}
        gpt_response = await run_in_threadpool(lambda: recommender.recommendations_from_ranking(
            pool_body, eng.ranked[:pool_size], confidence=conf, jev_fit=eng.jev_fit,
            model=eng.model, response_time_s=round(eng.latency_ms / 1000, 2), tokens=eng.input_tokens,
        ))
    else:
        # JEV off, down or unsure → GPT ranks; GPT failing → deterministic shortlist order.
        gpt_response = await recommender.get_recommendations(
            pool_body, candidate_dishes=shortlist, live_facts=None
        )
        if not gpt_response.success:
            ranker_used = "deterministic"
    is_cache_hit = bool(gpt_response.ai_metadata and gpt_response.ai_metadata.cache_hit)
    gpt_pool: list[Recommendation] = list(gpt_response.recommendations)
    t_rank = time.time()
    trace.emit("pipeline.rank", ranker_requested=settings.ranker_provider, ranker_used=ranker_used,
               fallback=None if ranker_used == "jev" else ("JEV unavailable → GPT" if ranker_used == "gpt" else "GPT failed → rule order"),
               pool_size=pool_size, paging_excluded=sorted(excluded), cache_hit=is_cache_hit,
               pool=[{"id": r.dish.id, "name": r.dish.name, "confidence": r.confidence} for r in gpt_pool])

    # Commit confidence + hero copy polish run while Swiggy matching does.
    commit_task = (
        asyncio.create_task(engine.commit(body.user_context, eng.ranked, seed=body.request_id or fp))
        if ranker_used == "jev" and eng is not None else None
    )
    polish_task = None
    if ranker_used == "jev" and gpt_pool:
        from app.services.polish import polish

        polish_task = asyncio.create_task(polish(gpt_pool[0].ai_reasoning, gpt_pool[0].dish.name))

    async def _finish(final: RecommendationResponse) -> RecommendationResponse:
        """Engine extras: mind-reader commit, polished hero copy, meta, paging."""
        commit_result = await commit_task if commit_task else None
        recs = list(final.recommendations)
        mode = body.recommendation_config.mode
        if commit_result and mode in ("mind_reader", "sos") and commit_result["confidence"] >= 0.5:
            chosen = next((r for r in gpt_pool if r.dish.id == commit_result["dish_id"]), None)
            if chosen and recs and chosen.dish.id != recs[0].dish.id:
                recs = [chosen.model_copy(update={"rank": 1})] + [r for r in recs if r.dish.id != chosen.dish.id][: final_count - 1]
        if polish_task is not None and recs:
            polished = await polish_task
            if polished is not None and recs[0].dish.id == gpt_pool[0].dish.id:
                recs[0] = recs[0].model_copy(update={"ai_reasoning": polished})
        recs = [r.model_copy(update={"rank": i + 1}) for i, r in enumerate(recs)]
        if ranker_used == "jev":
            await run_in_threadpool(paging.remember, body.user_id, fp, [r.dish.id for r in recs], excluded)
        meta = (final.meta or LearnedMeta(mode=mode)).model_copy(update={
            "ranker": ranker_used,
            "commit_confidence": commit_result["confidence"] if commit_result else None,
            "suggested_count": engine.suggested_count(commit_result, final_count) if commit_result else None,
        })
        return final.model_copy(update={"recommendations": recs, "meta": meta})

    def _trace(final: RecommendationResponse) -> RecommendationResponse:
        """Record the decision after responding; outcomes join on request_id."""
        meta = gpt_response.ai_metadata
        done = time.time()
        trace.emit("pipeline.summary", ranker=ranker_used, live_status=final.live_status,
                   selected=[r.dish.name for r in final.recommendations],
                   commit_confidence=final.meta.commit_confidence if final.meta else None,
                   suggested_count=final.meta.suggested_count if final.meta else None,
                   latency_ms={"shortlist": round((t_shortlist - t0) * 1000, 1), "rank": round((t_rank - t_shortlist) * 1000, 1),
                               "enrich_and_finish": round((done - t_rank) * 1000, 1), "total": round((done - t0) * 1000, 1)})
        recorded = asyncio.get_running_loop().run_in_executor(None, lambda: runs.record(
            body.request_id,
            user_id=body.user_id,
            mode=body.recommendation_config.mode,
            ranker_provider=ranker_used,
            model=meta.model_used if meta else None,
            shortlist=[d.id for d in shortlist],
            ranked=[r.dish.id for r in gpt_pool],
            selected=[r.dish.id for r in final.recommendations],
            fallback_used=not gpt_response.success,
            cache_hit=is_cache_hit,
            live_status=final.live_status,
            latency_ms={
                "shortlist": round((t_shortlist - t0) * 1000, 1),
                "rank": round((t_rank - t_shortlist) * 1000, 1),
                "enrich": round((done - t_rank) * 1000, 1),
                "total": round((done - t0) * 1000, 1),
            },
            tokens=meta.tokens_used if meta else None,
        ))
        if settings.ranker_provider == "shadow" and ranker_used == "gpt" and body.request_id:
            _spawn(_shadow_rank(body, shortlist, [r.dish.id for r in gpt_pool], recorded))
        return final

    if not body.swiggy_address_id or not gpt_pool:
        final_recs = [
            r.model_copy(update={"rank": i + 1})
            for i, r in enumerate(gpt_pool[:final_count])
        ]
        return _trace(await _finish(await run_in_threadpool(
            _attach_learning,
            body,
            gpt_response.model_copy(update={
                "recommendations": final_recs,
                "live_status": "offline",
                "request_id": body.request_id,
            }),
            wildcard_ids,
        )))

    # Step 2 — Progressive live enrichment of the ranked pool; live-matched first.
    cards = await live_cards.build(
        gpt_pool, final_count, body.swiggy_address_id, request.headers.get("x-swiggy-user-token"),
    )
    selected, matched_for_response, addr, live_status = cards.selected, cards.matches, cards.address_id, cards.status

    elapsed = round(time.time() - t0, 2)
    logger.info(
        "ai-recommendations: done elapsed=%.2fs pool=%d live=%d status=%s cache_hit=%s",
        elapsed, pool_size, len(matched_for_response), live_status, is_cache_hit,
    )

    return _trace(await _finish(await run_in_threadpool(
        _attach_learning,
        body,
        gpt_response.model_copy(update={
            "recommendations": selected,
            "swiggy_matches": matched_for_response or None,
            "swiggy_address_id": addr,
            "live_status": live_status,
            "request_id": body.request_id,
        }),
        wildcard_ids,
    )))
