"""Check the configured OpenAI models against what our call sites need.

    python scripts/openai_smoke.py

Verifies, for OPENAI_MODEL / OPENAI_MINI_MODEL / OPENAI_VISION_MODEL:
model exists, JSON mode + max_completion_tokens, whether `temperature` is
accepted (sets OPENAI_SUPPORTS_TEMPERATURE), structured output, and vision.
Makes a handful of tiny paid calls.
"""

from __future__ import annotations

import asyncio
import base64
import sys
import time
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from pydantic import BaseModel  # noqa: E402

from app.config import settings  # noqa: E402
from app.llm import async_openai  # noqa: E402


class Verdict(BaseModel):
    is_food: bool
    reason: str


def _png(rgb=(200, 120, 40), size=8) -> bytes:
    """A tiny solid-colour PNG, enough to prove the vision path accepts images."""
    raw = b"".join(b"\x00" + bytes(rgb) * size for _ in range(size))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return len(data).to_bytes(4, "big") + kind + data + zlib.crc32(kind + data).to_bytes(4, "big")

    header = size.to_bytes(4, "big") * 2 + b"\x08\x02\x00\x00\x00"
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


async def check(label: str, coro) -> bool:
    t0 = time.perf_counter()
    try:
        detail = await coro
        print(f"  ✓ {label:<34} {round((time.perf_counter() - t0) * 1000)} ms  {detail or ''}")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"  ✗ {label:<34} {type(exc).__name__}: {str(exc)[:160]}")
        return False


async def main() -> int:
    if not settings.openai_api_key:
        print("OPENAI_API_KEY is not set")
        return 1
    client = async_openai()
    msgs = [{"role": "user", "content": 'Reply with JSON {"ok": true}'}]
    failures = 0

    for model in sorted({settings.openai_model, settings.openai_mini_model}):
        print(f"\n{model}")

        async def exists():
            m = await client.models.retrieve(model)
            return m.id

        async def json_mode():
            r = await client.chat.completions.create(
                model=model, messages=msgs, response_format={"type": "json_object"}, max_completion_tokens=50,
            )
            return r.choices[0].message.content

        async def temperature():
            await client.chat.completions.create(model=model, messages=msgs, temperature=0.3, max_completion_tokens=20)

        async def structured():
            r = await client.chat.completions.parse(
                model=model,
                messages=[{"role": "user", "content": "Is a samosa food? One short reason."}],
                response_format=Verdict,
            )
            return r.choices[0].message.parsed

        failures += not await check("model exists", exists())
        failures += not await check("json_object + max_completion_tokens", json_mode())
        failures += not await check("structured output (.parse)", structured())
        if not await check("accepts temperature", temperature()):
            print("    → set OPENAI_SUPPORTS_TEMPERATURE=false")

    vision = settings.openai_vision_model
    print(f"\n{vision} (vision)")

    async def vision_call():
        b64 = base64.b64encode(_png()).decode()
        r = await client.chat.completions.parse(
            model=vision,
            messages=[{"role": "user", "content": [
                {"type": "text", "text": "Is this a photo of food?"},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
            ]}],
            response_format=Verdict,
        )
        return r.choices[0].message.parsed

    failures += not await check("image input + structured output", vision_call())
    print("\nOK" if not failures else f"\n{failures} check(s) failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
