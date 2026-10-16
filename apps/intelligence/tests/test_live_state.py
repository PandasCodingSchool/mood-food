"""Mind-reader / SOS replace the client's placeholder mood with known state."""

import pytest

from app.learning import live_state, store
from app.schemas.request import (
    GameData, Mood, RecommendationConfig, RecommendationRequest, UserContext,
)

TODAY = "2026-10-07"


@pytest.fixture(autouse=True)
def clean_store(tmp_path, monkeypatch):
    from app.config import settings
    import app.learning.store as store_mod

    monkeypatch.setattr(settings, "model_store_path", str(tmp_path / "model.db"))
    store_mod.close()
    yield
    store_mod.close()


def _req(mode="mind_reader", user_id="u1"):
    return RecommendationRequest(
        user_context=UserContext(mood=Mood(primary="happy"), game_data=GameData(type="mind_reader")),
        recommendation_config=RecommendationConfig(count=1, mode=mode),
        user_id=user_id,
    )


def _checkin(energy, stress, hunger, social, day=TODAY, signal_id=1):
    store.execute(
        "INSERT INTO mood_checkins (user_id, signal_id, energy, stress, hunger, social, day) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("u1", signal_id, energy, stress, hunger, social, day),
    )


def test_checkin_replaces_placeholder_mood():
    _checkin(energy=3, stress=4, hunger=8, social=2)
    out = live_state.apply_learned_state(_req(), today=TODAY)
    mood = out.user_context.mood
    assert mood.primary == "tired"
    assert (mood.energy_level, mood.hunger_level, mood.stress_level) == (3, 8, 4)
    assert mood.social_context == "solo"


def test_latest_checkin_wins_and_stale_day_ignored():
    _checkin(energy=8, stress=8, hunger=5, social=5, signal_id=1)
    _checkin(energy=8, stress=2, hunger=5, social=8, signal_id=2)
    assert live_state.apply_learned_state(_req(), today=TODAY).user_context.mood.primary == "adventurous"
    assert live_state.apply_learned_state(_req(), today="2026-10-08").user_context.mood.primary == "happy"


def test_todays_cravings_and_occasion_applied():
    store.set_usage("u1", "last_craving_day", TODAY)
    store.set_usage("u1", "last_craving_tags", ["spicy", "crunchy"])
    store.set_usage("u1", "last_occasion", "treat")
    ctx = live_state.apply_learned_state(_req(mode="sos"), today=TODAY).user_context
    assert ctx.game_data.craving_tags == ["spicy", "crunchy"]
    assert ctx.situational.occasion == "treat"


def test_standard_mode_and_anonymous_untouched():
    _checkin(energy=2, stress=9, hunger=5, social=5)
    for req in (_req(mode="standard"), _req(user_id=None)):
        assert live_state.apply_learned_state(req, today=TODAY) is req


def test_mood_from_checkin_matches_mobile_rules():
    assert live_state.mood_from_checkin(5, 7, 5) == "stressed"
    assert live_state.mood_from_checkin(4, 3, 5) == "tired"
    assert live_state.mood_from_checkin(8, 3, 4, "treat") == "adventurous"
    assert live_state.mood_from_checkin(6, 3, 5) == "happy"
