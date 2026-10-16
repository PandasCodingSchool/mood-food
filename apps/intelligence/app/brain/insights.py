"""Insight cards: short, warm lines about a user's food life, grounded in brain facts.

The LLM only writes language. Each card cites fact ids; a validator rejects a
card that cites unknown facts, uses a number not present in its cited facts,
runs long, or uses shaming language. Template cards from the same facts are
the fallback (and the only path without an OpenAI key).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from typing import Any, Optional

from app.config import settings
from app.lab import trace

logger = logging.getLogger("brain")
MAX_CARDS = 3
MAX_WORDS = 32
BANNED = re.compile(r"\b(fat|weight|calorie|guilt|guilty|junk|unhealthy|lazy|bad habit|cheat|should eat less|overeat)", re.I)
_NUM = re.compile(r"\d+(?:\.\d+)?")


def validate(card: dict, facts_by_id: dict[str, dict]) -> Optional[str]:
    """None if the card is acceptable, else why not."""
    ids = card.get("fact_ids") or []
    if not ids or any(i not in facts_by_id for i in ids):
        return "cites unknown facts"
    text = f"{card.get('title', '')} {card.get('body', '')}"
    if len(str(card.get("body", "")).split()) > MAX_WORDS:
        return "too long"
    if BANNED.search(text):
        return "shaming language"
    allowed = {n for i in ids for n in _NUM.findall(f"{facts_by_id[i]['text']} {facts_by_id[i]['value']}")}
    stray = [n for n in _NUM.findall(text) if n not in allowed]
    return f"unsupported numbers {stray}" if stray else None


def templates(facts: list[dict], house: Optional[dict]) -> list[dict]:
    by_id = {f["id"]: f for f in facts}
    cards = []
    if house and house.get("house_info"):
        info = house["house_info"]
        cards.append({"title": f"{info['crest']} {info['name']}", "body": f"{info['motto']} {info['about']}", "fact_ids": [], "kind": "house"})
    for fid, title in (("food.favourite", "Your go-to"), ("food.top_cuisine", "Your cuisine"), ("food.usual_slot", "Your rhythm"),
                       ("grocery.cooking_index", "Your kitchen"), ("grocery.household.dog", "Your sous-chef")):
        if fid in by_id and len(cards) < MAX_CARDS:
            cards.append({"title": title, "body": by_id[fid]["text"] + ".", "fact_ids": [fid], "kind": "fact"})
    return cards[:MAX_CARDS]


CACHE_KEY = "insights_cache"


def _cache_key(facts: list[dict], house: Optional[dict], relations: list[dict]) -> str:
    basis = {"facts": [f["text"] for f in facts], "house": (house or {}).get("house") if (house or {}).get("status") == "sorted" else None,
             "patterns": [r["text"] for r in relations[:4]]}
    return hashlib.sha1(json.dumps(basis, sort_keys=True).encode()).hexdigest()[:16]


async def generate(facts: list[dict], house: Optional[dict], relations: list[dict], user_id: Optional[str] = None,
                   refresh: bool = False) -> dict[str, Any]:
    """Cards for these facts. With ``user_id`` the result is cached per (facts, house, patterns):
    the LLM runs again only when those change (or ``refresh``)."""
    key = _cache_key(facts, house, relations)
    if user_id and not refresh:
        from app.learning import store

        cached = store.get_usage(user_id, CACHE_KEY, {}) or {}
        if cached.get("key") == key:
            return {**cached["result"], "cached": True}
    result = await _generate(facts, house, relations)
    # Cache LLM cards, and template cards when there is no key (deterministic). A template
    # fallback after an LLM failure is not cached, so the next view retries the LLM.
    if user_id and (result["method"] == "llm" or not settings.openai_api_key):
        from app.learning import store

        store.set_usage(user_id, CACHE_KEY, {"key": key, "result": result})
    return {**result, "cached": False}


async def _generate(facts: list[dict], house: Optional[dict], relations: list[dict]) -> dict[str, Any]:
    fallback = templates(facts, house)
    if not settings.openai_api_key or not facts:
        return {"cards": fallback, "method": "templates", "rejected": []}
    from app.llm import JsonChat

    facts_by_id = {f["id"]: f for f in facts}
    prompt = {
        "facts": [{"id": f["id"], "text": f["text"]} for f in facts],
        "patterns": [r["text"] for r in relations[:4]],
        "house": (house or {}).get("house_info", {}).get("name") if house and house.get("status") == "sorted" else None,
    }
    try:
        llm = JsonChat(model=settings.openai_mini_model, kind="brain_insights", temperature=0.7, max_tokens=400, timeout_s=8.0)
        res = await llm.ainvoke([
            {"role": "system", "content": (
                "You write up to 3 short, warm insight cards about someone's food life for a food app. Use ONLY the given "
                "facts; every card lists the fact ids it relies on. No numbers that aren't in those facts. No judgement "
                f"about health, weight or spending. Each body at most {MAX_WORDS - 4} words, second person. "
                'Reply as JSON: {"cards": [{"title": str, "body": str, "fact_ids": [str]}]}')},
            {"role": "user", "content": json.dumps(prompt)},
        ])
        cards = json.loads(res.content).get("cards", [])
    except Exception as exc:  # noqa: BLE001 — templates are always available
        logger.warning("insights LLM failed: %s", type(exc).__name__)
        return {"cards": fallback, "method": "templates", "rejected": []}
    good, rejected = [], []
    for c in cards[:MAX_CARDS]:
        why = validate(c, facts_by_id)
        (rejected if why else good).append({**c, "kind": "insight", **({"rejected_because": why} if why else {})})
    trace.emit("brain.insights", accepted=len(good), rejected=rejected)
    return {"cards": good or fallback, "method": "llm" if good else "templates", "rejected": rejected}
