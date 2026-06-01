import pytest
from pydantic import ValidationError

from app.schemas.request import (
    Mood, Preferences, Situational, Budget, GameData, SliderValues,
    UserContext, RecommendationConfig, RecommendationRequest,
)


class TestMood:
    def test_valid_mood(self):
        m = Mood(primary="stressed", energy_level=3, social_context="solo")
        assert m.primary == "stressed"
        assert m.energy_level == 3

    def test_energy_level_defaults_to_5(self):
        m = Mood(primary="happy")
        assert m.energy_level == 5

    def test_energy_level_too_high(self):
        with pytest.raises(ValidationError):
            Mood(primary="happy", energy_level=15)

    def test_energy_level_too_low(self):
        with pytest.raises(ValidationError):
            Mood(primary="happy", energy_level=0)

    def test_invalid_social_context(self):
        with pytest.raises(ValidationError):
            Mood(primary="happy", social_context="alone")  # not in enum


class TestPreferences:
    def test_defaults_to_empty_lists(self):
        p = Preferences()
        assert p.cuisine_types == []
        assert p.dietary_restrictions == []
        assert p.allergies == []

    def test_invalid_spice_tolerance(self):
        with pytest.raises(ValidationError):
            Preferences(spice_tolerance="nuclear")


class TestBudget:
    def test_requires_max(self):
        with pytest.raises(ValidationError):
            Budget()  # max is required

    def test_valid_budget(self):
        b = Budget(max=500, currency="INR")
        assert b.max == 500


class TestSliderValues:
    def test_slider_out_of_range(self):
        with pytest.raises(ValidationError):
            SliderValues(adventurous=11)

    def test_slider_zero_invalid(self):
        with pytest.raises(ValidationError):
            SliderValues(health_conscious=0)

    def test_all_optional(self):
        s = SliderValues()
        assert s.adventurous is None


class TestRecommendationConfig:
    def test_defaults(self):
        cfg = RecommendationConfig()
        assert cfg.count == 3
        assert cfg.temperature == 0.7

    def test_count_above_max(self):
        with pytest.raises(ValidationError):
            RecommendationConfig(count=11)

    def test_temperature_out_of_range(self):
        with pytest.raises(ValidationError):
            RecommendationConfig(temperature=1.5)


class TestRecommendationRequest:
    def test_minimal_valid_request(self):
        req = RecommendationRequest(
            user_context=UserContext(mood=Mood(primary="stressed"))
        )
        assert req.recommendation_config.count == 3

    def test_missing_mood_raises(self):
        with pytest.raises(ValidationError):
            RecommendationRequest(user_context=UserContext())

    def test_full_request_parses(self):
        req = RecommendationRequest(
            user_context=UserContext(
                mood=Mood(primary="happy", energy_level=7, social_context="friends"),
                preferences=Preferences(
                    cuisine_types=["indian"],
                    dietary_restrictions=["vegetarian"],
                    allergies=["nuts"],
                    spice_tolerance="medium",
                ),
                situational=Situational(
                    time_of_day="dinner",
                    weather="rainy",
                    budget=Budget(max=500),
                    delivery_preferred=True,
                ),
            ),
            recommendation_config=RecommendationConfig(count=3, temperature=0.6),
        )
        assert req.user_context.mood.primary == "happy"
        assert req.user_context.preferences.allergies == ["nuts"]
