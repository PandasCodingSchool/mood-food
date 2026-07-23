from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class AiReasoning(BaseModel):
    mood_match: str
    context_fit: str
    psychological_hook: str
    nostalgia_factor: Optional[str] = None
    context_tags: list[str] = Field(default_factory=list)


class PracticalDetails(BaseModel):
    estimated_price: float
    preparation_time: int  # minutes
    calories: int
    health_score: float = Field(ge=0, le=10)


class Restaurant(BaseModel):
    name: str
    rating: float = Field(ge=0, le=5)
    distance_km: float
    delivery_time_min: int
    is_open: bool = True


class Alternative(BaseModel):
    dish_id: str
    type: str  # healthier_swap | budget_swap | similar_tier_swap | popular_pick
    name: str
    reason: str
    # Full dish info so the frontend can render a swap as its own detail card.
    cuisine: Optional[str] = None
    category: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    image_url: Optional[str] = None
    practical_details: Optional[PracticalDetails] = None


class PairingSuggestion(BaseModel):
    type: str  # drink | dessert | side
    name: str
    reason: str


class DishSummary(BaseModel):
    id: str
    name: str
    cuisine: str
    category: str
    tags: list[str]


class Recommendation(BaseModel):
    id: str
    rank: int
    confidence: float = Field(ge=0, le=1)
    # Predicted enjoyment 0-1 from the learned taste model (calibration loop).
    predicted_score: Optional[float] = None
    # True when this pick is an anti-rut wildcard ("shake it up?").
    is_wildcard: bool = False
    dish: DishSummary
    image_url: str
    ai_reasoning: AiReasoning
    practical_details: PracticalDetails
    restaurant: Restaurant
    alternatives: list[Alternative] = Field(default_factory=list)
    pairing_suggestions: list[PairingSuggestion] = Field(default_factory=list)


class AiMetadata(BaseModel):
    model_config = {"protected_namespaces": ()}

    model_used: str
    tokens_used: Optional[int] = None
    response_time_s: Optional[float] = None
    cache_hit: bool = False


class Insights(BaseModel):
    detected_mood_profile: str
    preference_evolution: Optional[str] = None
    next_meal_prediction: Optional[str] = None
    persona_drift: Optional[str] = None


class LearnedMeta(BaseModel):
    """Learned-model metadata attached to every response."""

    confidence: Optional[float] = None
    question_budget: Optional[int] = None
    persona: Optional[str] = None
    mode: str = "standard"
    accuracy_meter: Optional[dict] = None


class RecommendationResponse(BaseModel):
    success: bool
    recommendations: list[Recommendation] = Field(default_factory=list)
    ai_metadata: Optional[AiMetadata] = None
    meta: Optional[LearnedMeta] = None
    insights: Optional[Insights] = None
    error: Optional[str] = None
    swiggy_matches: Optional[dict] = None
    swiggy_address_id: Optional[str] = None
    # "live" | "partial" | "offline" — how much of the response is Swiggy-verified.
    live_status: Optional[str] = None
    request_id: Optional[str] = None


class DishDetailResponse(BaseModel):
    success: bool
    dish: Optional[DishSummary] = None
    image_url: Optional[str] = None
    practical_details: Optional[PracticalDetails] = None
    restaurant: Optional[Restaurant] = None
    alternatives: list[Alternative] = Field(default_factory=list)
    pairing_suggestions: list[PairingSuggestion] = Field(default_factory=list)
    error: Optional[str] = None
