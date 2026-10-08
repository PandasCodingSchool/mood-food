"""Intelligence Lab API: the real endpoints' code paths, returned with their decision trace.

Dev-only (mounted when LAB_ENABLED=true and ENVIRONMENT != production). Every
endpoint wraps the same function the product calls in ``trace.collect()`` and
returns ``{"result": ..., "trace": [...events]}`` so the lab UI can show what
happened under the hood. Nothing here changes product behaviour.
"""

from __future__ import annotations

import time
from contextlib import ExitStack
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.data.dishes import DISHES, DISHES_BY_ID
from app.lab import trace
from app.schemas.request import RecommendationRequest
from app.routes.games import AnswerRequest, StartRequest

router = APIRouter(prefix="/api/lab", tags=["lab"])


def lab_available() -> bool:
    return settings.lab_enabled and settings.environment.lower() != "production"


def _jev_switch(jev_on: bool) -> ExitStack:
    """`?jev=false` runs the request with JEV switched off (compare JEV on/off)."""
    from app.decisions import jev

    stack = ExitStack()
    if not jev_on:
        stack.enter_context(jev.switched_off())
    return stack


def _traced(result: Any, events: list[dict[str, Any]], started: float) -> dict[str, Any]:
    return {"result": result, "trace": list(events), "elapsed_ms": round((time.perf_counter() - started) * 1000, 1)}


# --- health ------------------------------------------------------------------

@router.get("/health")
async def health() -> dict:
    from app.decisions import jev
    from app.learning import store
    from app.services.swiggy_token import token_status

    client = jev.get_client()
    breaker = client.breaker if client else None
    return {
        "environment": settings.environment,
        "jev": {"configured": bool(settings.jev_api_key), "model": settings.jev_model, "ranker_provider": settings.ranker_provider,
                "jev_weight": settings.jev_weight, "scout_provider": settings.scout_provider,
                "breaker_open": bool(breaker and not breaker.allow()), "breaker_failures": breaker.failures if breaker else 0},
        "openai": {"configured": bool(settings.openai_api_key), "model": settings.openai_model,
                   "polish_hero_copy": settings.polish_hero_copy},
        "swiggy": token_status(),
        "store": {"backend": store.backend_name()},
        "catalog": {"dishes": len(DISHES)},
    }


# --- games -------------------------------------------------------------------

@router.post("/games/session")
async def game_start(body: StartRequest) -> dict:
    from app.games import sessions

    t0 = time.perf_counter()
    with trace.collect() as events:
        try:
            result = await run_in_threadpool(sessions.start, body.game, body.user_context, body.user_id, body.count,
                                             body.max_steps, body.swiggy_address_id)
        except sessions.GameError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _traced(result, events, t0)


@router.post("/games/session/{session_id}/answer")
async def game_answer(session_id: str, body: AnswerRequest, request: Request, jev: bool = True) -> dict:
    from app.games import sessions

    t0 = time.perf_counter()
    with trace.collect() as events, _jev_switch(jev):
        try:
            result = await sessions.answer(session_id, body.answer, body.reaction_ms, request.headers.get("x-swiggy-user-token"))
        except sessions.GameError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _traced(result, events, t0)


# --- recommendations ---------------------------------------------------------------

@router.post("/recommend")
async def recommend(body: RecommendationRequest, request: Request, jev: bool = True) -> dict:
    from app.routes.recommendations import _run_pipeline

    t0 = time.perf_counter()
    with trace.collect() as events, _jev_switch(jev):
        result = await _run_pipeline(body, request)
    return _traced(result.model_dump(mode="json"), events, t0)


# --- food graph ------------------------------------------------------------------

class MapItemsRequest(BaseModel):
    items: list[str] = Field(min_length=1, max_length=40)
    is_veg: Optional[bool] = None


@router.post("/map-items")
async def map_items(body: MapItemsRequest) -> dict:
    from app.food_graph import mapping

    t0 = time.perf_counter()
    with trace.collect() as events:
        out = await mapping.map_items([(name, body.is_veg) for name in body.items])
    result = [{"item": m.item_name, "dish_id": m.dish_id, "dish": DISHES_BY_ID[m.dish_id].name if m.dish_id in DISHES_BY_ID else None,
               "confidence": m.confidence, "method": m.method} for m in out.values()]
    return _traced(result, events, t0)


# --- JEV playground ------------------------------------------------------------------

class JevRequest(BaseModel):
    state: Any
    questions: dict[str, dict[str, Any]] = Field(min_length=1)
    timeout_s: Optional[float] = Field(default=None, gt=0, le=10)


@router.post("/jev")
async def jev_playground(body: JevRequest) -> dict:
    from typesafe_sdk import Choice, Noul, Score

    from app.decisions import jev

    kinds = {"noul": Noul, "choice": Choice, "score": Score}
    try:
        questions = {k: kinds[q.get("type", "noul")].model_validate(q) for k, q in body.questions.items()}
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"bad question: {exc}") from exc
    client = jev.get_client()
    if client is None:
        raise HTTPException(status_code=503, detail="JEV_API_KEY not configured")
    t0 = time.perf_counter()
    with trace.collect() as events:
        decision = await client.decide("lab_playground", body.state, questions, timeout_s=body.timeout_s)
    result = None if decision is None else {
        "model": decision.model, "latency_ms": decision.latency_ms, "input_tokens": decision.input_tokens,
        "nouls": decision.nouls,
        "choices": {k: {"choice": c, "probabilities": p, "confidence": conf} for k, (c, p, conf) in decision.choices.items()},
        "scores": {k: {"score": sc, "probabilities": p, "confidence": conf} for k, (sc, p, conf) in decision.scores.items()},
    }
    return _traced(result, events, t0)


# --- catalog ----------------------------------------------------------------------

def _dish_view(d: Any, full: bool = False) -> dict[str, Any]:
    out = {"id": d.id, "name": d.name, "cuisine": d.cuisine, "category": d.category, "price": d.price_inr,
           "veg": "non_veg" not in d.dietary_tags, "image_url": d.image_url or None}
    if full:
        out.update({k: getattr(d, k) for k in (
            "mood_tags", "dietary_tags", "allergens", "spice_level", "meal_time", "weather_tags", "social_context_tags",
            "delivery_friendly", "adventurousness_score", "health_score", "calories", "prep_time_min", "tier",
            "swiggy_aliases", "swiggy_search_category", "sensory", "protein", "cooking_method", "region")})
    return out


@router.get("/catalog")
async def catalog(q: str = "", limit: int = 50, full: bool = False) -> dict:
    needle = q.strip().lower()
    hits = [d for d in DISHES if not needle or needle in d.name.lower() or needle in d.cuisine.lower()]
    return {"total": len(hits), "dishes": [_dish_view(d, full=full) for d in hits[: max(1, min(limit, 1000))]]}


@router.get("/food-graph/summary")
async def food_graph_summary() -> dict:
    """What the food graph holds: catalog coverage and what the Swiggy mapping cache has learned."""
    from collections import Counter

    from app.learning import store

    def counts(values) -> dict[str, int]:
        return dict(Counter(v or "(none)" for v in values).most_common())

    def cache() -> dict:
        rows = store.fetchall("SELECT item_name, dish_id, confidence, method, updated_at FROM menu_item_map ORDER BY updated_at DESC")
        recent = [{"item": r["item_name"], "dish_id": r["dish_id"],
                   "dish": DISHES_BY_ID[r["dish_id"]].name if r["dish_id"] in DISHES_BY_ID else None,
                   "confidence": float(r["confidence"]), "method": r["method"], "updated_at": str(r["updated_at"])} for r in rows[:200]]
        return {"items": len(rows), "mapped": sum(1 for r in rows if r["dish_id"]), "by_method": counts(r["method"] for r in rows),
                "dishes_covered": len({r["dish_id"] for r in rows if r["dish_id"]}), "recent": recent}

    return {
        "dishes": len(DISHES),
        "coverage": {"sensory_profile": sum(bool(d.sensory) for d in DISHES), "swiggy_aliases": sum(bool(d.swiggy_aliases) for d in DISHES),
                     "image": sum(bool(d.image_url) for d in DISHES), "protein": sum(bool(d.protein) for d in DISHES),
                     "cooking_method": sum(bool(d.cooking_method) for d in DISHES), "region": sum(bool(d.region) for d in DISHES)},
        "by": {"cuisine": counts(d.cuisine for d in DISHES), "protein": counts(d.protein for d in DISHES),
               "cooking_method": counts(d.cooking_method for d in DISHES),
               "diet": counts("non-veg" if "non_veg" in d.dietary_tags else "veg" for d in DISHES),
               "meal": dict(Counter(m for d in DISHES for m in d.meal_time).most_common())},
        "mapping_cache": await run_in_threadpool(cache),
    }


@router.get("/catalog/{dish_id}")
async def catalog_dish(dish_id: str) -> dict:
    d = DISHES_BY_ID.get(dish_id)
    if d is None:
        raise HTTPException(status_code=404, detail="unknown dish")
    return _dish_view(d, full=True)


# --- evals ------------------------------------------------------------------------

@router.post("/evals")
async def evals() -> dict:
    def run() -> dict:
        from evals import harness

        harness.warm_up()
        named = [harness.evaluate(s) for s in harness.named_scenarios()]
        grid = [harness.evaluate(s) for s in harness.grid_scenarios()]
        fits = [f for f in (harness.mood_fit(r) for r in grid) if f is not None]
        ms = sorted(r.ms for r in grid)
        return {
            "named": len(named), "grid": len(grid),
            "failures": [{"scenario": r.scenario.name, "failures": r.failures} for r in named + grid if r.failures],
            "mean_mood_fit_top5": round(sum(fits) / len(fits), 3) if fits else None,
            "p95_shortlist_ms": round(ms[int(len(ms) * 0.95)], 1) if ms else None,
            "named_results": [{"scenario": r.scenario.name, "top": [d.name for d in r.pool[:6]], "pool": len(r.pool),
                               "ms": round(r.ms, 1), "failures": r.failures} for r in named],
        }

    t0 = time.perf_counter()
    result = await run_in_threadpool(run)
    from evals import backtest

    result["backtest"] = await run_in_threadpool(backtest.run)
    return {"result": result, "trace": [], "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1)}


# --- Swiggy (read-only) -------------------------------------------------------------

@router.get("/swiggy/addresses")
async def swiggy_addresses() -> dict:
    """Saved addresses on the service's Swiggy account (id, label, line — no phone numbers)."""
    from app.services.swiggy_discovery import SwiggyDiscoveryService
    from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPError, read_only

    t0 = time.perf_counter()
    with trace.collect() as events:
        try:
            addresses = await SwiggyDiscoveryService().list_addresses()
        except SwiggyAuthError as exc:
            raise HTTPException(status_code=401, detail=f"Swiggy token missing or rejected: {exc}") from exc
        except SwiggyMCPError as exc:
            raise HTTPException(status_code=502, detail=f"Swiggy error: {exc}") from exc
    return _traced({"addresses": addresses, "read_only": read_only()}, events, t0)


# --- order history (read-only) -------------------------------------------------------

class LabHistoryRequest(BaseModel):
    known_order_ids: list[str] = Field(default_factory=list)


@router.post("/history/import")
async def lab_history_import(body: LabHistoryRequest) -> dict:
    """The service token's recent Swiggy orders: parsed, mapped and profiled (nothing is stored per user here)."""
    from app.history.ingest import import_orders
    from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPClient

    t0 = time.perf_counter()
    with trace.collect() as events:
        try:
            result = await import_orders(SwiggyMCPClient(), frozenset(body.known_order_ids))
        except SwiggyAuthError as exc:
            raise HTTPException(status_code=401, detail=f"Swiggy token missing or rejected: {exc}") from exc
    return _traced({"stats": result.stats(), "orders": [o.to_dict() for o in result.orders]}, events, t0)


@router.post("/history/groceries")
async def lab_groceries_import() -> dict:
    """The service token's Instamart orders + go-to items, profiled, with grocery facts (nothing stored per user)."""
    from dataclasses import asdict

    from app.history.grocery import import_groceries
    from app.history.grocery_facts import compute
    from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPClient

    t0 = time.perf_counter()
    with trace.collect() as events:
        try:
            result = await import_groceries(SwiggyMCPClient(mcp_url=settings.swiggy_instamart_mcp_url))
        except SwiggyAuthError as exc:
            raise HTTPException(status_code=401, detail=f"Swiggy token missing or rejected: {exc}") from exc
        orders = [o.to_dict() for o in result.orders]
        go_to = [asdict(i) for i in result.go_to]
        facts = compute(orders, go_to)
    return _traced({"stats": result.stats(), "orders": orders, "go_to": go_to, "facts": facts}, events, t0)


# --- brain --------------------------------------------------------------------------

class LabBrainRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=100)
    slot: Optional[str] = None
    daytype: Optional[str] = None


@router.post("/brain/build")
async def lab_brain_build(body: LabBrainRequest) -> dict:
    """Import the service token's food + grocery history and fold it into ``user_id`` the way the API does."""
    from dataclasses import asdict

    from app.brain import summary
    from app.history.grocery import import_groceries
    from app.history.ingest import import_orders
    from app.history.signals import food_signals, grocery_signals
    from app.learning import learner
    from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPClient

    t0 = time.perf_counter()
    with trace.collect() as events:
        try:
            food = await import_orders(SwiggyMCPClient())
            groc = await import_groceries(SwiggyMCPClient(mcp_url=settings.swiggy_instamart_mcp_url))
        except SwiggyAuthError as exc:
            raise HTTPException(status_code=401, detail=f"Swiggy token missing or rejected: {exc}") from exc
        sigs = food_signals([o.to_dict() for o in food.orders]) + grocery_signals([o.to_dict() for o in groc.orders],
                                                                                   [asdict(i) for i in groc.go_to])

        def fold() -> dict:
            for sgl in sigs:
                learner.apply_signal(body.user_id, sgl)
            return summary.build(body.user_id, body.slot, body.daytype)

        data = await run_in_threadpool(fold)
    return _traced({**data, "imported": {"food": food.stats(), "groceries": groc.stats(), "signals": len(sigs)}}, events, t0)


@router.post("/brain")
async def lab_brain(body: LabBrainRequest) -> dict:
    """The brain for ``user_id`` as it stands (optionally for another slot / daytype)."""
    from app.brain import summary

    t0 = time.perf_counter()
    data = await run_in_threadpool(summary.build, body.user_id, body.slot, body.daytype)
    return {"result": data, "trace": [], "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1)}
