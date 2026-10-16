"""Optional LLM polish of the hero card's copy — wording only, never facts.

Runs concurrently with Swiggy matching and is dropped if it isn't back in
time, so it can never delay a response. The template copy (explain.py) is
the source of truth; the model may only rephrase it.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.llm import JsonChat
from app.schemas.response import AiReasoning

logger = logging.getLogger("polish")

_SYSTEM = (
    "You rewrite two short lines of food-recommendation copy so they sound warm and human. "
    "Keep every fact exactly as given. Do not add facts, numbers, ingredients, health claims or "
    "restaurant names. Each line at most 18 words. Return JSON: "
    '{"mood_match": "...", "psychological_hook": "..."}'
)
MAX_WORDS = 22


async def polish(reasoning: AiReasoning, dish_name: str, llm: Optional[JsonChat] = None) -> Optional[AiReasoning]:
    if not settings.polish_hero_copy or not settings.openai_api_key and llm is None:
        return None
    llm = llm or JsonChat(model=settings.openai_mini_model, kind="polish", temperature=0.6, max_tokens=160)
    user = json.dumps({"dish": dish_name, "mood_match": reasoning.mood_match, "psychological_hook": reasoning.psychological_hook})
    try:
        result = await asyncio.wait_for(
            llm.ainvoke([SystemMessage(content=_SYSTEM), HumanMessage(content=user)]),
            timeout=settings.polish_timeout_s,
        )
        data = json.loads(result.content)
    except Exception as exc:  # noqa: BLE001 — templates stand on their own
        logger.info("polish skipped: %s", exc)
        return None
    lines = {k: str(data.get(k) or "").strip() for k in ("mood_match", "psychological_hook")}
    if not all(lines.values()) or any(len(v.split()) > MAX_WORDS for v in lines.values()):
        return None
    return reasoning.model_copy(update=lines)
