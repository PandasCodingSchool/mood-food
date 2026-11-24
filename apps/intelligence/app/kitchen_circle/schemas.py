"""KitchenCircle planner contract. The API gathers household data; this service decides.

Member preferences arrive here because the planner must honour them, but they are
private: responses explain fit in aggregate ("2 of 3 favourites") and never name
a member or echo a preference back.
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

PreferenceStrength = Literal["cannot_eat", "never_plan", "prefer_less", "favourite"]
SlotState = Literal["blank", "planned", "locked", "leftovers", "no_cook", "household_out"]


class PlannerPreference(BaseModel):
    strength: PreferenceStrength
    # diet | allergen | ingredient | cuisine | dish | protein (others are ignored)
    category: str
    value: str


class PlannerMember(BaseModel):
    user_id: str
    role: Literal["owner", "member", "cook"]
    preferences: list[PlannerPreference] = Field(default_factory=list)


class PlannerRule(BaseModel):
    """Household rule. ``weekday`` is 0 = Monday … 6 = Sunday; ``None`` applies every day.

    Supported ``constraint`` keys: ``diet`` (vegetarian | vegan | eggetarian),
    ``exclude_ingredients`` / ``exclude_cuisines`` (lists), ``cuisine`` (str),
    ``effort`` (list of easy | medium | involved), ``max_total_minutes`` (int), ``cook_unavailable`` (bool:
    favour easy dishes of ≤35 min). ``budget_per_serving_rupees`` is accepted but not scored until recipes carry prices.
    Recurring member absence (category ``absence``) is applied by the API as attendance, not sent here.
    """

    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    strength: Literal["hard", "preference", "contextual"]
    category: str
    constraint: dict[str, Any] = Field(default_factory=dict)


class PlannerAttendance(BaseModel):
    user_id: str
    status: Literal["attending", "absent"]


class PlannerSlot(BaseModel):
    slot_id: str
    planned_for: str  # YYYY-MM-DD
    weekday: int = Field(ge=0, le=6)
    state: SlotState
    servings: int = Field(ge=1)
    recipe_id: Optional[str] = None
    attendance: list[PlannerAttendance] = Field(default_factory=list)


class PlannerRecipe(BaseModel):
    recipe_id: str
    version_id: str
    title: str
    source: Literal["catalog", "household", "ai_draft"]
    default_servings: int = Field(ge=1)
    cuisine: Optional[str] = None
    effort: Optional[str] = None
    freshness_class: Optional[str] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    dietary_tags: list[str] = Field(default_factory=list)
    allergens: list[str] = Field(default_factory=list)
    ingredients: list[str] = Field(default_factory=list)  # canonical names


class PlannerHistory(BaseModel):
    recipe_id: str
    planned_for: str


class PlannerReaction(BaseModel):
    user_id: str
    recipe_id: str
    reaction: Literal["looks_good", "not_for_me"]


class PlannerFeedback(BaseModel):
    """Post-meal check-in for a past day. Shapes future fit; never rewrites what was planned or bought."""

    recipe_id: str
    outcome: Literal["loved", "change", "skipped", "moved"]
    weekday: int = Field(ge=0, le=6)


class AutofillRequest(BaseModel):
    members: list[PlannerMember]
    rules: list[PlannerRule] = Field(default_factory=list)
    slots: list[PlannerSlot]
    recipes: list[PlannerRecipe]
    history: list[PlannerHistory] = Field(default_factory=list)
    reactions: list[PlannerReaction] = Field(default_factory=list)
    feedback: list[PlannerFeedback] = Field(default_factory=list)
    # Slots to propose for; defaults to every blank slot. Locked/filled slots are never proposed.
    target_slot_ids: Optional[list[str]] = None
    # Per-slot recipe ids to avoid (swap / regenerate).
    exclude: dict[str, list[str]] = Field(default_factory=dict)
    seed: int = 0
    alternatives: int = Field(default=3, ge=0, le=10)


class FitBreakdown(BaseModel):
    base: float
    favourites: float
    dislikes: float
    rules: float
    effort: float
    repeat: float
    diversity: float
    overlap: float
    fairness: float
    feedback: float = 0.0
    variety: float


class ProposedRecipe(BaseModel):
    recipe_id: str
    version_id: str
    title: str
    source: str
    score: float
    reasons: list[str]
    breakdown: FitBreakdown


class SlotProposal(BaseModel):
    slot_id: str
    planned_for: str
    servings: int
    pick: ProposedRecipe
    alternatives: list[ProposedRecipe]


class UnfilledSlot(BaseModel):
    slot_id: str
    planned_for: str
    reason: str


class AutofillResponse(BaseModel):
    proposals: list[SlotProposal]
    unfilled: list[UnfilledSlot]
    ignored_rules: list[str] = Field(default_factory=list)
    summary: str
    planner_version: str
