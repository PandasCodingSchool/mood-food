"""Live Swiggy cards: map a ranked list of catalog dishes onto real items near the user.

Shared by `/api/ai-recommendations` and game decisions. Enriches the ranked
pool in small waves (count+1 first, then just enough to fill), stops once
`count` dishes have a live match, keeps the ranking order with live-matched
dishes first, and swaps in the Swiggy restaurant, price and photo.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from app.data.dishes import DISHES_BY_ID
from app.lab import trace
from app.schemas.response import Recommendation, Restaurant
from app.schemas.swiggy import EnrichDishInput

logger = logging.getLogger(__name__)


@dataclass
class LiveCards:
    selected: list[Recommendation]
    matches: dict[str, dict] = field(default_factory=dict)   # dish_id -> EnrichedMatch dump (selected only)
    address_id: Optional[str] = None
    status: str = "offline"                                  # live | partial | offline


def enrich_input(rec: Recommendation) -> EnrichDishInput:
    dish = DISHES_BY_ID.get(rec.dish.id)
    return EnrichDishInput(
        id=rec.dish.id,
        name=rec.dish.name,
        cuisine=rec.dish.cuisine,
        aliases=list(dish.swiggy_aliases or []) if dish else [],
        search_category=dish.swiggy_search_category if dish else None,
    )


def inject_live_data(recs: list[Recommendation], live_facts: dict[str, dict]) -> list[Recommendation]:
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


async def build(
    pool: list[Recommendation],
    count: int,
    address_id: Optional[str],
    user_token: Optional[str] = None,
) -> LiveCards:
    """Pick `count` cards from the ranked `pool`, live-matched first."""
    from app.services.swiggy_discovery import SwiggyDiscoveryService
    from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPClient
    from app.services.swiggy_token import load_token

    live_facts: dict[str, dict] = {}
    addr = address_id
    token = user_token or load_token()
    stop = "no address" if not address_id else "no Swiggy token" if not token else "pool exhausted"
    if not token:
        logger.warning(
            "live cards: no Swiggy token available (no x-swiggy-user-token header and "
            "no usable SWIGGY_BOOTSTRAP_TOKEN/stored token) — skipping live enrichment"
        )
    elif address_id and pool:
        service = SwiggyDiscoveryService(client=SwiggyMCPClient(token=token))
        wave_start, wave_size = 0, count + 1  # first wave: one more than needed
        while wave_start < len(pool):
            wave = pool[wave_start: wave_start + wave_size]
            to_enrich = [enrich_input(r) for r in wave if r.dish.id not in live_facts]
            if to_enrich:
                try:
                    addr, matches = await service.enrich(to_enrich, address_id=addr)
                    for m in matches:
                        if m.matched:
                            live_facts[m.dish_id] = m.model_dump()
                    if trace.enabled():
                        trace.emit("live.wave", probed=[d.name for d in to_enrich], results=[{
                            "dish_id": m.dish_id, "matched": m.matched,
                            "item": m.item.name if m.item else None, "price": m.item.price if m.item else None,
                            "image_url": m.item.image_url if m.item else None,
                            "restaurant": m.restaurant.name if m.restaurant else None,
                            "alternatives": len(m.swiggy_alternatives)} for m in matches])
                except SwiggyAuthError as exc:
                    stop = "token rejected"
                    logger.warning(
                        "live cards: Swiggy token REJECTED (%s) — SWIGGY_BOOTSTRAP_TOKEN is likely "
                        "expired (v1 tokens have no refresh; re-auth with `python -m scripts.swiggy_auth "
                        "--save`) or the linked user's token expired. Live enrichment aborted.", exc,
                    )
                    break
                except Exception as exc:  # noqa: BLE001 — offline cards beat no cards
                    logger.warning("live cards: swiggy enrich failed: %s", exc)
                    stop = f"enrich failed: {type(exc).__name__}"
                    break
            if len(live_facts) >= count:
                stop = "enough live matches"
                break  # enough live matches — stop probing
            wave_start += wave_size
            wave_size = max(1, count - len(live_facts) + 1)
        logger.info("live cards: live_matches=%d/%d", len(live_facts), len(pool))

    live = [r for r in pool if r.dish.id in live_facts]
    rest = [r for r in pool if r.dish.id not in live_facts]
    selected = live[:count] if len(live) >= count else live + rest[: count - len(live)]
    selected = [r.model_copy(update={"rank": i + 1}) for i, r in enumerate(inject_live_data(selected, live_facts))]
    matches = {r.dish.id: live_facts[r.dish.id] for r in selected if r.dish.id in live_facts}
    status = "live" if matches and len(matches) == len(selected) else ("partial" if matches else "offline")
    trace.emit("live.result", status=status, stop_reason=stop, pool=[r.dish.name for r in pool],
               live=[r.dish.name for r in live], selected=[r.dish.name for r in selected])
    return LiveCards(selected=selected, matches=matches, address_id=addr, status=status)
