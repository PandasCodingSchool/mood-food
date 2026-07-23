from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


class Mood(BaseModel):
    primary: str  # e.g. "stressed", "happy", "sad", "anxious", "celebratory", "romantic", "comfort"
    energy_level: int = Field(default=5, ge=1, le=10)
    social_context: Optional[Literal["solo", "date", "friends", "family"]] = None
    # From the mood check-in (1.1) / hunger dial (1.2).
    hunger_level: Optional[int] = Field(default=None, ge=1, le=10)
    stress_level: Optional[int] = Field(default=None, ge=1, le=10)


class Budget(BaseModel):
    min: Optional[float] = None
    max: float
    currency: str = "INR"


class Situational(BaseModel):
    time_of_day: Optional[Literal["breakfast", "lunch", "dinner", "late_night"]] = None
    day_of_week: Optional[str] = None
    weather: Optional[Literal["rainy", "cold", "hot", "sunny", "any"]] = None
    budget: Optional[Budget] = None
    time_available: Optional[int] = None  # minutes
    delivery_preferred: bool = False
    # Budget-vibe framing (3.3): people spend by occasion, not hunger.
    occasion: Optional[Literal["treat", "fuel", "reward"]] = None
    # Server-derived from the signals log (3.2 / 1.2).
    hours_since_last_meal: Optional[float] = None


class Preferences(BaseModel):
    cuisine_types: list[str] = Field(default_factory=list)
    dietary_restrictions: list[str] = Field(default_factory=list)  # vegetarian, vegan, gluten_free, dairy_free
    allergies: list[str] = Field(default_factory=list)  # nuts, dairy, gluten, shellfish, eggs
    spice_tolerance: Optional[Literal["mild", "medium", "hot", "very_hot"]] = None


class SwipeItem(BaseModel):
    item: str
    liked: bool
    reaction_time: Optional[int] = None  # milliseconds; faster = stronger subconscious preference


class SliderValues(BaseModel):
    adventurous: Optional[int] = Field(default=None, ge=1, le=10)
    health_conscious: Optional[int] = Field(default=None, ge=1, le=10)
    spicy: Optional[int] = Field(default=None, ge=1, le=10)


class MoodVector(BaseModel):
    energy: float = Field(default=0, ge=-1, le=1)
    valence: float = Field(default=0, ge=-1, le=1)
    social: float = Field(default=0, ge=-1, le=1)


class GameCharacter(BaseModel):
    id: str
    name: str
    show: Optional[str] = None
    emoji: Optional[str] = None
    traits: Optional[dict] = None
    match_percentage: Optional[int] = None
    runner_ups: list[dict] = Field(default_factory=list)  # [{id, match_percent}]

    model_config = {"extra": "ignore"}


# Kept as an alias so existing imports keep working.
CharacterContext = GameCharacter


class GameData(BaseModel):
    """Unified game-signal payload emitted by every frontend game."""

    type: Optional[str] = None
    liked: list[str] = Field(default_factory=list)  # accepted segments, right-swipes, chosen options
    disliked: list[str] = Field(default_factory=list)  # rejected segments, left-swipes
    cravings: list[str] = Field(default_factory=list)  # ordered, strongest first
    cuisines: list[str] = Field(default_factory=list)
    budget_tier: Optional[Literal["budget", "moderate", "splurge"]] = None
    diet_preference: Optional[Literal["veg", "non-veg", "both"]] = None
    mood_vector: Optional[MoodVector] = None
    swipes: list[SwipeItem] = Field(default_factory=list)
    slider_values: Optional[SliderValues] = None
    character: Optional[GameCharacter] = None  # populated for character_match games
    # Craving radar (2.2): sensory tags override baseline taste for the session.
    craving_tags: list[str] = Field(default_factory=list)
    # This-or-that duels (3.1): [{dimension_a, dimension_b, winner}].
    duel_results: list[dict] = Field(default_factory=list)
    # Pantry game (2.3): what's already in the kitchen.
    pantry_items: list[str] = Field(default_factory=list)
    raw: Optional[dict] = None  # per-game payload: storyChoices, answers, spins…

    model_config = {"extra": "ignore"}


class RecentOrder(BaseModel):
    dish: str
    rating: Optional[float] = Field(default=None, ge=1, le=5)
    date: Optional[str] = None


class History(BaseModel):
    recent_orders: list[RecentOrder] = Field(default_factory=list)
    avoid_these: list[str] = Field(default_factory=list)


class ComfortAnchor(BaseModel):
    food: str
    trigger: Optional[str] = None  # sick | celebration | sad | homesick

    model_config = {"extra": "ignore"}


class UserContext(BaseModel):
    mood: Mood
    preferences: Optional[Preferences] = None
    situational: Optional[Situational] = None
    game_data: Optional[GameData] = None
    history: Optional[History] = None
    unavailable_dishes: list[str] = Field(default_factory=list)
    # Nostalgia prompts (1.3): emotional anchor foods.
    comfort_anchors: list[ComfortAnchor] = Field(default_factory=list)
    automation_pref: Optional[Literal["hands_on", "balanced", "hands_off"]] = None


class RecommendationConfig(BaseModel):
    count: int = Field(default=3, ge=1, le=10)
    diversity: Optional[Literal["low", "medium", "high"]] = "medium"
    include_explanations: bool = True
    include_alternatives: bool = True
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)
    # Recommendation mode: mind_reader (4.3) commits to one confident pick,
    # sos (5.4) skips questions, wildcard (5.3) is the anti-rut shake-up.
    mode: Literal["standard", "mind_reader", "sos", "wildcard", "group"] = "standard"
    question_budget_used: Optional[int] = None


class RecommendationRequest(BaseModel):
    user_context: UserContext
    recommendation_config: RecommendationConfig = Field(default_factory=RecommendationConfig)
    swiggy_address_id: Optional[str] = None
    # Backend user id — enables personalized retrieval from the learned model.
    user_id: Optional[str] = None
    # Client-generated id used to coalesce duplicate in-flight requests.
    request_id: Optional[str] = None
