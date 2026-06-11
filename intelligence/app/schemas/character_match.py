from __future__ import annotations
from pydantic import BaseModel


class AnswerItem(BaseModel):
    question: str
    selected: str
    emoji: str = ""


class CharacterMatchRequest(BaseModel):
    answers: list[AnswerItem]


class CharacterMatchResponse(BaseModel):
    character_id: str
    match_percent: int
    spirit_animal: str
    fallback: bool = False
