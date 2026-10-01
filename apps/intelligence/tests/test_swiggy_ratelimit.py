from unittest.mock import AsyncMock, patch

import pytest

from app.services import swiggy_mcp
from app.services.swiggy_mcp import SwiggyMCPClient, SwiggyMCPError


@pytest.fixture(autouse=True)
def _reset_cooldown():
    swiggy_mcp._rate_limited_until = 0.0
    yield
    swiggy_mcp._rate_limited_until = 0.0


class TestRateLimitCooldown:
    @pytest.mark.asyncio
    async def test_429_arms_cooldown_for_subsequent_call(self):
        client = SwiggyMCPClient(token="fake-token")

        call_count = 0

        async def fake_call_once(name, arguments):
            nonlocal call_count
            call_count += 1
            raise SwiggyMCPError("Client error '429 Too Many Requests'", retryable=True)

        with patch.object(client, "_call_once", side_effect=fake_call_once), \
             patch("app.services.swiggy_mcp.settings") as mock_settings:
            mock_settings.swiggy_max_retries = 1
            mock_settings.swiggy_timeout_s = 5.0
            mock_settings.swiggy_rate_limit_base_ms = 0
            mock_settings.swiggy_retry_base_ms = 0
            mock_settings.swiggy_rate_limit_cooldown_s = 5.0

            with pytest.raises(SwiggyMCPError):
                await client.call_tool("search_restaurants", {})

        assert swiggy_mcp._rate_limited_until > 0

    @pytest.mark.asyncio
    async def test_cooldown_delays_next_call(self):
        import time
        swiggy_mcp._rate_limited_until = time.monotonic() + 0.05

        with patch("app.services.swiggy_mcp.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await swiggy_mcp._await_rate_limit_cooldown("search_restaurants")
            assert mock_sleep.called
            waited = mock_sleep.call_args[0][0]
            assert waited > 0

    @pytest.mark.asyncio
    async def test_no_cooldown_when_not_rate_limited(self):
        swiggy_mcp._rate_limited_until = 0.0
        with patch("app.services.swiggy_mcp.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            await swiggy_mcp._await_rate_limit_cooldown("search_restaurants")
            assert not mock_sleep.called
