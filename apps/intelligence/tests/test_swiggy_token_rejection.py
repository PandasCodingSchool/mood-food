"""The API drops a user's Swiggy link when it sees X-Swiggy-Token-Rejected."""

from unittest.mock import patch

from app.services.swiggy_discovery import SwiggyDiscoveryService
from app.services.swiggy_mcp import _is_auth_failure_text, _token_rejected


def _raise_with(token: str):
    async def list_addresses(self):
        raise _token_rejected(token, "HTTP 401 Unauthorized")

    return list_addresses


def test_rejected_user_token_is_flagged(client):
    with patch.object(SwiggyDiscoveryService, "list_addresses", _raise_with("user-tok")):
        res = client.get("/api/swiggy/addresses", headers={"x-swiggy-user-token": "user-tok"})
    assert res.status_code == 200
    assert res.json()["success"] is False
    assert res.headers.get("x-swiggy-token-rejected") == "1"


def test_rejected_bootstrap_token_is_not_flagged(client):
    # No user token forwarded: the bootstrap token failing must not unlink anyone.
    with patch.object(SwiggyDiscoveryService, "list_addresses", _raise_with("bootstrap-tok")):
        res = client.get("/api/swiggy/addresses")
    assert "x-swiggy-token-rejected" not in res.headers


def test_session_revoked_counts_as_auth_failure():
    assert _is_auth_failure_text("Client error '419' for url https://mcp.swiggy.com/food")
    assert not _is_auth_failure_text("Client error '429' Too Many Requests")
