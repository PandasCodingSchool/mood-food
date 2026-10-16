"""Story personalisation: the v1 beat, rewritten around the user's own habits.

The LLM only rephrases the scene (<= MAX_WORDS) using the brain's habit lines —
the choices keep their meaning, so the engine's maths is unchanged. A rewrite
that adds numbers not in the facts, runs long or uses shaming language is
rejected for the base text. Rewrites are cached by (base text, habits); while
the user reads a beat, the next beat's variants (one per choice) are drafted in
the background so the next screen needs no wait.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from collections import OrderedDict
from typing import Any, Optional

from app.config import settings
from app.lab import trace

logger = logging.getLogger("games")
MAX_WORDS = 40
TIMEOUT_S = 1.5
_CACHE: "OrderedDict[str, str]" = OrderedDict()
_CACHE_MAX = 1024
_PENDING: set = set()
_BANNED = re.compile(r"\b(fat|weight|calorie|guilt|junk|unhealthy|lazy|diet)\b", re.I)
_NUM = re.compile(r"\d+")


def _key(base: str, habits: list[str]) -> str:
    return hashlib.sha1(json.dumps([base, habits]).encode()).hexdigest()[:20]


def _valid(text: str, base: str, habits: list[str]) -> bool:
    if not text or len(text.split()) > MAX_WORDS or _BANNED.search(text):
        return False
    allowed = set(_NUM.findall(base + " " + " ".join(habits)))
    return all(n in allowed for n in _NUM.findall(text))


async def _rewrite(base: str, habits: list[str]) -> Optional[str]:
    from app.llm import JsonChat

    llm = JsonChat(model=settings.openai_mini_model, kind="story_personalise", temperature=0.8, max_tokens=120, timeout_s=TIMEOUT_S)
    res = await llm.ainvoke([
        {"role": "system", "content": (
            "Rewrite one scene of a short interactive story about the reader's day so it feels personal, using what we "
            f"know about their food habits. Second person, warm, at most {MAX_WORDS - 5} words. Keep the same situation and "
            "time of day; don't add choices, numbers or food judgements. Reply as JSON: {\"text\": str}")},
        {"role": "user", "content": json.dumps({"scene": base, "their_habits": habits[:5]})},
    ])
    return str(json.loads(res.content).get("text", "")).strip() or None


async def personalised(base: str, habits: list[str]) -> Optional[str]:
    """Cached rewrite of ``base`` for these habits, or None (no key, no habits, failure or invalid)."""
    if not settings.openai_api_key or not habits:
        return None
    k = _key(base, habits)
    if k in _CACHE:
        _CACHE.move_to_end(k)
        return _CACHE[k]
    try:
        text = await asyncio.wait_for(_rewrite(base, habits), timeout=TIMEOUT_S)
    except Exception as exc:  # noqa: BLE001 — the base text is always fine
        logger.info("story personalise failed: %s", type(exc).__name__)
        return None
    if text is None or not _valid(text, base, habits):
        trace.emit("story.personalise", accepted=False, base=base, text=text)
        return None
    _CACHE[k] = text
    while len(_CACHE) > _CACHE_MAX:
        _CACHE.popitem(last=False)
    return text


def _prefetch(bases: list[str], habits: list[str]) -> None:
    for base in bases:
        k = _key(base, habits)
        if k in _CACHE or k in _PENDING:
            continue
        _PENDING.add(k)
        task = asyncio.create_task(personalised(base, habits))
        task.add_done_callback(lambda _t, k=k: _PENDING.discard(k))


async def enrich(question: dict[str, Any], habits: list[str], next_bases: Optional[list[str]] = None) -> dict[str, Any]:
    """The question with its scene personalised (when possible); warms the next beat's variants."""
    if question.get("kind") != "choice" or not question.get("base_prompt"):
        return question
    if next_bases and settings.openai_api_key and habits:
        _prefetch(next_bases, habits)
    text = await personalised(question["base_prompt"], habits)
    trace.emit("story.personalise", accepted=bool(text), base=question["base_prompt"], text=text, habits=habits[:5])
    return {**question, "prompt": text, "personalised": True} if text else question
