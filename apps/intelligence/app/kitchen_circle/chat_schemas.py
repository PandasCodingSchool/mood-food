"""KitchenCircle shared-chat contract: a message in, typed planner actions out.

The service only interprets. It never writes household data: the API applies its own
permission and confirmation policy to every action before anything changes.
"""

from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field

from .schemas import PlannerMember

ActionType = Literal[
    "SET_MEAL", "CLEAR_DAY", "SET_DAY_STATUS", "SET_SERVINGS", "SET_ATTENDANCE", "LOCK_SLOT", "UNLOCK_SLOT",
    "CREATE_RECURRING_RULE", "UPDATE_RECURRING_RULE", "REQUEST_AUTOFILL", "CREATE_GROCERY_SNAPSHOT",
    "CREATE_RECIPE",  # AI-written draft recipe for a dish that isn't in the household's recipes
]
DayStatus = Literal["leftovers", "no_cook", "household_out"]


class PlannerAction(BaseModel):
    type: ActionType
    slot_id: Optional[str] = None
    planned_for: Optional[str] = None
    recipe_id: Optional[str] = None
    recipe_version_id: Optional[str] = None
    meal_title: Optional[str] = None
    # CREATE_RECIPE: the dish to write a recipe for (plus an optional day to plan it on once reviewed).
    dish: Optional[str] = Field(default=None, max_length=80)
    # SET_MEAL: the meal this replaces on that day, if any (said back to the household).
    replaces: Optional[str] = None
    state: Optional[DayStatus] = None
    servings: Optional[int] = Field(default=None, ge=1, le=30)
    # SET_ATTENDANCE always targets the sender; members can only set their own attendance.
    status: Optional[Literal["attending", "absent"]] = None
    rule_id: Optional[str] = None
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    strength: Optional[Literal["hard", "preference", "contextual"]] = None
    category: Optional[str] = None
    constraint: Optional[dict[str, Any]] = None
    active: Optional[bool] = None
    scope: Optional[Literal["week", "day"]] = None
    # CREATE_RECURRING_RULE only: true = applies to this plan's week instead of every week.
    this_week_only: Optional[bool] = None
    summary: str = ""


class ChatDay(BaseModel):
    slot_id: str
    planned_for: str
    weekday: int = Field(ge=0, le=6)
    state: str
    meal_title: Optional[str] = None


class ChatRecipe(BaseModel):
    recipe_id: str
    version_id: str
    title: str
    # Optional detail so the agent can reason about a dish (search, fit checks); older callers send titles only.
    source: Optional[str] = None
    default_servings: Optional[int] = None
    cuisine: Optional[str] = None
    effort: Optional[str] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    dietary_tags: list[str] = Field(default_factory=list)
    allergens: list[str] = Field(default_factory=list)
    ingredients: list[str] = Field(default_factory=list)


class ChatRule(BaseModel):
    rule_id: str
    weekday: Optional[int] = None
    strength: str
    category: str
    constraint: dict[str, Any] = Field(default_factory=dict)


class ChatTurn(BaseModel):
    role: Literal["member", "assistant"]
    text: str = Field(max_length=1000)


class PendingQuestion(BaseModel):
    """The assistant's open question to this member, and the message that prompted it."""

    question: str
    original: str


class InterpretRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    today: str  # YYYY-MM-DD in the household timezone
    member_count: int = Field(ge=1)
    days: list[ChatDay]
    recipes: list[ChatRecipe] = Field(default_factory=list)
    rules: list[ChatRule] = Field(default_factory=list)
    # Oldest first. Plain strings are accepted for older callers (treated as member turns).
    recent: list[Union[ChatTurn, str]] = Field(default_factory=list, max_length=10)
    pending: Optional[PendingQuestion] = None
    # Household members with their food limits (ids are opaque; the agent never names anyone's preferences).
    members: list[PlannerMember] = Field(default_factory=list)
    allow_llm: bool = True


class ClarificationOption(BaseModel):
    label: str
    actions: list[PlannerAction]


class Clarification(BaseModel):
    question: str
    options: list[ClarificationOption]


class InterpretResponse(BaseModel):
    actions: list[PlannerAction] = Field(default_factory=list)
    clarification: Optional[Clarification] = None
    reply: str
    source: Literal["rules", "llm", "agent", "none"]
    # Agent only: the tools it called, in order (read and action), for the lab and debugging.
    steps: list[dict[str, Any]] = Field(default_factory=list)


class ReplyOutcome(BaseModel):
    summary: str = Field(max_length=300)
    status: str  # applied | needs_confirmation | needs_clarification | confirmed | rejected | failed | expired
    policy: Optional[str] = None  # e.g. ai_recipe_review → the card's button is "Approve & plan"
    note: Optional[str] = Field(default=None, max_length=600)


class ReplyRequest(BaseModel):
    """What actually happened after the API applied its policy; the assistant says it back in its own words."""

    message: str = Field(max_length=1000)
    outcomes: list[ReplyOutcome] = Field(default_factory=list, max_length=20)
    draft: Optional[str] = Field(default=None, max_length=600)  # the agent's own closing line, if any
    recent: list[ChatTurn] = Field(default_factory=list, max_length=6)
    fallback: str = Field(max_length=1200)


class ReplyResponse(BaseModel):
    reply: str
    source: Literal["llm", "fallback"]
