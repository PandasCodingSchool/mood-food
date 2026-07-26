"""Unit tests for the learning layer (replay-safe folds, update rules)."""

import numpy as np
import pytest

from app.learning import (
    calibration,
    learner,
    mood_map,
    store,
    tradeoffs,
    user_model,
)


@pytest.fixture(autouse=True)
def clean_store(tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "model_store_path", str(tmp_path / "model.db"))
    # Reset the cached connection so each test gets a fresh store.
    import app.learning.store as store_mod

    store_mod._conn = None
    yield
    store_mod._conn = None


@pytest.fixture
def fake_embeddings(monkeypatch):
    """Deterministic 8-dim dish space so vector math is testable offline."""
    rng = np.random.default_rng(42)
    from app.data.dishes import DISHES

    ids = [d.id for d in DISHES]
    matrix = rng.normal(size=(len(ids), 8)).astype(np.float32)
    matrix /= np.linalg.norm(matrix, axis=1, keepdims=True)

    from app.learning import embeddings

    monkeypatch.setattr(embeddings, "load_dish_matrix", lambda: (matrix, ids))
    monkeypatch.setattr(
        embeddings,
        "get_dish_vector",
        lambda dish_id: matrix[ids.index(dish_id)] if dish_id in ids else None,
    )
    monkeypatch.setattr(
        embeddings,
        "population_mean_vector",
        lambda: (matrix.mean(axis=0) / np.linalg.norm(matrix.mean(axis=0))).astype(np.float32),
    )
    return matrix, ids


class TestUserModel:
    def test_like_pulls_vector_toward_dish(self, fake_embeddings):
        matrix, ids = fake_embeddings
        dish_vec = matrix[0]
        before = user_model.score_dish("u1", dish_vec)
        assert before is None  # no vector yet
        user_model.update("u1", dish_vec, 1.0, 1.0)
        after_one = user_model.score_dish("u1", dish_vec)
        user_model.update("u1", dish_vec, 1.0, 1.0)
        after_two = user_model.score_dish("u1", dish_vec)
        assert after_two > after_one

    def test_dislike_builds_negative_space(self, fake_embeddings):
        matrix, ids = fake_embeddings
        dish_vec = matrix[1]
        user_model.update("u1", matrix[0], 1.0, 1.0)  # init
        score_before = user_model.score_dish("u1", dish_vec)
        for _ in range(5):
            user_model.update("u1", dish_vec, -1.0, 1.0)
        score_after = user_model.score_dish("u1", dish_vec)
        assert score_after < score_before

    def test_swipe_weight_snap_judgments_count_more(self):
        assert user_model.swipe_weight(300) > user_model.swipe_weight(3000)
        assert user_model.swipe_weight(50) == 2.0  # clipped
        assert user_model.swipe_weight(None) == 1.0

    def test_post_meal_weight_signed(self):
        assert user_model.post_meal_weight(5) == 2.0
        assert user_model.post_meal_weight(3) == 0.0
        assert user_model.post_meal_weight(1) == -2.0


class TestVetoRouting:
    def test_had_recently_never_touches_vector(self, fake_embeddings):
        matrix, ids = fake_embeddings
        user_model.update("u1", matrix[0], 1.0, 1.0)
        pos_before, _, n_before = user_model.load_vectors("u1")
        learner.apply_signal(
            "u1",
            {
                "id": 10,
                "type": "veto",
                "payload": {"dish_id": ids[0], "reason": "had_recently"},
                "context": {"server_ts": "2026-07-23T12:00:00Z"},
            },
        )
        pos_after, _, n_after = user_model.load_vectors("u1")
        assert np.allclose(pos_before, pos_after)
        assert n_after == n_before
        # But a session recency penalty was recorded.
        penalties = store.get_usage("u1", "recency_penalties", {})
        assert ids[0] in penalties

    def test_too_pricey_tightens_price_weight(self):
        weights_before = tradeoffs.get_weights("u1", {})
        learner.apply_signal(
            "u1",
            {"id": 11, "type": "veto", "payload": {"dish_id": "x", "reason": "too_pricey"}, "context": {}},
        )
        weights_after = tradeoffs.get_weights("u1", {})
        assert weights_after["price"] > weights_before["price"]


class TestBradleyTerry:
    def test_converges_on_synthetic_duels(self):
        # User always picks price over health -> price weight should dominate.
        for _ in range(10):
            tradeoffs.observe_duel("u1", "price", "health", "price", {})
        weights = tradeoffs.get_weights("u1", {})
        assert weights["price"] > weights["health"]
        assert weights["price"] > 0.3

    def test_context_buckets_are_separate(self):
        tradeoffs.observe_duel("u1", "price", "health", "price", {"time_of_day": "lunch"})
        lunch = tradeoffs.get_weights("u1", {"time_of_day": "lunch"})
        rainy = tradeoffs.get_weights("u1", {"weather": "rainy"})
        assert lunch["price"] > rainy["price"]


class TestMoodMapShrinkage:
    def test_weight_shrinks_toward_prior_with_few_obs(self):
        prior = mood_map.weight("u1", "lowE_highS", "comfort_carb")
        mood_map.observe("u1", "lowE_highS", "comfort_carb", 5.0)  # one great meal
        after_one = mood_map.weight("u1", "lowE_highS", "comfort_carb")
        assert prior < after_one < 1.0  # moved up but shrunk toward prior
        for _ in range(20):
            mood_map.observe("u1", "lowE_highS", "comfort_carb", 5.0)
        after_many = mood_map.weight("u1", "lowE_highS", "comfort_carb")
        assert after_many > after_one  # converges toward the user's own mean

    def test_bad_meals_lower_weight(self):
        prior = mood_map.weight("u1", "highE_lowS", "spicy_bold")
        for _ in range(10):
            mood_map.observe("u1", "highE_lowS", "spicy_bold", 1.0)
        assert mood_map.weight("u1", "highE_lowS", "spicy_bold") < prior


class TestCalibration:
    def test_rolling_accuracy(self):
        for i in range(4):
            calibration.record_prediction("u1", f"r{i}", "d1", 0.8, 0.7)
            calibration.resolve("u1", f"r{i}", "d1", None, 5 if i % 2 == 0 else 2)
        stats = calibration.rolling_accuracy("u1")
        assert stats["n"] == 4
        assert stats["accuracy"] == 0.5


class TestReplayIdempotence:
    def test_batch_fold_sets_cursor_and_counts(self, fake_embeddings):
        batch = [
            {"id": 1, "type": "mood_checkin", "payload": {"energy": 5, "stress": 5, "hunger": 5, "social": 5}, "context": {"server_ts": "2026-07-23T09:00:00Z"}},
            {"id": 2, "type": "sos", "payload": {}, "context": {}},
        ]
        result = learner.apply_batch("u9", batch)
        assert store.get_cursor("u9") == 2
        assert result["profile_summary"]["n_signals"] == 2
        assert store.get_usage("u9", "sos_count") == 1
