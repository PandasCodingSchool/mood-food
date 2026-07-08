from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.schemas.request import RecommendationConfig
from app.schemas.response import (
    AiReasoning,
    DishSummary,
    PracticalDetails,
    Recommendation,
    RecommendationResponse,
    Restaurant,
)
from app.schemas.swiggy import EnrichedMatch

client = TestClient(app)


def _rec(dish_id: str, name: str) -> Recommendation:
    return Recommendation(
        id=f"rec_{dish_id}",
        rank=1,
        confidence=0.9,
        dish=DishSummary(id=dish_id, name=name, cuisine="indian", category="comfort_food", tags=[]),
        image_url="https://images.unsplash.com/x",
        ai_reasoning=AiReasoning(mood_match="m", context_fit="c", psychological_hook="p"),
        practical_details=PracticalDetails(estimated_price=250, preparation_time=20, calories=400, health_score=6.0),
        restaurant=Restaurant(name="R", rating=4.2, distance_km=1.0, delivery_time_min=25, is_open=True),
    )


INITIAL = RecommendationResponse(
    success=True,
    recommendations=[_rec("a", "Dish A"), _rec("b", "Dish B"), _rec("c", "Dish C")],
)
REPLACEMENT = RecommendationResponse(
    success=True,
    recommendations=[_rec("d", "Dish D")],
)


def _payload():
    return {
        "user_context": {"mood": {"primary": "happy"}},
        "recommendation_config": {"count": 3},
        "swiggy_address_id": "addr_1",
    }


class TestSwiggyRetryReplacesOnlyUnmatched:
    def test_only_unmatched_dish_gets_replaced(self):
        recommender_calls: list[RecommendationConfig] = []

        def fake_get_recommendations(request):
            recommender_calls.append(request.recommendation_config)
            if len(recommender_calls) == 1:
                return INITIAL
            return REPLACEMENT

        async def fake_enrich(dishes, address_id=None, city=None):
            ids = {d.id for d in dishes}
            # First call enriches all 3 (a, b, c) — b fails.
            # Second call enriches only the replacement (d) — succeeds.
            matches = [
                EnrichedMatch(dish_id=d.id, matched=(d.id != "b"))
                for d in dishes
            ]
            return "addr_1", matches

        with patch("app.services.recommender.get_recommendations", side_effect=fake_get_recommendations), \
             patch("app.services.swiggy_token.load_token", return_value="fake-token"), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich", new=AsyncMock(side_effect=fake_enrich)):
            resp = client.post("/api/ai-recommendations", json=_payload())

        assert resp.status_code == 200
        data = resp.json()

        dish_ids = [r["dish"]["id"] for r in data["recommendations"]]
        # Dish B was replaced by Dish D; A and C are untouched.
        assert dish_ids == ["a", "d", "c"]
        assert set(data["swiggy_matches"].keys()) == {"a", "d", "c"}
        assert "b" not in data["swiggy_matches"]

        # The replacement call must have asked for exactly 1 dish, not 3.
        assert len(recommender_calls) == 2
        assert recommender_calls[1].count == 1

    def test_all_matched_no_replacement_call(self):
        recommender_calls = []

        def fake_get_recommendations(request):
            recommender_calls.append(request)
            return INITIAL

        async def fake_enrich(dishes, address_id=None, city=None):
            matches = [EnrichedMatch(dish_id=d.id, matched=True) for d in dishes]
            return "addr_1", matches

        with patch("app.services.recommender.get_recommendations", side_effect=fake_get_recommendations), \
             patch("app.services.swiggy_token.load_token", return_value="fake-token"), \
             patch("app.services.swiggy_discovery.SwiggyDiscoveryService.enrich", new=AsyncMock(side_effect=fake_enrich)):
            resp = client.post("/api/ai-recommendations", json=_payload())

        assert resp.status_code == 200
        data = resp.json()
        assert len(recommender_calls) == 1  # no replacement round triggered
        assert set(data["swiggy_matches"].keys()) == {"a", "b", "c"}
