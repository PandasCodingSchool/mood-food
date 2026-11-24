"""Voice for the KitchenCircle chat: speech → text, then the same agent loop as a typed message.

The transcriber gets the household's recipe titles as a hint, so dish names ("rajma chawal", "pav bhaji") come out
spelled the way the recipe book spells them; Hindi/English mixing is left to the model's language detection.

The hint has a cost: on near-silence or noise the model "transcribes" the hint itself — a whole invented week of
dishes (measured 2026-10-29: a quiet clip came back as "On Monday, make Dal Tadka with Jeera Rice…", 0.67
confidence; real speech scores ~0.99). So a doubtful transcript — low token confidence, or more words than the clip
could hold — is checked again without the hint. Silence then comes back empty ("didn't catch that") instead of acting.
"""

from __future__ import annotations

import base64
import binascii
import logging
import math
from typing import Optional

from pydantic import BaseModel, Field

from app.config import settings
from app.lab import trace
from app.llm import LLMUnavailable, async_openai
from app.observability import timed_call

logger = logging.getLogger("kitchen_circle.voice")

MAX_AUDIO_BYTES = 8 * 1024 * 1024  # ~ several minutes of compressed speech; chat clips are capped far lower by the app
_EXT = {"audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/mp4": "m4a", "audio/aac": "m4a", "audio/webm": "webm", "audio/ogg": "ogg",
        "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/3gpp": "3gp"}


class TranscribeRequest(BaseModel):
    audio_base64: str = Field(min_length=16)
    mime_type: str = Field(default="audio/m4a", max_length=60)
    hints: list[str] = Field(default_factory=list, max_length=300)  # recipe titles
    seconds: Optional[float] = Field(default=None, ge=0, le=600)  # clip length from the app, for the words-per-second check


class TranscribeResponse(BaseModel):
    text: str
    model: str
    confidence: Optional[float] = None  # geometric-mean token probability of the hinted pass
    checked: bool = False  # True when a doubtful transcript was re-checked without the hint


MIN_CONFIDENCE = 0.9  # measured: hinted silence 0.67–0.84; real speech 0.80–0.99 (Hinglish lower) — below this, re-check
MAX_WORDS_PER_SECOND = 3.5  # fast speech is ~3 words/s


def _confidence(result) -> Optional[float]:
    probs = [t.logprob for t in (getattr(result, "logprobs", None) or []) if getattr(t, "logprob", None) is not None]
    return round(math.exp(sum(probs) / len(probs)), 3) if probs else None


def doubtful(text: str, confidence: Optional[float], seconds: Optional[float]) -> bool:
    """A transcript to re-check without the hint: the model wasn't sure, or it says more than the clip could hold."""
    words = len(text.split())
    too_long = bool(seconds) and words > seconds * MAX_WORDS_PER_SECOND + 4
    return (confidence is not None and confidence < MIN_CONFIDENCE) or too_long


def settle(hinted: str, plain: str) -> str:
    """Pick the words after a re-check. Nothing heard without the hint → nothing was said. Otherwise keep the hinted
    spelling unless the hint added a lot that the plain pass never heard."""
    plain_words, hinted_words = len(plain.split()), len(hinted.split())
    if plain_words < 2:
        return ""
    return plain if hinted_words > 2 * plain_words + 4 else hinted


_STYLE = ("A member of an Indian household is telling the family meal planner (called Haldi) what to cook on which days. "
          "They may mix English and Hindi. Write it the way they would type it in a chat: Hindi words in Latin letters "
          "(Hinglish), English words in English.")  # without this, Hinglish comes back in Devanagari


def _prompt(hints: list[str]) -> str:
    names = ", ".join(dict.fromkeys(h.strip() for h in hints if h.strip()))[:600]
    return f"{_STYLE} Dishes they often mention: {names}." if names else _STYLE


async def transcribe(req: TranscribeRequest) -> Optional[TranscribeResponse]:
    if not settings.openai_api_key:
        raise LLMUnavailable("OPENAI_API_KEY is not set")
    try:
        audio = base64.b64decode(req.audio_base64.split(",", 1)[-1], validate=False)
    except (binascii.Error, ValueError):
        return None
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        return None
    mime = req.mime_type.split(";", 1)[0].strip().lower()
    model = settings.kitchen_circle_transcribe_model
    file = (f"voice.{_EXT.get(mime, 'm4a')}", audio, mime or "audio/m4a")

    async def run(prompt: Optional[str]):
        extra = {"prompt": prompt} if prompt else {}
        with timed_call("kitchen_circle_transcribe", "openai", model) as fields:
            result = await async_openai().audio.transcriptions.create(model=model, file=file, response_format="json", include=["logprobs"], **extra)
            fields["bytes"] = len(audio)
        return " ".join((getattr(result, "text", "") or "").split()), _confidence(result)

    text, confidence = await run(_prompt(req.hints))
    checked = doubtful(text, confidence, req.seconds)
    if checked:
        plain, _ = await run(None)
        text = settle(text, plain)
    trace.emit("kitchen_circle.voice", model=model, bytes=len(audio), chars=len(text), confidence=confidence, checked=checked, seconds=req.seconds)
    return TranscribeResponse(text=text, model=model, confidence=confidence, checked=checked)


# ── read-aloud ─────────────────────────────────────────────────────────────
LANGUAGE_NAMES = {"en": "English (Indian accent)", "hi": "Hindi", "hinglish": "Hinglish (Hindi in Latin script, Indian accent)", "mr": "Marathi",
                  "ta": "Tamil", "te": "Telugu", "bn": "Bengali", "kn": "Kannada"}


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    language: str = Field(default="en", max_length=12)


async def speak(req: SpeakRequest) -> bytes:
    """Recipe text → speech (mp3) in the cook's language. Callers cache by text; this never stores anything."""
    if not settings.openai_api_key:
        raise LLMUnavailable("OPENAI_API_KEY is not set")
    language = LANGUAGE_NAMES.get(req.language, "English (Indian accent)")
    model = settings.kitchen_circle_tts_model
    with timed_call("kitchen_circle_speak", "openai", model) as fields:
        response = await async_openai().audio.speech.create(
            model=model, voice=settings.kitchen_circle_tts_voice, input=req.text, response_format="mp3",
            instructions=(f"Speak in {language}. Warm, clear and unhurried — the listener is cooking with their hands busy. "
                          "Read quantities naturally (0.5 as half) and unit abbreviations (g, kg, ml, tsp, tbsp) as full words in that language."))
        audio = response.read()
        fields["chars"] = len(req.text)
    trace.emit("kitchen_circle.speak", model=model, language=req.language, chars=len(req.text), bytes=len(audio))
    return audio
