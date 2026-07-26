"""Lightweight semantic scout for ambiguous Swiggy menu candidates.

Makes ONE batched LLM call per enrich request for at most MAX_PAIRS ambiguous
dish/item pairs. Does NOT override deterministic hard conflicts — protein and
form mismatches already excluded by match_confidence() before pairs reach here.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config import settings

logger = logging.getLogger("menu_scout")

MAX_PAIRS = 12
_TIMEOUT_S = 3.0
_MIN_CONFIDENCE = 0.75

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
) -> dict[tuple[str, str], ScoutDecision]:
    """Make ONE LLM call to evaluate at most MAX_PAIRS ambiguous dish/item pairs.

    Returns only accepted decisions (compatible=True and confidence >= _MIN_CONFIDENCE).
    On timeout, error, or malformed output: returns {} and logs a warning.
    """
    if not pairs:
        return {}

    pairs = pairs[:MAX_PAIRS]
    t0 = time.monotonic()
    logger.info("menu_scout: evaluating %d candidate pair(s)", len(pairs))

    llm = ChatOpenAI(
        model=settings.openai_mini_model,
        temperature=0,
        model_kwargs={"response_format": {"type": "json_object"}},
    )
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
        return {}
    except Exception as exc:
        logger.warning("menu_scout: error (%s) — skipping", exc)
        return {}

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

    logger.info(
        "menu_scout: accepted %d/%d pair(s) in %.2fs",
        len(accepted), len(pairs), elapsed,
    )
    return accepted
