"""Runtime Swiggy token store.

Swiggy v1 issues no refresh token — an expired token requires the full
interactive OAuth (phone + OTP). To keep the service running without a restart
after re-auth, the freshly minted token is written to a JSON store file
(`SWIGGY_TOKEN_FILE`). `load_token()` prefers a *valid* token from that file and
falls back to `SWIGGY_BOOTSTRAP_TOKEN`. New requests build a client that reads
the latest token, so a single `scripts.swiggy_auth --save` re-auth heals the
service live.
"""

from __future__ import annotations

import base64
import binascii
import json
import logging
import time
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger("swiggy_token")

# Treat a token as unusable once it's within this many seconds of expiry.
_EXP_SKEW_S = 60


def token_expiry(token: str) -> int:
    """Return the JWT `exp` (unix seconds), or 0 if it can't be parsed."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
        return int(data.get("exp", 0))
    except (IndexError, ValueError, binascii.Error, json.JSONDecodeError):
        return 0


def _is_valid(token: str) -> bool:
    if not token:
        return False
    exp = token_expiry(token)
    # exp==0 means we couldn't parse it — let the server be the judge (don't block).
    return exp == 0 or exp > time.time() + _EXP_SKEW_S


def load_token() -> str:
    """Return the best available token: valid stored token, else env bootstrap."""
    path = settings.swiggy_token_file
    if path and Path(path).exists():
        try:
            stored = json.loads(Path(path).read_text()).get("access_token", "")
        except (OSError, json.JSONDecodeError):
            stored = ""
        if _is_valid(stored):
            return stored
    return settings.swiggy_bootstrap_token


def save_token(access_token: str, **extra) -> Optional[str]:
    """Persist a freshly minted token so the live service picks it up."""
    path = settings.swiggy_token_file
    if not path:
        return None
    payload = {"access_token": access_token, "saved_at": int(time.time()), **extra}
    Path(path).write_text(json.dumps(payload, indent=2))
    logger.info("Saved Swiggy token to %s (exp=%s)", path, token_expiry(access_token))
    return path


def token_status() -> dict:
    """Diagnostics for the /status endpoint."""
    token = load_token()
    exp = token_expiry(token)
    return {
        "has_token": bool(token),
        "expires_at": exp or None,
        "expired": bool(token) and exp != 0 and exp <= time.time(),
        "seconds_left": max(0, exp - int(time.time())) if exp else None,
    }
