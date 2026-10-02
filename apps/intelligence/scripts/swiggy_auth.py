"""Mint a Swiggy MCP access token via the OAuth 2.1 + PKCE flow.

Automates the flow from the reference notebook:
  1. Dynamic client registration  (POST /auth/register)
  2. PKCE verifier/challenge
  3. Open the browser to /auth/authorize (you log in with phone + OTP)
  4. A local callback server captures ?code=...
  5. Exchange the code for an access token  (POST /auth/token)

Prints the access_token to paste into SWIGGY_BOOTSTRAP_TOKEN, and (with
--addresses) lists your saved addressIds so you can build SWIGGY_CITY_ADDRESS_MAP.

Usage:
    cd intelligence
    .venv/bin/python -m scripts.swiggy_auth                # mint a token
    .venv/bin/python -m scripts.swiggy_auth --addresses    # token + list addresses

Note: tokens last ~5 days (expires_in=432000) with no refresh in v1 — re-run
this when discovery starts returning 401.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import secrets
import threading
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer

import httpx

AUTH_BASE = "https://mcp.swiggy.com"


def _pkce() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    return verifier, challenge


def _register(redirect_uri: str) -> str:
    resp = httpx.post(
        f"{AUTH_BASE}/auth/register",
        json={
            "client_name": "MoodFood MCP Client",
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        },
        timeout=30,
    )
    resp.raise_for_status()
    client_id = resp.json()["client_id"]
    print(f"Registered client_id={client_id}")
    return client_id


class _CallbackHandler(BaseHTTPRequestHandler):
    captured: dict[str, str] = {}

    def do_GET(self):  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/callback":
            self.send_response(404)
            self.end_headers()
            return
        params = urllib.parse.parse_qs(parsed.query)
        _CallbackHandler.captured = {k: v[0] for k, v in params.items()}
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h2>MoodFood: Swiggy authorization received.</h2>"
                         b"<p>You can close this tab and return to the terminal.</p>")

    def log_message(self, *args):  # silence the default stderr logging
        pass


def _wait_for_code(port: int, state: str) -> str:
    server = HTTPServer(("localhost", port), _CallbackHandler)
    print(f"Waiting for the OAuth callback on http://localhost:{port}/callback ...")
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        while "code" not in _CallbackHandler.captured:
            server.handle_request()  # blocks per-request; loop until code arrives
    finally:
        server.shutdown()
    captured = _CallbackHandler.captured
    if captured.get("state") != state:
        raise SystemExit(f"State mismatch (CSRF): expected {state}, got {captured.get('state')}")
    return captured["code"]


def _exchange(code: str, verifier: str, redirect_uri: str) -> dict:
    resp = httpx.post(
        f"{AUTH_BASE}/auth/token",
        json={
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": redirect_uri,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _list_addresses(token: str) -> None:
    import asyncio
    from app.services.swiggy_mcp import SwiggyMCPClient

    async def go():
        client = SwiggyMCPClient(token=token)
        data = await client.call_tool("get_addresses", {})
        addresses = (data or {}).get("addresses", []) if isinstance(data, dict) else []
        print(f"\n{len(addresses)} saved addresses (use the id in SWIGGY_CITY_ADDRESS_MAP):")
        for a in addresses:
            print(f"  - [{a.get('addressTag') or a.get('addressCategory')}] id={a.get('id')} :: {a.get('addressLine')}")

    asyncio.run(go())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8723, help="local callback port")
    parser.add_argument("--addresses", action="store_true", help="also list saved addresses")
    parser.add_argument("--save", action="store_true",
                        help="write the token to SWIGGY_TOKEN_FILE so the running service picks it up")
    args = parser.parse_args()

    redirect_uri = f"http://localhost:{args.port}/callback"
    client_id = _register(redirect_uri)
    verifier, challenge = _pkce()
    state = secrets.token_urlsafe(16)

    authorize_url = f"{AUTH_BASE}/auth/authorize?" + urllib.parse.urlencode({
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
        "scope": "mcp:tools",
    })

    print("\nOpening the Swiggy authorization page in your browser...")
    print(f"If it doesn't open, visit:\n{authorize_url}\n")
    webbrowser.open(authorize_url)

    code = _wait_for_code(args.port, state)
    print("Authorization code received — exchanging for a token...")
    token_data = _exchange(code, verifier, redirect_uri)

    access_token = token_data["access_token"]
    print("\n" + "=" * 70)
    print("ACCESS TOKEN (set as SWIGGY_BOOTSTRAP_TOKEN):\n")
    print(access_token)
    print("\n" + "=" * 70)
    print(f"expires_in={token_data.get('expires_in')}s  user_id={token_data.get('user_id')}")

    if args.save:
        from app.services.swiggy_token import save_token

        path = save_token(
            access_token,
            user_id=token_data.get("user_id"),
            expires_in=token_data.get("expires_in"),
        )
        print(f"\n✓ Saved to {path} — the running service will use it on the next request (no restart).")

    if args.addresses:
        _list_addresses(access_token)


if __name__ == "__main__":
    main()
