import json
import pytest
from unittest.mock import MagicMock

from app.schemas.request import (
    Mood, UserContext, RecommendationConfig, RecommendationRequest,
    Preferences, Situational, Budget,
)
from app.services.recommender import (
    get_recommendations, _build_user_message, get_dishes_for_prompt,
    _fallback_response,
)
from app.data.dishes import DISHES


class TestDishList:
    def test_minimum_dishes(self):
        assert len(DISHES) >= 80, f"Expected at least 80 dishes, got {len(DISHES)}"

    def test_all_have_image_url(self):
        for dish in DISHES:
            assert dish.image_url.startswith("https://"), f"{dish.id} missing image_url"

    def test_all_have_required_attributes(self):
        for dish in DISHES:
            assert dish.id
            assert dish.name
            assert dish.cuisine
            assert isinstance(dish.mood_tags, list)
            assert isinstance(dish.allergens, list)
            assert dish.spice_level in ("mild", "medium", "hot", "very_hot")
            assert 1 <= dish.energy_requirement <= 10
            assert 1 <= dish.adventurousness_score <= 10

    def test_unique_ids(self):
        ids = [d.id for d in DISHES]
        assert len(ids) == len(set(ids))

    def test_core_cuisines_represented(self):
        cuisines = {d.cuisine for d in DISHES}
        core = {"indian", "italian", "mexican", "japanese", "american", "mediterranean", "chinese", "thai"}
        assert core.issubset(cuisines), f"Missing cuisines: {core - cuisines}"


class TestPromptBuilding:
    def test_prompt_contains_all_dish_ids(self):
        prompt = get_dishes_for_prompt()
        for dish in DISHES:
            assert dish.id in prompt

    def test_user_message_contains_mood(self):
        ctx = UserContext(mood=Mood(primary="stressed", energy_level=3))
        cfg = RecommendationConfig(count=3)
        msg = _build_user_message(ctx, cfg)
        assert "stressed" in msg
        assert "3/10" in msg

    def test_user_message_contains_allergies(self):
        ctx = UserContext(
            mood=Mood(primary="happy"),
            preferences=Preferences(allergies=["nuts", "dairy"]),
        )
        msg = _build_user_message(ctx, RecommendationConfig())
        assert "nuts" in msg
        assert "dairy" in msg

    def test_user_message_contains_budget(self):
        ctx = UserContext(
            mood=Mood(primary="happy"),
            situational=Situational(budget=Budget(max=400)),
        )
        msg = _build_user_message(ctx, RecommendationConfig())
        assert "₹400" in msg

    def test_user_message_handles_none_optional_fields(self):
        ctx = UserContext(mood=Mood(primary="sad"))
        msg = _build_user_message(ctx, RecommendationConfig())
        assert "mood=sad" in msg  # should not raise


class TestGetRecommendations:
    def test_returns_correct_count(self, mock_llm_response):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response

        req = RecommendationRequest(
            user_context=UserContext(mood=Mood(primary="stressed")),
            recommendation_config=RecommendationConfig(count=3),
        )
        result = get_recommendations(req, llm=mock_llm)

        assert result.success is True
        assert len(result.recommendations) == 3

    def test_recommendations_have_image_urls(self, mock_llm_response):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response

        req = RecommendationRequest(
            user_context=UserContext(mood=Mood(primary="happy")),
        )
        result = get_recommendations(req, llm=mock_llm)

        for rec in result.recommendations:
            assert rec.image_url.startswith("https://")

    def test_recommendations_ranked_correctly(self, mock_llm_response):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response

        req = RecommendationRequest(
            user_context=UserContext(mood=Mood(primary="stressed")),
        )
        result = get_recommendations(req, llm=mock_llm)

        ranks = [r.rank for r in result.recommendations]
        assert ranks == sorted(ranks)

    def test_recommendations_have_reasoning(self, mock_llm_response):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response

        req = RecommendationRequest(
            user_context=UserContext(mood=Mood(primary="stressed")),
        )
        result = get_recommendations(req, llm=mock_llm)

        for rec in result.recommendations:
            assert rec.ai_reasoning.mood_match
            assert rec.ai_reasoning.context_fit
            assert rec.ai_reasoning.psychological_hook

    def test_metadata_present(self, mock_llm_response):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response

        req = RecommendationRequest(
            user_context=UserContext(mood=Mood(primary="happy")),
        )
        result = get_recommendations(req, llm=mock_llm)

        assert result.ai_metadata is not None
        assert result.ai_metadata.model_used == "gpt-4o"

    def test_fallback_on_llm_error(self):
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = Exception("API unavailable")

        req = RecommendationRequest(
            user_context=UserContext(mood=Mood(primary="happy")),
            recommendation_config=RecommendationConfig(count=3),
        )
        result = get_recommendations(req, llm=mock_llm)

        assert result.success is False
        assert len(result.recommendations) == 3
        assert result.error is not None

    def test_fallback_on_invalid_json(self):
        mock_llm = MagicMock()
        bad_resp = MagicMock()
        bad_resp.content = "not json at all"
        bad_resp.response_metadata = {"token_usage": {"total_tokens": 0}}
        mock_llm.invoke.return_value = bad_resp

        req = RecommendationRequest(
            user_context=UserContext(mood=Mood(primary="sad")),
            recommendation_config=RecommendationConfig(count=2),
        )
        result = get_recommendations(req, llm=mock_llm)

        assert result.success is False
        assert len(result.recommendations) == 2

    def test_unknown_dish_id_skipped(self):
        mock_llm = MagicMock()
        bad_id_resp = MagicMock()
        bad_id_resp.content = json.dumps({
            "ranked_dishes": [
                {"dish_id": "nonexistent_999", "confidence": 0.9, "mood_match": "x", "context_fit": "x", "psychological_hook": "x"},
            ],
            "mood_profile": "test",
            "preference_evolution": None,
            "restaurant_suggestions": [],
        })
        bad_id_resp.response_metadata = {"token_usage": {"total_tokens": 100}}
        mock_llm.invoke.return_value = bad_id_resp

        req = RecommendationRequest(
            user_context=UserContext(mood=Mood(primary="happy")),
        )
        result = get_recommendations(req, llm=mock_llm)
        # Unknown IDs are skipped — result has 0 recs but success=True
        assert result.success is True
        assert len(result.recommendations) == 0


class TestCaching:
    def test_second_call_is_cache_hit(self, mock_llm_response):
        import app.services.recommender as svc
        svc._CACHE.clear()

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response

        req = RecommendationRequest(
            user_context=UserContext(mood=Mood(primary="stressed", energy_level=3)),
        )
        first = svc.get_recommendations(req, llm=mock_llm)
        second = svc.get_recommendations(req, llm=mock_llm)

        assert mock_llm.invoke.call_count == 1  # LLM only called once
        assert second.ai_metadata.cache_hit is True
        assert first.ai_metadata.cache_hit is False

    def test_different_requests_get_different_cache_entries(self, mock_llm_response):
        import app.services.recommender as svc
        svc._CACHE.clear()

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response

        req_a = RecommendationRequest(user_context=UserContext(mood=Mood(primary="happy")))
        req_b = RecommendationRequest(user_context=UserContext(mood=Mood(primary="sad")))

        svc.get_recommendations(req_a, llm=mock_llm)
        svc.get_recommendations(req_b, llm=mock_llm)

        assert mock_llm.invoke.call_count == 2


class TestFallbackResponse:
    def test_returns_top_by_health_score(self):
        result = _fallback_response("test error", 3)
        assert len(result.recommendations) == 3
        scores = [r.practical_details.health_score for r in result.recommendations]
        assert scores == sorted(scores, reverse=True)

    def test_success_is_false(self):
        result = _fallback_response("test", 2)
        assert result.success is False
        assert "test" in result.error
