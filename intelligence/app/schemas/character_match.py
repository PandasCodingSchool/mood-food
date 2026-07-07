from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class AnswerItem(BaseModel):
    question: str
    selected: str
    emoji: str = ""


class CharacterMatchRequest(BaseModel):
    answers: list[AnswerItem]
    # When the client has already chosen the character deterministically (trait
    # match), it passes it here and the AI only writes the spirit-animal blurb.
    character_id: Optional[str] = None
    match_percent: Optional[int] = None


class CharacterMatchResponse(BaseModel):
    character_id: str
    match_percent: int
    spirit_animal: str
    fallback: bool = False
