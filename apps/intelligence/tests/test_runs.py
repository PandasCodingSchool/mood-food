"""Every recommendation leaves a recommendation_runs row keyed by request_id."""

import time
from unittest.mock import patch

import pytest

from app.learning import runs, store
from tests.test_routes import MOCK_RESPONSE


@pytest.fixture(autouse=True)
def isolated_store(tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "model_store_path", str(tmp_path / "model.db"))
    store.close()
    yield
    store.close()


def _wait_for(request_id, timeout=2.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        row = runs.get(request_id)
        if row:
            return row
        time.sleep(0.02)
    return None


def test_recommendation_writes_run_row(client):
    payload = {"user_context": {"mood": {"primary": "stressed"}}, "request_id": "req-run-1"}
    with patch("app.routes.recommendations.recommender.get_recommendations", return_value=MOCK_RESPONSE):
        resp = client.post("/api/ai-recommendations", json=payload)
    assert resp.status_code == 200

    row = _wait_for("req-run-1")
    assert row is not None
    assert row["selected"] == ["in_002"]
    assert row["ranked"] == ["in_002"]
    assert len(row["shortlist"]) >= 3
    assert row["ranker_provider"] == "gpt"
    assert row["model"] == "gpt-4o"
    assert row["tokens"] == 1200
    assert not row["fallback_used"] and not row["cache_hit"]
    assert row["live_status"] == "offline"
    assert set(row["latency"]) == {"shortlist", "rank", "enrich", "total"}


def test_no_request_id_no_row():
    runs.record(None, user_id=None, mode=None, ranker_provider="gpt", model=None, shortlist=[], ranked=[],
                selected=[], fallback_used=False, cache_hit=False, live_status=None, latency_ms={}, tokens=None)
    assert store.fetchone("SELECT COUNT(*) AS n FROM recommendation_runs")["n"] == 0


def test_shadow_attached_later():
    runs.record("r2", user_id="u", mode="standard", ranker_provider="gpt", model="m", shortlist=["a"],
                ranked=["a"], selected=["a"], fallback_used=False, cache_hit=False, live_status="offline",
                latency_ms={"total": 1.0}, tokens=1)
    runs.attach_shadow("r2", {"provider": "jev", "ranked": ["a"]})
    assert runs.get("r2")["shadow"] == {"provider": "jev", "ranked": ["a"]}
