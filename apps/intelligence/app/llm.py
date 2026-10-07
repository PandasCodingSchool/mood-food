"""Shared OpenAI access: one client, model names from config, timeouts, telemetry.

Call sites keep LangChain message objects for prompt building but go through
``JsonChat.ainvoke`` so request parameters stay under our control (e.g.
``max_completion_tokens`` for current models) and every call is timed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Iterable, Optional

from openai import AsyncOpenAI

from app.config import settings
from app.observability import timed_call

_ROLES = {"system": "system", "human": "user", "user": "user", "ai": "assistant", "assistant": "assistant"}


@lru_cache(maxsize=1)
def async_openai() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=settings.openai_api_key or None,
        timeout=settings.llm_timeout_s,
        max_retries=1,
    )


def _as_message(m: Any) -> dict:
    if isinstance(m, dict):
        return m
    return {"role": _ROLES.get(getattr(m, "type", "user"), "user"), "content": m.content}


def sampling_kwargs(temperature: Optional[float]) -> dict:
    """Temperature only when the configured model accepts it."""
    if temperature is None or not settings.openai_supports_temperature:
        return {}
    return {"temperature": temperature}


@dataclass
class LLMResult:
    content: str
    response_metadata: dict = field(default_factory=dict)


@dataclass
class JsonChat:
    """Async chat completion returning text (JSON mode by default)."""

    model: str
    kind: str
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    timeout_s: Optional[float] = None
    json_mode: bool = True

    async def ainvoke(self, messages: Iterable[Any]) -> LLMResult:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": [_as_message(m) for m in messages],
            **sampling_kwargs(self.temperature),
        }
        if self.json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        if self.max_tokens:
            kwargs["max_completion_tokens"] = self.max_tokens
        if self.timeout_s:
            kwargs["timeout"] = self.timeout_s
        with timed_call(self.kind, "openai", self.model) as fields:
            resp = await async_openai().chat.completions.create(**kwargs)
            usage = resp.usage.model_dump() if resp.usage else {}
            fields["tokens"] = usage.get("total_tokens")
        return LLMResult(
            content=resp.choices[0].message.content or "",
            response_metadata={"token_usage": usage, "model_name": resp.model},
        )


async def parse_structured(kind: str, model: str, messages: list[dict], schema: type, temperature: Optional[float] = None):
    """Structured output (Pydantic ``schema``). Raises if the model refuses."""
    with timed_call(kind, "openai", model) as fields:
        completion = await async_openai().chat.completions.parse(
            model=model,
            messages=messages,
            response_format=schema,
            **sampling_kwargs(temperature),
        )
        if completion.usage:
            fields["tokens"] = completion.usage.total_tokens
    parsed = completion.choices[0].message.parsed
    if parsed is None:
        raise ValueError(f"{kind}: model refused or returned no parsed output")
    return parsed
