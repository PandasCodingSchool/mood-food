from __future__ import annotations

import json
from typing import Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from app.config import settings
from app.schemas.character_match import AnswerItem, CharacterMatchResponse

# All 10 characters with enough personality detail for GPT-4o to reason about
_CHARACTERS = [
    {"id": "joey",    "name": "Joey Tribbiani",  "show": "Friends",                "vibe": "Big-hearted, food-obsessed, never shares his plate. Lives in the moment. Pure comfort and indulgence."},
    {"id": "chandler","name": "Chandler Bing",   "show": "Friends",                "vibe": "Sarcastic, anxious, late-night snacker. Uses humour to cope. Low-key, comfort-seeking, avoids adventure."},
    {"id": "michael", "name": "Michael Scott",   "show": "The Office",             "vibe": "Childlike enthusiasm, craves attention and celebration. Loves party food and being the centre of it all."},
    {"id": "ted",     "name": "Ted Mosby",        "show": "HIMYM",                  "vibe": "Romantic, thoughtful, slightly pretentious. Loves a proper sit-down dinner. Classic, premium, intentional."},
    {"id": "barney",  "name": "Barney Stinson",   "show": "HIMYM",                  "vibe": "Legendary ambition, premium everything. High-energy, suit-up mentality. Go big or stay hungry."},
    {"id": "geet",    "name": "Geet",             "show": "Jab We Met",             "vibe": "Bubbly, unstoppable, chaotic good. Street food adventurer with full masala energy. Always on the move."},
    {"id": "munna",   "name": "Munna Bhai",       "show": "Munna Bhai M.B.B.S.",    "vibe": "Warm, big-hearted, home-cooked soul. Values real relationships over glamour. Hearty, desi, no-nonsense."},
    {"id": "rancho",  "name": "Rancho",           "show": "3 Idiots",               "vibe": "Curious, idealistic, quietly health-conscious. Finds joy in simple, wholesome things. Light and mindful."},
    {"id": "kabir",   "name": "Kabir Singh",      "show": "Kabir Singh",            "vibe": "Intense, brooding, no compromise. Fiery flavours only. Solo, raw, maximalist in everything."},
    {"id": "bunny",   "name": "Bunny",            "show": "Yeh Jawaani Hai Deewani","vibe": "Wanderlust foodie, thrill of the new. Global palate, always chasing the next experience. Adventure first."},
]

_VALID_IDS = {c["id"] for c in _CHARACTERS}
_CHAR_BY_ID = {c["id"]: c for c in _CHARACTERS}

_SYSTEM_PROMPT = """\
You are a personality analyst who matches people to their TV/Bollywood spirit animal for the evening.

Given a user's answers to 4 quick vibe questions, pick the character from the list whose energy, \
food personality, and mood BEST mirrors the user's actual answers RIGHT NOW — not their ideal self, \
but who they genuinely ARE in this moment tonight.

Rules:
- Read the answers holistically. "Let's go out" + "Pizza or pasta" + "Buzzing, let's go!" → someone high-energy, social, comfort-indulgent. That's Joey/Michael/Barney territory, NOT Chandler.
- Energy level matters most: low/drained answers → Chandler/Rancho; high/buzzing → Barney/Michael/Joey/Geet/Bunny.
- Social context: solo/couch → Chandler/Rancho/Kabir; party/squad → Michael/Barney/Joey/Geet.
- Food choice: indulgent/comfort → Joey/Michael/Chandler; spicy/street → Geet/Kabir; premium → Barney/Ted; healthy → Rancho; global → Bunny; desi homestyle → Munna.
- The spirit_animal text must feel personal, fun, and read like a horoscope — tell them who they ARE tonight and what that means for their food vibe.

Return ONLY valid JSON, no markdown:
{"character_id": "<id>", "match_percent": <60-99>, "spirit_animal": "<2-3 punchy sentences>"}"""


def _build_prompt(answers: list[AnswerItem]) -> str:
    qa_lines = "\n".join(
        f'  Q: {a.question}\n  A: {a.emoji} {a.selected}'
        for a in answers
    )
    char_lines = "\n".join(
        f'  {c["id"]}: {c["name"]} ({c["show"]}) — {c["vibe"]}'
        for c in _CHARACTERS
    )
    return f"""USER'S ANSWERS TONIGHT:
{qa_lines}

AVAILABLE CHARACTERS:
{char_lines}

Pick the best match and write their spirit animal description."""


_DESCRIBE_PROMPT = """\
You write a short, fun "spirit animal" blurb for a food-personality quiz.

The user's character has ALREADY been chosen — do NOT change it. Given the chosen \
character and the user's 4 answers, write 2-3 punchy sentences (like a horoscope) about \
who they are tonight and what that means for their food vibe. Keep it warm and specific \
to their answers.

Return ONLY valid JSON, no markdown:
{"spirit_animal": "<2-3 punchy sentences>"}"""


def _describe_prompt(character: dict, answers: list[AnswerItem]) -> str:
    qa_lines = "\n".join(f'  Q: {a.question}\n  A: {a.emoji} {a.selected}' for a in answers)
    return (
        f"CHOSEN CHARACTER: {character['name']} ({character['show']}) — {character['vibe']}\n\n"
        f"USER'S ANSWERS TONIGHT:\n{qa_lines}\n\n"
        "Write their spirit animal blurb."
    )


def match_character(
    answers: list[AnswerItem],
    character_id: Optional[str] = None,
    match_percent: Optional[int] = None,
    llm: Optional[ChatOpenAI] = None,
) -> CharacterMatchResponse:
    if llm is None:
        llm = ChatOpenAI(
            model=settings.openai_model,
            temperature=0.6,
            model_kwargs={"response_format": {"type": "json_object"}},
        )

    # Deterministic path: the client already picked the character (unbiased trait
    # match) — the AI only writes the description for it.
    if character_id and character_id.lower().strip() in _VALID_IDS:
        cid = character_id.lower().strip()
        try:
            result = llm.invoke([
                SystemMessage(content=_DESCRIBE_PROMPT),
                HumanMessage(content=_describe_prompt(_CHAR_BY_ID[cid], answers)),
            ])
            spirit = json.loads(result.content).get("spirit_animal", "")
        except Exception as exc:
            raise RuntimeError(f"Character description AI failed: {exc}") from exc
        return CharacterMatchResponse(
            character_id=cid,
            match_percent=max(60, min(99, int(match_percent or 82))),
            spirit_animal=spirit,
            fallback=False,
        )

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=_build_prompt(answers)),
    ]

    try:
        result = llm.invoke(messages)
        data = json.loads(result.content)

        char_id = data.get("character_id", "").lower().strip()
        if char_id not in _VALID_IDS:
            raise ValueError(f"Unknown character_id: {char_id}")

        return CharacterMatchResponse(
            character_id=char_id,
            match_percent=max(60, min(99, int(data.get("match_percent", 78)))),
            spirit_animal=data.get("spirit_animal", ""),
            fallback=False,
        )
    except Exception as exc:
        # Bubble up so the route can fall back to cosine similarity
        raise RuntimeError(f"Character match AI failed: {exc}") from exc
