"""Semantic scout for ambiguous Swiggy menu candidates.

One batched call per enrich request for at most MAX_PAIRS borderline
dish/item pairs: JEV first (one "same dish?" Noul per pair, accepted at
JEV_SCOUT_THRESHOLD), GPT as fallback judge. Does NOT override deterministic
hard conflicts — protein and form mismatches are excluded by
match_confidence() before pairs reach here.

Returns ``None`` when no judge could answer, so callers can tell "rejected"
apart from "couldn't check" and keep their previous behaviour.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.lab import trace
from app.llm import JsonChat

logger = logging.getLogger("menu_scout")

MAX_PAIRS = 12
_TIMEOUT_S = 3.0
_MIN_CONFIDENCE = 0.75
# A false accept means the user orders a dish that isn't what we showed.
JEV_SCOUT_THRESHOLD = 0.9

_SYSTEM_PROMPT = """\
You are a strict semantic food-menu compatibility judge.

For each pair below, decide whether the candidate menu item is the same dish \
or a genuine close variant of the target dish.

ALWAYS REJECT if ANY of these apply:
- Protein / key-ingredient mismatch (mutton vs rajmah, chicken vs paneer, fish vs egg, etc.)
- Veg / non-veg mismatch
- Dish-form mismatch: roll, wrap, soup, salad, sandwich, burger vs curry, masala, rice, biryani, etc.
- Items sharing only generic words (curry, masala, special, style, chef, house, spicy, fried) \
with no shared dish identity

Return ONLY a valid JSON object. Keys must be "dish_id:item_id". \
Each value: {"compatible": bool, "confidence": 0.0-1.0, "reason": "<short string>"}.
Example: {"d1:i9": {"compatible": true, "confidence": 0.82, "reason": "same dish minor name variation"}}
No markdown fences. No extra text."""


@dataclass
class ScoutDishInput:
    dish_id: str
    dish_name: str
    aliases: list[str] = field(default_factory=list)
    cuisine: Optional[str] = None


@dataclass
class ScoutCandidateInput:
    item_id: str
    item_name: str
    description: Optional[str] = None
    is_veg: Optional[bool] = None
    price: Optional[float] = None
    restaurant_name: Optional[str] = None


@dataclass
class ScoutDecision:
    compatible: bool
    confidence: float
    reason: str


def _build_prompt(pairs: list[tuple[ScoutDishInput, ScoutCandidateInput]]) -> str:
    lines: list[str] = []
    for dish, cand in pairs:
        aliases = f"; aliases: {', '.join(dish.aliases)}" if dish.aliases else ""
        cuisine = f"; cuisine: {dish.cuisine}" if dish.cuisine else ""
        veg_str = {True: "veg", False: "non-veg"}.get(cand.is_veg, "unknown")  # type: ignore[arg-type]
        desc = f"; desc: {cand.description[:100]}" if cand.description else ""
        price = f"; \u20b9{cand.price:.0f}" if cand.price is not None else ""
        rest = f"; restaurant: {cand.restaurant_name}" if cand.restaurant_name else ""
        lines.append(
            f"TARGET: id={dish.dish_id!r} name={dish.dish_name!r}{aliases}{cuisine}\n"
            f"CANDIDATE: id={cand.item_id!r} name={cand.item_name!r} veg={veg_str}{price}{rest}{desc}"
        )
    return "\n\n".join(lines)


async def scout_ambiguous_matches(
    pairs: list[tuple[ScoutDishInput, ScoutCandidateInput]],
) -> Optional[dict[tuple[str, str], ScoutDecision]]:
    """Accepted pairs only; ``None`` when neither JEV nor GPT could judge."""
    if not pairs:
        return {}
    pairs = pairs[:MAX_PAIRS]
    if settings.scout_provider == "jev":
        decided = await _scout_jev(pairs)
        if decided is not None:
            return decided
    return await _scout_gpt(pairs)


def _jev_state(pairs: list[tuple[ScoutDishInput, ScoutCandidateInput]]) -> dict:
    veg = {True: "vegetarian", False: "non-vegetarian"}
    return {
        f"p{i + 1}": {
            "target_dish": {"name": d.dish_name, "also_known_as": d.aliases or None, "cuisine": d.cuisine},
            "menu_item": {
                "name": c.item_name,
                "description": (c.description or "")[:160] or None,
                "diet": veg.get(c.is_veg) if c.is_veg is not None else None,
                "restaurant": c.restaurant_name,
            },
        }
        for i, (d, c) in enumerate(pairs)
    }


async def _scout_jev(
    pairs: list[tuple[ScoutDishInput, ScoutCandidateInput]],
) -> Optional[dict[tuple[str, str], ScoutDecision]]:
    from typesafe_sdk import Noul

    from app.decisions import jev

    client = jev.get_client()
    if client is None:
        return None
    questions = {
        f"p{i + 1}": Noul(
            instructions=(
                f"Is `p{i + 1}.menu_item` the same dish as `p{i + 1}.target_dish`, "
                "or a close variant someone ordering the target would happily accept?"
            ),
            criteria={
                "true": "Same dish or a genuine close variant (naming/portion/style difference only).",
                "false": "A different dish, a different main protein, or veg vs non-veg mismatch.",
            },
        )
        for i in range(len(pairs))
    }
    decision = await client.decide("menu_scout", _jev_state(pairs), questions, timeout_s=_TIMEOUT_S)
    if decision is None:
        return None
    accepted: dict[tuple[str, str], ScoutDecision] = {}
    for i, (d, c) in enumerate(pairs):
        p = decision.nouls.get(f"p{i + 1}")
        if p is not None and p >= JEV_SCOUT_THRESHOLD:
            accepted[(d.dish_id, c.item_id)] = ScoutDecision(compatible=True, confidence=p, reason=f"jev:{p:.2f}")
        trace.emit("scout.verdict", judge="jev", target=d.dish_name, item=c.item_name, restaurant=c.restaurant_name,
                   probability=p, threshold=JEV_SCOUT_THRESHOLD, accepted=(d.dish_id, c.item_id) in accepted)
    logger.info("menu_scout(jev): accepted %d/%d pair(s) in %.0f ms", len(accepted), len(pairs), decision.latency_ms)
    return accepted


async def _scout_gpt(
    pairs: list[tuple[ScoutDishInput, ScoutCandidateInput]],
) -> Optional[dict[tuple[str, str], ScoutDecision]]:
    """ONE LLM call; only compatible pairs at >= _MIN_CONFIDENCE. None on failure."""
    pairs = pairs[:MAX_PAIRS]
    t0 = time.monotonic()
    logger.info("menu_scout: evaluating %d candidate pair(s)", len(pairs))

    llm = JsonChat(model=settings.openai_mini_model, kind="menu_scout", temperature=0)
    prompt = _build_prompt(pairs)

    try:
        async with asyncio.timeout(_TIMEOUT_S):
            result = await llm.ainvoke([
                SystemMessage(content=_SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ])
        parsed = json.loads(result.content)
    except TimeoutError:
        logger.warning("menu_scout: timed out after %.1fs — skipping", _TIMEOUT_S)
        return None
    except Exception as exc:
        logger.warning("menu_scout: error (%s) — skipping", exc)
        return None

    elapsed = time.monotonic() - t0
    accepted: dict[tuple[str, str], ScoutDecision] = {}

    for dish, cand in pairs:
        key_str = f"{dish.dish_id}:{cand.item_id}"
        entry = parsed.get(key_str)
        if not isinstance(entry, dict):
            continue
        compatible = entry.get("compatible")
        confidence = entry.get("confidence")
        reason = str(entry.get("reason", ""))
        if not isinstance(compatible, bool) or not isinstance(confidence, (int, float)):
            continue
        if compatible and float(confidence) >= _MIN_CONFIDENCE:
            accepted[(dish.dish_id, cand.item_id)] = ScoutDecision(
                compatible=True, confidence=float(confidence), reason=reason
            )
        trace.emit("scout.verdict", judge="gpt", target=dish.dish_name, item=cand.item_name,
                   restaurant=cand.restaurant_name, probability=float(confidence), compatible=compatible,
                   threshold=_MIN_CONFIDENCE, reason=reason, accepted=(dish.dish_id, cand.item_id) in accepted)

    logger.info(
        "menu_scout: accepted %d/%d pair(s) in %.2fs",
        len(accepted), len(pairs), elapsed,
    )
    return accepted
