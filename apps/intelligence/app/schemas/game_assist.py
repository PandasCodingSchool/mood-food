from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

AssistKind = Literal["craving_options", "story_beat_flavor", "followup_phrasing"]


class GameAssistRequest(BaseModel):
    kind: AssistKind
    game_type: Optional[str] = None
    # Free-form context: mood, mood_vector, liked, disliked, story_choices,
    # character, time_slot… — the service prompt-injects what it recognises.
    context: dict = Field(default_factory=dict)
    count: int = Field(default=4, ge=1, le=6)

    model_config = {"extra": "ignore"}


class AssistOption(BaseModel):
    value: str  # canonical craving value — never invented by the LLM
    label: str
    emoji: Optional[str] = None
    subtitle: Optional[str] = None


class GameAssistResponse(BaseModel):
    success: bool
    options: list[AssistOption] = Field(default_factory=list)
    flavor_text: Optional[str] = None
    error: Optional[str] = None
