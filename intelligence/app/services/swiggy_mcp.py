"""Swiggy MCP (Food server) client.

Thin async wrapper around the official MCP Python SDK that talks to the Swiggy
Food server over streamable HTTP. Each call opens a fresh MCP session with a
bearer token (per-user in Phase 2, the bootstrap service token in Phase 1),
calls a single tool, and normalises the result.

Docs: https://mcp.swiggy.com/builders
  - Endpoint:      POST mcp.swiggy.com/food  (MCP over streamable HTTP)
  - Auth:          Authorization: Bearer <token>  (OAuth 2.1 + PKCE)
  - Food tools:    get_addresses, search_restaurants, search_menu,
                   get_restaurant_menu, fetch_food_coupons, apply_food_coupon,
                   get_food_cart, update_food_cart, flush_food_cart,
                   place_food_order, get_food_orders, get_food_order_details,
                   track_food_order, report_error
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import time
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Any, AsyncIterator, Optional

from app.config import settings

logger = logging.getLogger("swiggy_mcp")

# Global cap on concurrent MCP HTTP calls — protects against 429s when several
# dishes enrich at once. Shared across all client instances / requests.
_MCP_SEMAPHORE = asyncio.Semaphore(max(1, settings.swiggy_max_concurrency))

# Cross-request rate-limit memory: once a 429 is detected, remember it for a
# short window so subsequent calls (this request's other dishes, or the next
# incoming request) back off up front instead of independently rediscovering
# the rate limit via their own multi-attempt retry loop.
_rate_limited_until: float = 0.0


async def _await_rate_limit_cooldown(name: str) -> None:
    now = time.monotonic()
    remaining = _rate_limited_until - now
    if remaining > 0:
        logger.info(
            "Swiggy rate-limit cooldown active, waiting %.1fs before '%s'", remaining, name,
        )
        await asyncio.sleep(remaining)


def _arm_rate_limit_cooldown() -> None:
    global _rate_limited_until
    _rate_limited_until = time.monotonic() + settings.swiggy_rate_limit_cooldown_s


def _preview(data: Any, limit: int = 800) -> str:
    """Compact, safe-to-log preview of a tool result (truncated)."""
    try:
        text = json.dumps(data, default=str)
    except (TypeError, ValueError):
        text = str(data)
    return text if len(text) <= limit else text[:limit] + f"... ({len(text)} chars)"


class SwiggyAuthError(Exception):
    """Raised when no usable token is available or the token is rejected (401/403)."""


class SwiggyMCPError(Exception):
    """Raised when an MCP tool call fails after retries."""

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


class SwiggyAddressRequiredError(SwiggyMCPError):
    """No addressId could be resolved and live address lookup is disabled.

    Raised instead of silently calling get_addresses when
    settings.swiggy_address_retrieval_enabled is False — callers should surface
    this distinctly (e.g. prompt the user to connect/select an address).
    """


def _import_mcp():
    """Import the MCP SDK lazily so the service still boots if it's not installed."""
    try:
        from mcp import ClientSession
        from mcp.client.streamable_http import streamablehttp_client
        return ClientSession, streamablehttp_client
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise SwiggyMCPError(
            "The 'mcp' package is not installed. Add it to requirements.txt "
            "(pip install 'mcp>=1.6.0')."
        ) from exc


def _parse_tool_result(result: Any) -> Any:
    """Normalise an MCP CallToolResult into plain Python data.

    Prefers structuredContent; falls back to parsing the first text block as JSON,
    then to the raw text. Raises on tool-reported errors.
    """
    if getattr(result, "isError", False):
        text = _first_text(result)
        retryable = _looks_retryable(text)
        raise SwiggyMCPError(f"Swiggy tool error: {text}", retryable=retryable)

    structured = getattr(result, "structuredContent", None)
    if structured:
        # The SDK often wraps a single value under a "result" key.
        if isinstance(structured, dict) and set(structured.keys()) == {"result"}:
            return structured["result"]
        return structured

    text = _first_text(result)
    if text:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return text
    return None


def _first_text(result: Any) -> str:
    for block in getattr(result, "content", []) or []:
        text = getattr(block, "text", None)
        if text:
            return text
    return ""


def _looks_retryable(text: str) -> bool:
    lowered = (text or "").lower()
    return any(s in lowered for s in ("timeout", "timed out", "unavailable", "5xx", "try again", "rate limit"))


class SwiggyMCPClient:
    """Calls Swiggy Food MCP tools using a bearer token."""

    def __init__(self, token: Optional[str] = None) -> None:
        # Read the freshest token from the runtime store (falls back to env), so
        # a re-auth heals the service without a restart. Each request builds a
        # fresh client, so it always picks up the latest stored token.
        from app.services.swiggy_token import load_token

        self._token = token or load_token()
        self._url = settings.swiggy_mcp_url
        self._active: Optional["_BoundSession"] = None

    @property
    def is_configured(self) -> bool:
        return bool(self._token and self._url)

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        """Call a single Food tool with retry + exponential backoff.

        If a reusable session is open (see `session()`), the call is routed
        through it so the connection/handshake is shared across calls.
        """
        if self._active is not None:
            return await self._active.call_tool(name, arguments)
        if not self._token:
            raise SwiggyAuthError(
                "No Swiggy token available. Set SWIGGY_BOOTSTRAP_TOKEN (Phase 1) "
                "or link a user account (Phase 2)."
            )

        await _await_rate_limit_cooldown(name)

        last_error: Optional[Exception] = None
        for attempt in range(settings.swiggy_max_retries):
            try:
                async with _MCP_SEMAPHORE:  # cap concurrency to avoid 429s
                    return await asyncio.wait_for(
                        self._call_once(name, arguments), timeout=settings.swiggy_timeout_s
                    )
            except SwiggyAuthError:
                raise  # never retry auth failures
            except (SwiggyMCPError, asyncio.TimeoutError, ConnectionError) as exc:
                last_error = exc
                retryable = isinstance(exc, (asyncio.TimeoutError, ConnectionError)) or getattr(
                    exc, "retryable", False
                )
                # 429 (rate limit) backs off much harder than transient errors,
                # and arms the cross-request cooldown for every other caller.
                is_429 = "429" in str(exc)
                if is_429:
                    _arm_rate_limit_cooldown()
                if not retryable or attempt == settings.swiggy_max_retries - 1:
                    break
                base = settings.swiggy_rate_limit_base_ms if is_429 else settings.swiggy_retry_base_ms
                delay = (base / 1000) * (2 ** attempt) + random.uniform(0, 0.3)
                logger.warning(
                    "Swiggy tool '%s' attempt %d failed (%s). Retrying in %.2fs",
                    name, attempt + 1, exc, delay,
                )
                await asyncio.sleep(delay)

        if isinstance(last_error, SwiggyMCPError):
            raise last_error
        raise SwiggyMCPError(f"Swiggy tool '{name}' failed: {last_error}", retryable=True)

    async def _call_once(self, name: str, arguments: dict[str, Any]) -> Any:
        ClientSession, streamablehttp_client = _import_mcp()
        headers = {"Authorization": f"Bearer {self._token}"}  # never logged

        logger.info("→ Swiggy tool '%s' args=%s (url=%s)", name, _preview(arguments, 300), self._url)
        start = time.time()
        try:
            async with streamablehttp_client(self._url, headers=headers) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    result = await session.call_tool(name, arguments)
        except Exception as exc:  # noqa: BLE001 - normalise transport errors
            ms = (time.time() - start) * 1000
            detail = _unwrap_error(exc)  # anyio hides the real cause in an ExceptionGroup
            if _is_auth_failure_text(detail):
                logger.error(
                    "Swiggy token rejected (401) on '%s' in %.0fms. Re-auth with "
                    "`python -m scripts.swiggy_auth --save` (auto-applies, no restart).",
                    name, ms,
                )
                raise SwiggyAuthError(f"Swiggy rejected the token: {detail}") from exc
            logger.warning("✗ Swiggy tool '%s' transport error in %.0fms: %s", name, ms, detail)
            raise SwiggyMCPError(f"Swiggy transport error: {detail}", retryable=True) from exc

        ms = (time.time() - start) * 1000
        is_error = getattr(result, "isError", False)
        logger.info("← Swiggy tool '%s' returned in %.0fms (isError=%s)", name, ms, is_error)
        # Full raw payload only at DEBUG (SWIGGY_DEBUG=true) — this is what you
        # inspect when restaurants/items come back empty (field-name mismatch).
        logger.debug(
            "  raw structuredContent=%s | content=%s",
            _preview(getattr(result, "structuredContent", None)),
            _preview([getattr(b, "text", str(b)) for b in (getattr(result, "content", []) or [])]),
        )

        parsed = _parse_tool_result(result)
        logger.debug("  parsed result for '%s': %s", name, _preview(parsed))
        return parsed

    @asynccontextmanager
    async def session(self) -> "AsyncIterator[_BoundSession]":
        """Open ONE MCP session for a batch of tool calls (e.g. a whole enrich).

        Reuses a single streamable-HTTP connection across calls instead of doing
        the initialize handshake per call (~3x fewer HTTP round-trips), and
        reconnects automatically if the connection breaks (e.g. after a 429).
        """
        if not self._token:
            raise SwiggyAuthError(
                "No Swiggy token available. Set SWIGGY_BOOTSTRAP_TOKEN (Phase 1) "
                "or link a user account (Phase 2)."
            )
        bound = _BoundSession(self._token, self._url)
        self._active = bound
        try:
            yield bound
        finally:
            self._active = None
            await bound.aclose()


class _BoundSession:
    """A reusable MCP session with concurrency limiting + reconnect-on-failure."""

    def __init__(self, token: str, url: str) -> None:
        self._token = token
        self._url = url
        self._stack: Optional[AsyncExitStack] = None
        self._session: Any = None
        self._connect_lock = asyncio.Lock()

    async def _ensure(self) -> None:
        if self._session is not None:
            return
        async with self._connect_lock:
            if self._session is not None:  # another task connected while we waited
                return
            ClientSession, streamablehttp_client = _import_mcp()
            stack = AsyncExitStack()
            try:
                read, write, _ = await stack.enter_async_context(
                    streamablehttp_client(self._url, headers={"Authorization": f"Bearer {self._token}"})
                )
                session = await stack.enter_async_context(ClientSession(read, write))
                await session.initialize()
            except BaseException:
                await stack.aclose()
                raise
            self._stack = stack
            self._session = session
            logger.info("Opened reusable Swiggy MCP session (%s)", self._url)

    async def _reset(self) -> None:
        stack, self._stack, self._session = self._stack, None, None
        if stack is not None:
            try:
                await stack.aclose()
            except Exception:  # noqa: BLE001 - best-effort teardown
                pass

    async def aclose(self) -> None:
        await self._reset()

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        await _await_rate_limit_cooldown(name)

        last_error: Optional[Exception] = None
        for attempt in range(settings.swiggy_max_retries):
            try:
                async with _MCP_SEMAPHORE:
                    await self._ensure()
                    logger.info("→ Swiggy tool '%s' args=%s (session)", name, _preview(arguments, 300))
                    start = time.time()
                    result = await asyncio.wait_for(
                        self._session.call_tool(name, arguments), timeout=settings.swiggy_timeout_s
                    )
                ms = (time.time() - start) * 1000
                logger.info("← Swiggy tool '%s' returned in %.0fms (session)", name, ms)
                logger.debug(
                    "  raw structuredContent=%s",
                    _preview(getattr(result, "structuredContent", None)),
                )
                return _parse_tool_result(result)  # may raise SwiggyMCPError (tool error)
            except SwiggyAuthError:
                raise
            except SwiggyMCPError as exc:
                # Tool-level error — the session is still alive, so don't reconnect.
                last_error = exc
                if "429" in str(exc):
                    _arm_rate_limit_cooldown()
                if not exc.retryable or attempt == settings.swiggy_max_retries - 1:
                    break
                await self._backoff(name, attempt, str(exc), reconnected=False)
            except Exception as exc:  # noqa: BLE001 - transport error: reconnect
                detail = _unwrap_error(exc)
                await self._reset()  # connection likely broken — drop it
                if _is_auth_failure_text(detail):
                    logger.error(
                        "Swiggy token rejected (401) on '%s'. Re-auth with "
                        "`python -m scripts.swiggy_auth --save` — the new token auto-applies "
                        "to new requests (no restart needed).", name,
                    )
                    raise SwiggyAuthError(f"Swiggy rejected the token: {detail}") from exc
                last_error = SwiggyMCPError(f"Swiggy transport error: {detail}", retryable=True)
                if "429" in detail:
                    _arm_rate_limit_cooldown()
                if attempt == settings.swiggy_max_retries - 1:
                    break
                await self._backoff(name, attempt, detail, reconnected=True)

        if isinstance(last_error, SwiggyMCPError):
            raise last_error
        raise SwiggyMCPError(f"Swiggy tool '{name}' failed: {last_error}", retryable=True)

    async def _backoff(self, name: str, attempt: int, detail: str, *, reconnected: bool) -> None:
        is_429 = "429" in detail
        base = settings.swiggy_rate_limit_base_ms if is_429 else settings.swiggy_retry_base_ms
        delay = (base / 1000) * (2 ** attempt) + random.uniform(0, 0.3)
        logger.warning(
            "Swiggy tool '%s' attempt %d failed (%s). %sretrying in %.2fs",
            name, attempt + 1, detail, "reconnecting + " if reconnected else "", delay,
        )
        await asyncio.sleep(delay)


def _unwrap_error(exc: BaseException) -> str:
    """Flatten anyio/MCP ExceptionGroups into a readable 'Type: message' string.

    streamablehttp_client runs inside a TaskGroup, so the useful error (e.g. an
    HTTP 401, connection refused, or protocol error) is nested inside a
    BaseExceptionGroup whose own str() is just 'unhandled errors in a TaskGroup'.
    """
    leaves: list[str] = []

    def walk(e: BaseException) -> None:
        sub = getattr(e, "exceptions", None)
        if sub:  # ExceptionGroup / BaseExceptionGroup
            for child in sub:
                walk(child)
        else:
            leaves.append(f"{type(e).__name__}: {e}")

    walk(exc)
    if not leaves:
        return f"{type(exc).__name__}: {exc}"
    # De-duplicate while preserving order.
    seen: set[str] = set()
    unique = [x for x in leaves if not (x in seen or seen.add(x))]
    return " | ".join(unique)


def _is_auth_failure_text(text: str) -> bool:
    lowered = text.lower()
    return "401" in lowered or "403" in lowered or "unauthorized" in lowered or "forbidden" in lowered
