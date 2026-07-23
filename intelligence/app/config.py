import json

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    # Lightweight model for fast mid-game assists (option copy, flavor text).
    openai_mini_model: str = "gpt-4o-mini"
    unsplash_access_key: str = ""

    # --- Swiggy MCP (Food server) ---
    # Streamable-HTTP MCP endpoint. See https://mcp.swiggy.com/builders
    swiggy_mcp_url: str = "https://mcp.swiggy.com/food"
    # Phase 1: a single service/bootstrap account token (OAuth'd once) used to
    # power discovery. Tokens last 5 days with no refresh in v1 — re-auth via ops.
    swiggy_bootstrap_token: str = ""
    # Runtime token store (JSON). A freshly minted token written here is picked
    # up by new requests WITHOUT restarting the service. Takes precedence over
    # SWIGGY_BOOTSTRAP_TOKEN when it holds a valid (unexpired) token.
    swiggy_token_file: str = "swiggy_token.json"
    # JSON object mapping a lowercase city name -> the bootstrap account's saved
    # Swiggy addressId, e.g. {"bangalore": "addr_123", "mumbai": "addr_456"}.
    swiggy_city_address_map: str = "{}"
    # Default city used when the caller does not specify one.
    swiggy_default_city: str = ""
    # MCP call resiliency (ship-to-production guidance: 500ms base, max 4 attempts).
    swiggy_max_retries: int = 4
    swiggy_retry_base_ms: int = 500
    swiggy_timeout_s: float = 20.0
    # Cap concurrent MCP HTTP calls to avoid 429s (Swiggy: ~120 req/min/user).
    swiggy_max_concurrency: int = 3
    # 429 responses back off much harder than transient errors.
    swiggy_rate_limit_base_ms: int = 1500
    # Once a 429 is detected, all subsequent Swiggy calls (this request and the
    # next) wait out this cooldown up front instead of re-discovering the rate
    # limit via their own retry loop. Dev-mode default; tune via env if needed.
    swiggy_rate_limit_cooldown_s: float = 8.0
    # When true, logs full raw tool requests/responses (DEBUG level). Helpful for
    # diagnosing why restaurants/items aren't coming back (e.g. response-shape
    # mismatches). Leave off in production — payloads can be large.
    swiggy_debug: bool = False
    # When false (default — the user's address hasn't been retrieved yet),
    # resolve_address_id will NOT fall through to a live get_addresses call once
    # explicit address_id / city map lookups are exhausted; it raises
    # SwiggyAddressRequiredError instead so callers can prompt for an address.
    # When true, it kicks off the live get_addresses lookup as a last resort.
    swiggy_address_retrieval_enabled: bool = False
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def swiggy_city_addresses(self) -> dict[str, str]:
        try:
            parsed = json.loads(self.swiggy_city_address_map or "{}")
            return {str(k).lower(): str(v) for k, v in parsed.items()}
        except (json.JSONDecodeError, AttributeError):
            return {}


settings = Settings()
