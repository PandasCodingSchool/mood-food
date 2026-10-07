"""Model store behaves identically on SQLite and Postgres.

Runs on SQLite by default; set TEST_DATABASE_URL to run the same checks
(and the whole suite) on Postgres + pgvector.
"""

import os

import pytest

from app.learning import store


@pytest.fixture(autouse=True)
def sqlite_path(tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "model_store_path", str(tmp_path / "model.db"))
    store.close()
    yield
    store.close()


def test_backend_selected_from_settings():
    expected = "postgres" if os.environ.get("TEST_DATABASE_URL") else "sqlite"
    assert store.backend_name() == expected


def test_rows_support_name_and_index_access():
    store.set_usage("u1", "k", {"a": 1})
    row = store.fetchone("SELECT user_id, value_json FROM usage_stats WHERE user_id = ?", ("u1",))
    assert row["user_id"] == "u1" and row[0] == "u1"
    assert store.get_usage("u1", "k") == {"a": 1}


def test_cursor_upsert_is_monotonic():
    store.set_cursor("u1", 10)
    store.set_cursor("u1", 4)
    assert store.get_cursor("u1") == 10
    store.set_cursor("u1", 12)
    assert store.get_cursor("u1") == 12


def test_insert_ignore_and_accumulating_upsert():
    from app.learning import entropy, mood_map

    entropy.record_pick("u1", 1, "in_002", "order")
    entropy.record_pick("u1", 1, "in_002", "order")  # replayed signal: no error, no dup
    assert len(store.fetchall("SELECT * FROM recent_picks WHERE user_id = ?", ("u1",))) == 1

    mood_map.observe("u1", "low_energy", "comfort", 5.0)
    mood_map.observe("u1", "low_energy", "comfort", 3.0)
    row = store.fetchone(
        "SELECT score_sum, n_obs FROM user_mood_map WHERE user_id = ? AND mood_key = ?",
        ("u1", "low_energy"),
    )
    assert row["n_obs"] == 2 and abs(row["score_sum"] - 1.5) < 1e-9


def test_literal_percent_survives_placeholder_translation():
    store.set_usage("u1", "pct", "100% match")
    row = store.fetchone("SELECT value_json FROM usage_stats WHERE key LIKE '%ct'")
    assert row is not None and "100% match" in row["value_json"]


def test_reset_clears_learned_state_only():
    store.set_usage("u1", "k", 1)
    store.execute(
        "INSERT INTO text_embeddings (key, embedding) VALUES (?, ?)", ("anchor", "[0.1,0.2]")
    )
    store.reset_store()
    assert store.get_usage("u1", "k") is None
    assert store.fetchone("SELECT key FROM text_embeddings WHERE key = ?", ("anchor",)) is not None


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="Postgres only")
def test_postgres_vectors_and_migrations_idempotent():
    from app.config import settings

    store.execute("INSERT INTO text_embeddings (key, embedding) VALUES (?, ?)", ("v", "[1,2,3]"))
    row = store.fetchone("SELECT embedding <-> '[1,2,4]' AS dist FROM text_embeddings WHERE key = ?", ("v",))
    assert abs(row["dist"] - 1.0) < 1e-6
    applied = store.fetchall("SELECT version FROM schema_migrations")
    store.close()
    store.get_conn()  # re-running migrations is a no-op
    assert store.fetchall("SELECT version FROM schema_migrations") == applied
    assert settings.database_schema.startswith("t_")


def test_dish_matrix_built_into_store_and_loaded(monkeypatch):
    import numpy as np
    from app.data.dishes import DISHES
    from app.learning import embeddings

    monkeypatch.setattr(embeddings, "_matrix", None)
    monkeypatch.setattr(embeddings, "_dish_ids", [])
    monkeypatch.setattr(embeddings, "_empty_checked_at", 0.0)
    calls = []

    def fake_remote(texts):
        calls.append(len(texts))
        rng = np.random.default_rng(0)
        v = rng.normal(size=(len(texts), 8)).astype(np.float32)
        return v / np.linalg.norm(v, axis=1, keepdims=True)

    monkeypatch.setattr(embeddings, "_embed_remote", fake_remote)

    assert embeddings.load_dish_matrix() == (None, [])  # nothing stored yet
    monkeypatch.setattr(embeddings, "_empty_checked_at", 0.0)
    assert embeddings.build_dish_matrix() is True
    assert embeddings.build_dish_matrix() is True  # current → no second embed call
    assert calls == [len(DISHES)]

    matrix, ids = embeddings.load_dish_matrix()
    assert matrix.shape == (len(DISHES), 8)
    assert sorted(ids) == sorted(d.id for d in DISHES)
    vec = embeddings.get_dish_vector(DISHES[0].id)
    assert vec is not None and abs(float(np.linalg.norm(vec)) - 1.0) < 1e-5
