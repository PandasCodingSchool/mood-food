from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator


class Mood(BaseModel):
    primary: str  # e.g. "stressed", "happy", "sad", "anxious", "celebratory", "romantic", "comfort"
    energy_level: int = Field(default=5, ge=1, le=10)
    social_context: Optional[Literal["solo", "date", "friends", "family"]] = None


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
    raw: Optional[dict] = None  # per-game payload: storyChoices, answers, spins…

    model_config = {"extra": "ignore"}


class RecentOrder(BaseModel):
    dish: str
    rating: Optional[float] = Field(default=None, ge=1, le=5)
    date: Optional[str] = None


class History(BaseModel):
    recent_orders: list[RecentOrder] = Field(default_factory=list)
    avoid_these: list[str] = Field(default_factory=list)


class UserContext(BaseModel):
    mood: Mood
    preferences: Optional[Preferences] = None
    situational: Optional[Situational] = None
    game_data: Optional[GameData] = None
    history: Optional[History] = None
    unavailable_dishes: list[str] = Field(default_factory=list)


class RecommendationConfig(BaseModel):
    count: int = Field(default=3, ge=1, le=10)
    diversity: Optional[Literal["low", "medium", "high"]] = "medium"
    include_explanations: bool = True
    include_alternatives: bool = True
    temperature: float = Field(default=0.7, ge=0.0, le=1.0)


class RecommendationRequest(BaseModel):
    user_context: UserContext
    recommendation_config: RecommendationConfig = Field(default_factory=RecommendationConfig)
    swiggy_address_id: Optional[str] = None
