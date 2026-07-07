from __future__ import annotations

import hashlib
import json
import logging
from typing import Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.schemas.game_assist import AssistOption, GameAssistRequest, GameAssistResponse

logger = logging.getLogger(__name__)

# The only values the LLM may return for options — it invents the copy, not
# the values, so downstream mapping never breaks.
CRAVING_VOCABULARY = (
    "comfort", "spicy", "sweet", "healthy", "light", "indulgent", "exotic", "quick",
)

_SYSTEM_PROMPTS: dict[str, str] = {
    "craving_options": f"""\
You write playful, personalized craving options for a food-mood game. Given the user's
mood and in-game choices, pick the {{count}} craving values that best fit their state
and write a short personalized label (2-5 words) and optional one-line subtitle for each.

HARD RULE: every "value" MUST be one of: {", ".join(CRAVING_VOCABULARY)}.
Never invent new values. Order options from best fit to least.

Return ONLY valid JSON, no markdown:
{{{{"options": [{{{{"value": "comfort", "label": "...", "emoji": "🍲", "subtitle": "..."}}}}]}}}}""",
    "story_beat_flavor": """\
You write ONE warm, personal sentence that wraps up a user's day-story in a food-mood
game — reference their actual choices, keep it light, no food recommendations yet.

Return ONLY valid JSON, no markdown:
{"flavor_text": "<one sentence>"}""",
    "followup_phrasing": """\
You rewrite follow-up question copy for a food-mood game in the voice of the user's
matched TV/Bollywood character. Keep each line short (under 12 words), fun, and true
to the character. Do not change what is being asked.

Return ONLY valid JSON, no markdown:
{"flavor_text": "<the rephrased question line>"}""",
}

_CACHE: dict[str, GameAssistResponse] = {}


def _cache_key(request: GameAssistRequest) -> str:
    canonical = request.model_dump_json(exclude_none=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _build_user_message(request: GameAssistRequest) -> str:
    lines = [f"game_type={request.game_type or 'unknown'}"]
    for key, value in sorted(request.context.items()):
        lines.append(f"{key}={json.dumps(value, ensure_ascii=False, default=str)}")
    if request.kind == "craving_options":
        lines.append(f"Return exactly {request.count} options.")
    return "\n".join(lines)


def get_assist(
    request: GameAssistRequest,
    llm: Optional[ChatOpenAI] = None,
) -> GameAssistResponse:
    key = _cache_key(request)
    if key in _CACHE:
        return _CACHE[key]

    if llm is None:
        llm = ChatOpenAI(
            model=settings.openai_mini_model,
            temperature=0.8,
            max_tokens=300,
            model_kwargs={"response_format": {"type": "json_object"}},
        )

    system = _SYSTEM_PROMPTS[request.kind].replace("{count}", str(request.count))
    try:
        result = llm.invoke([
            SystemMessage(content=system),
            HumanMessage(content=_build_user_message(request)),
        ])
        data = json.loads(result.content)
    except Exception as exc:
        logger.warning("game-assist LLM failed (%s): %s", request.kind, exc)
        return GameAssistResponse(success=False, error=str(exc))

    options: list[AssistOption] = []
    for raw in data.get("options", []) or []:
        if not isinstance(raw, dict):
            continue
        value = str(raw.get("value", "")).lower().strip()
        if value not in CRAVING_VOCABULARY:
            continue  # filter out-of-vocab values instead of failing
        options.append(AssistOption(
            value=value,
            label=str(raw.get("label", value.title())),
            emoji=raw.get("emoji"),
            subtitle=raw.get("subtitle"),
        ))

    response = GameAssistResponse(
        success=True,
        options=options,
        flavor_text=data.get("flavor_text"),
    )
    _CACHE[key] = response
    return response
