"""Service-to-service auth. The API is the only caller; browsers never reach us.

Both secrets fail closed in production: an unset key there is a deploy error,
not an invitation. In development an unset key disables the check.
"""

from __future__ import annotations

import hmac
from typing import Optional

from fastapi import Header, HTTPException

from app.config import settings


def _is_production() -> bool:
    return settings.environment.lower() == "production"


def _matches(provided: Optional[str], expected: str) -> bool:
    return bool(provided) and hmac.compare_digest(provided.encode(), expected.encode())


def require_service_key(authorization: Optional[str] = Header(default=None)) -> None:
    """``Authorization: Bearer <AI_SERVICE_KEY>`` on every API route."""
    expected = settings.ai_service_key
    if not expected:
        if _is_production():
            raise HTTPException(status_code=503, detail="Service key not configured")
        return
    if not _matches(authorization, f"Bearer {expected}"):
        raise HTTPException(status_code=401, detail="Unauthorized")


def require_sync_key(x_sync_key: Optional[str] = Header(default=None)) -> None:
    """``x-sync-key`` for learning-layer routes that read or write per-user state."""
    expected = settings.sync_key
    if not expected:
        if _is_production():
            raise HTTPException(status_code=403, detail="Forbidden")
        return
    if not _matches(x_sync_key, expected):
        raise HTTPException(status_code=403, detail="Forbidden")
