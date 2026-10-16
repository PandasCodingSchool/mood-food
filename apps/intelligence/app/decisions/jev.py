"""JEV decision client: state + typed questions → calibrated answers.

Thin wrapper over the official async SDK (``typesafe-sdk``) that adds what a
request path needs: a per-call timeout, a circuit breaker, a state-size
guard, telemetry, and ``None`` instead of exceptions — every caller keeps a
deterministic path, so JEV can make things better but never break them.
"""

from __future__ import annotations

import json
import logging
import random
import time
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Iterator, Mapping, Optional

from typesafe_sdk import AsyncTypeSafeClient, Choice, RetryPolicy

from app.config import settings
from app.lab import trace
from app.observability import timed_call

logger = logging.getLogger("decisions")


@dataclass
class Decision:
    """Answers for one ``system_one`` call, keyed by question id."""

    model: str
    nouls: dict[str, float]
    choices: dict[str, tuple[str, dict[str, float], float]]  # (choice, probabilities, confidence)
    scores: dict[str, tuple[float, dict[int, float], float]]  # (score, probabilities, confidence)
    input_tokens: int
    latency_ms: float


class CircuitBreaker:
    def __init__(self, failures: int, cooldown_s: float):
        self.failures_allowed = failures
        self.cooldown_s = cooldown_s
        self.failures = 0
        self.open_until = 0.0

    def allow(self) -> bool:
        return time.monotonic() >= self.open_until

    def success(self) -> None:
        self.failures = 0

    def failure(self) -> None:
        self.failures += 1
        if self.failures >= self.failures_allowed:
            self.open_until = time.monotonic() + self.cooldown_s
            self.failures = 0
            logger.warning("jev circuit open for %.0fs", self.cooldown_s)


class JevClient:
    def __init__(self, sdk: AsyncTypeSafeClient, model: str):
        self.sdk = sdk
        self.model = model
        self.breaker = CircuitBreaker(settings.jev_breaker_failures, settings.jev_breaker_cooldown_s)

    async def decide(
        self,
        kind: str,
        state: Any,
        questions: Mapping[str, Any],
        timeout_s: Optional[float] = None,
    ) -> Optional[Decision]:
        """One request. ``None`` on breaker-open, oversized state, timeout or error."""
        if not questions or not self.breaker.allow():
            trace.emit("jev.skipped", call=kind, reason="no questions" if not questions else "circuit breaker open")
            return None
        size = len(json.dumps(state, default=str))
        if size > settings.jev_max_state_chars:
            logger.warning("jev %s: state too large (%d chars) — skipped", kind, size)
            trace.emit("jev.skipped", call=kind, reason=f"state too large ({size} chars)")
            return None
        start = time.perf_counter()
        try:
            with timed_call(kind, "jev", self.model) as fields:
                resp = await self.sdk.system_one(
                    state=state,
                    questions=dict(questions),
                    timeout=timeout_s or settings.jev_timeout_s,
                )
                fields["tokens"] = resp.usage.input_tokens if resp.usage else None
                fields["questions"] = len(questions)
        except Exception as exc:  # noqa: BLE001 — degrade to the deterministic path
            self.breaker.failure()
            logger.warning("jev %s failed: %s", kind, exc)
            trace.emit("jev.failed", call=kind, error=f"{type(exc).__name__}: {exc}"[:300],
                       latency_ms=round((time.perf_counter() - start) * 1000, 1), breaker_failures=self.breaker.failures)
            return None
        self.breaker.success()
        decision = Decision(
            model=resp.model,
            nouls={k: float(a.noul) for k, a in resp.nouls.items()},
            choices={k: (a.choice, dict(a.probabilities), float(a.confidence)) for k, a in resp.choices.items()},
            scores={
                k: (float(a.score), {int(i): float(p) for i, p in a.probabilities.items()}, float(a.confidence))
                for k, a in resp.scores.items()
            },
            input_tokens=resp.usage.input_tokens if resp.usage else 0,
            latency_ms=round((time.perf_counter() - start) * 1000, 1),
        )
        if trace.enabled():
            trace.emit("jev.call", call=kind, model=decision.model, latency_ms=decision.latency_ms,
                       input_tokens=decision.input_tokens, state=json.loads(json.dumps(state, default=str)),
                       questions={k: _question_view(q) for k, q in questions.items()},
                       nouls=decision.nouls,
                       choices={k: {"choice": c, "probabilities": p, "confidence": conf} for k, (c, p, conf) in decision.choices.items()},
                       scores={k: {"score": sc, "probabilities": p, "confidence": conf} for k, (sc, p, conf) in decision.scores.items()})
        return decision


def _question_view(q: Any) -> dict[str, Any]:
    """A question as plain JSON for the lab (SDK models or dicts)."""
    if hasattr(q, "model_dump"):
        out = q.model_dump(mode="json")
    elif isinstance(q, dict):
        out = q
    else:
        out = {"instructions": getattr(q, "instructions", str(q)), "criteria": getattr(q, "criteria", None)}
    return {"type": type(q).__name__.lower(), **json.loads(json.dumps(out, default=str))}


_client: Optional[JevClient] = None
# Lab "JEV off" replays: switched per request (ContextVar), never globally.
_off: ContextVar[bool] = ContextVar("jev_off", default=False)


@contextmanager
def switched_off() -> Iterator[None]:
    """Within this context, `get_client()` returns None (every caller takes its non-JEV path)."""
    token = _off.set(True)
    try:
        yield
    finally:
        _off.reset(token)


def get_client() -> Optional[JevClient]:
    """Shared client, or ``None`` when no key is configured (or switched off for this request)."""
    global _client
    if not settings.jev_api_key or _off.get():
        return None
    if _client is None:
        sdk = AsyncTypeSafeClient(
            api_key=settings.jev_api_key,
            base_url=settings.jev_base_url,
            model=settings.jev_model,
            retry=RetryPolicy(max_retries=1, backoff_initial=0.2, backoff_max=0.5),
            timeout=settings.jev_timeout_s,
        )
        _client = JevClient(sdk, settings.jev_model)
    return _client


def shuffled_choice(instructions: Any, options: Mapping[str, Any], seed: str) -> Choice:
    """A Choice with options in a seeded order.

    Jev 1.13 has an option-order bias; a stable per-request shuffle spreads it
    out instead of always favouring whatever the shortlist put first.
    """
    keys = list(options)
    random.Random(seed).shuffle(keys)
    return Choice(instructions=instructions, criteria={k: options[k] for k in keys})
