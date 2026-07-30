"""AI "expert recommender" chat over a restaurant's live menu.

Stateless per the house convention (game_assist.py, menu_scout.py): the
client holds and resends the message history each turn, nothing is persisted
server-side. Uses the primary recommender model (gpt-4o, not the mini model)
since this is a reasoning-over-a-menu task the user directly judges, and is
personalized from the same learned profile that powers recommendations
(app/learning/persona.py, mood_map.py, tradeoffs.py) rather than being a
generic food-Q&A bot.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config import settings
from app.schemas.swiggy import MenuChatRequest, MenuChatResponse, SwiggyMenuItem

logger = logging.getLogger("menu_chat")

_MAX_HISTORY_TURNS = 8  # most recent turns kept, to bound prompt size

_SYSTEM_TEMPLATE = """\
You are an expert food recommender chatting with a MoodFood user who is browsing \
the live menu of {restaurant_name}. Help them decide what to order — answer questions, \
compare dishes, suggest combos, and proactively recommend specific items by name when it fits.

{dish_context}
{dietary_constraints}
{personalization}

MENU (id: name (₹price, veg/non-veg) — description) — this is the FULL live menu, not a subset:
{menu_lines}

Rules:
- Only ever reference dishes that appear in the MENU list above by their exact name. Never invent dishes.
- Keep replies conversational and concise (2-4 sentences unless the user asks for a full breakdown).
- When you recommend specific dishes, include their ids in suggested_item_ids so the app can offer a quick-add.
- If nothing on the menu fits what they're asking for, say so honestly rather than forcing a match.
- Dietary constraints and allergies above are hard rules: never suggest a dish that conflicts with them, even if the user doesn't repeat the restriction in their message.

Return ONLY valid JSON, no markdown:
{{"reply": "<your conversational reply>", "suggested_item_ids": ["<menu item id>", ...]}}"""


def _menu_lines(categories: list[dict]) -> str:
    lines: list[str] = []
    for cat in categories:
        items = cat.get("items") or []
        for item in items:
            veg = "veg" if item.is_veg else ("non-veg" if item.is_veg is False else "?")
            desc = f" — {item.description}" if item.description else ""
            price = f"₹{item.price:.0f}" if item.price is not None else "₹?"
            lines.append(f"{item.id}: {item.name} ({price}, {veg}){desc}")
    return "\n".join(lines)


def _dietary_constraints_block(preferences) -> str:
    if not preferences:
        return ""
    parts: list[str] = []
    if preferences.diets:
        parts.append(f"Dietary preference: {', '.join(preferences.diets)}.")
    if preferences.allergies:
        parts.append(f"ALLERGIES — must avoid: {', '.join(preferences.allergies)}.")
    if preferences.cuisines:
        parts.append(f"Favorite cuisines: {', '.join(preferences.cuisines)}.")
    if not parts:
        return ""
    return "User's onboarding preferences: " + " ".join(parts)


def _personalization_block(user_id: Optional[str]) -> str:
    if not user_id:
        return ""
    try:
        from app.learning import mood_map, persona, tradeoffs
    except Exception:  # noqa: BLE001 - learning layer must never break chat
        return ""

    parts: list[str] = []
    try:
        persona_info = persona.get(user_id)
        if persona_info and persona_info.get("archetype"):
            parts.append(f"Their food persona: {persona_info['archetype']}.")
        weights = tradeoffs.get_weights(user_id)
        if weights:
            ranked = sorted(weights.items(), key=lambda kv: kv[1], reverse=True)
            top = ", ".join(f"{k}" for k, _ in ranked[:2])
            if top:
                parts.append(f"They tend to weigh {top} most when choosing food.")
    except Exception:  # noqa: BLE001 - personalization is best-effort context, not required
        logger.warning("menu_chat: personalization lookup failed for user_id=%s", user_id, exc_info=True)
        return ""

    if not parts:
        return ""
    return "What we know about this user: " + " ".join(parts)


def _build_system_prompt(
    request: MenuChatRequest,
    restaurant_name: str,
    categories: list[dict],
) -> str:
    dish_context = ""
    if request.dish_context and request.dish_context.dish_name:
        why = f" — recommended because: {request.dish_context.why}" if request.dish_context.why else ""
        dish_context = f"They arrived here from a recommendation for {request.dish_context.dish_name}{why}."

    return _SYSTEM_TEMPLATE.format(
        restaurant_name=restaurant_name,
        dish_context=dish_context,
        dietary_constraints=_dietary_constraints_block(request.preferences),
        personalization=_personalization_block(request.user_id),
        menu_lines=_menu_lines(categories) or "(menu unavailable)",
    )


def _to_langchain_messages(request: MenuChatRequest, system_prompt: str) -> list:
    messages: list = [SystemMessage(content=system_prompt)]
    for turn in request.messages[-_MAX_HISTORY_TURNS:]:
        if turn.role == "user":
            messages.append(HumanMessage(content=turn.content))
        else:
            messages.append(AIMessage(content=turn.content))
    return messages


def get_menu_chat_reply(
    request: MenuChatRequest,
    restaurant_name: str,
    categories: list[dict],
    llm: Optional[ChatOpenAI] = None,
) -> MenuChatResponse:
    if not request.messages or request.messages[-1].role != "user":
        return MenuChatResponse(success=False, error="Last message must be from the user.")

    if llm is None:
        llm = ChatOpenAI(
            model=settings.openai_model,
            temperature=0.5,
            max_tokens=400,
            model_kwargs={"response_format": {"type": "json_object"}},
        )

    system_prompt = _build_system_prompt(request, restaurant_name, categories)
    valid_ids = {
        item.id
        for cat in categories
        for item in (cat.get("items") or [])
        if isinstance(item, SwiggyMenuItem)
    }

    try:
        result = llm.invoke(_to_langchain_messages(request, system_prompt))
        data = json.loads(result.content)
    except Exception as exc:  # noqa: BLE001 - never break the chat UX on an LLM/parse hiccup
        logger.warning("menu_chat: LLM call failed: %s", exc)
        return MenuChatResponse(
            success=True,
            reply="Sorry, I couldn't pull that up just now — mind trying again?",
            suggested_item_ids=[],
        )

    reply = str(data.get("reply") or "").strip()
    suggested = [
        str(i) for i in (data.get("suggested_item_ids") or [])
        if str(i) in valid_ids
    ]
    if not reply:
        return MenuChatResponse(
            success=True,
            reply="Sorry, I couldn't pull that up just now — mind trying again?",
            suggested_item_ids=[],
        )
    return MenuChatResponse(success=True, reply=reply, suggested_item_ids=suggested)
