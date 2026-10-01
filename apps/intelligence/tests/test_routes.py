import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.response import RecommendationResponse, Recommendation, AiReasoning, PracticalDetails, Restaurant, DishSummary, AiMetadata, Insights

client = TestClient(app)

MOCK_RESPONSE = RecommendationResponse(
    success=True,
    recommendations=[
        Recommendation(
            id="rec_abc123",
            rank=1,
            confidence=0.91,
            dish=DishSummary(id="in_002", name="Dal Makhani", cuisine="indian", category="comfort_food", tags=["vegetarian"]),
            image_url="https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600",
            ai_reasoning=AiReasoning(
                mood_match="Ultimate comfort for a stressed mind",
                context_fit="Vegetarian, within budget, delivery-ready",
                psychological_hook="Creamy warmth triggers serotonin release",
            ),
            practical_details=PracticalDetails(estimated_price=250, preparation_time=25, calories=420, health_score=6.5),
            restaurant=Restaurant(name="Spice Garden", rating=4.4, distance_km=1.2, delivery_time_min=25, is_open=True),
        )
    ],
    ai_metadata=AiMetadata(model_used="gpt-4o", tokens_used=1200, response_time_s=1.1),
    insights=Insights(detected_mood_profile="Comfort-seeking", preference_evolution="Trending lighter"),
)


class TestHealthEndpoint:
    def test_health_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestRecommendationsEndpoint:
    def test_minimal_payload_returns_200(self, minimal_payload):
        with patch("app.routes.recommendations.recommender.get_recommendations", return_value=MOCK_RESPONSE):
            resp = client.post("/api/ai-recommendations", json=minimal_payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert len(data["recommendations"]) == 1

    def test_full_payload_returns_200(self, full_payload):
        with patch("app.routes.recommendations.recommender.get_recommendations", return_value=MOCK_RESPONSE):
            resp = client.post("/api/ai-recommendations", json=full_payload)
        assert resp.status_code == 200

    def test_response_has_image_url(self, minimal_payload):
        with patch("app.routes.recommendations.recommender.get_recommendations", return_value=MOCK_RESPONSE):
            resp = client.post("/api/ai-recommendations", json=minimal_payload)
        rec = resp.json()["recommendations"][0]
        assert rec["image_url"].startswith("https://")

    def test_response_has_ai_reasoning(self, minimal_payload):
        with patch("app.routes.recommendations.recommender.get_recommendations", return_value=MOCK_RESPONSE):
            resp = client.post("/api/ai-recommendations", json=minimal_payload)
        reasoning = resp.json()["recommendations"][0]["ai_reasoning"]
        assert "mood_match" in reasoning
        assert "psychological_hook" in reasoning

    def test_missing_mood_returns_422(self):
        resp = client.post("/api/ai-recommendations", json={"user_context": {}})
        assert resp.status_code == 422

    def test_invalid_energy_level_returns_422(self):
        resp = client.post("/api/ai-recommendations", json={
            "user_context": {"mood": {"primary": "happy", "energy_level": 99}}
        })
        assert resp.status_code == 422

    def test_invalid_temperature_returns_422(self):
        resp = client.post("/api/ai-recommendations", json={
            "user_context": {"mood": {"primary": "happy"}},
            "recommendation_config": {"temperature": 5.0},
        })
        assert resp.status_code == 422

    def test_empty_body_returns_422(self):
        resp = client.post("/api/ai-recommendations", json={})
        assert resp.status_code == 422

    def test_fallback_response_returns_200(self, minimal_payload):
        fallback = RecommendationResponse(
            success=False,
            recommendations=MOCK_RESPONSE.recommendations,
            error="AI unavailable — showing top-rated fallbacks.",
        )
        with patch("app.routes.recommendations.recommender.get_recommendations", return_value=fallback):
            resp = client.post("/api/ai-recommendations", json=minimal_payload)
        assert resp.status_code == 200
        assert resp.json()["success"] is False
        assert resp.json()["error"] is not None
