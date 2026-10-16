"""Service auth, sync-key gating and request-id propagation."""

import pytest

from app.config import settings


@pytest.fixture
def keys(monkeypatch):
    monkeypatch.setattr(settings, "ai_service_key", "svc-secret")
    monkeypatch.setattr(settings, "sync_key", "sync-secret")
    monkeypatch.setattr(settings, "environment", "development")


def test_health_is_open(client, keys):
    assert client.get("/health").status_code == 200


def test_routes_require_bearer_when_key_set(client, keys):
    assert client.get("/api/dish/in_002").status_code == 401
    assert client.get("/api/dish/in_002", headers={"Authorization": "Bearer wrong"}).status_code == 401
    ok = client.get("/api/dish/in_002", headers={"Authorization": "Bearer svc-secret"})
    assert ok.status_code == 200


def test_dev_without_key_is_open(client, monkeypatch):
    monkeypatch.setattr(settings, "ai_service_key", "")
    monkeypatch.setattr(settings, "environment", "development")
    assert client.get("/api/dish/in_002").status_code == 200


def test_production_without_key_fails_closed(client, monkeypatch):
    monkeypatch.setattr(settings, "ai_service_key", "")
    monkeypatch.setattr(settings, "sync_key", "")
    monkeypatch.setattr(settings, "environment", "production")
    assert client.get("/api/dish/in_002").status_code == 503


@pytest.mark.parametrize("method,path", [
    ("get", "/api/profile/u1"),
    ("get", "/api/twin-taste/u1"),
    ("post", "/api/group/consensus"),
    ("post", "/api/learn/signals"),
])
def test_learning_routes_require_sync_key(client, keys, method, path):
    headers = {"Authorization": "Bearer svc-secret"}
    resp = getattr(client, method)(path, headers=headers, **({"json": {}} if method == "post" else {}))
    assert resp.status_code == 403


def test_request_id_echoed_and_generated(client, keys):
    headers = {"Authorization": "Bearer svc-secret"}
    resp = client.get("/health", headers={**headers, "X-Request-Id": "req-123"})
    assert resp.headers["X-Request-Id"] == "req-123"
    assert client.get("/health").headers["X-Request-Id"]


def test_cors_closed_by_default(client, keys):
    resp = client.options(
        "/api/dish/in_002",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in {k.lower() for k in resp.headers}
