"""Cook-view translation: show a meal in the cook's language without ever changing quantities.

Quantities and units come from canonical recipe data and are rendered by the API; the model only
translates words (dish title, ingredient names, unit words, method steps). Every output is checked:
same item counts, and each step keeps exactly the digits of its source. Anything that fails a check
falls back to the English original for that item, and a failed call falls back to English entirely.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.config import settings
from app.lab import trace
from app.llm import LLMUnavailable, parse_structured

logger = logging.getLogger("kitchen_circle.translate")

Language = Literal["en", "hi", "hinglish", "mr", "ta", "te", "bn", "kn"]
LANGUAGE_NAMES = {
    "en": "English", "hi": "Hindi", "hinglish": "Hinglish (Hindi written in English letters)", "mr": "Marathi",
    "ta": "Tamil", "te": "Telugu", "bn": "Bengali", "kn": "Kannada",
}
# Script each language is shown in by default (Hinglish is already Latin).
NATIVE_SCRIPT = {"hi": "Devanagari", "mr": "Devanagari", "ta": "Tamil", "te": "Telugu", "bn": "Bengali", "kn": "Kannada"}


class CookIngredient(BaseModel):
    name: str
    unit: str = ""


class CookMeal(BaseModel):
    key: str  # stable id, e.g. the recipe version
    title: str
    ingredients: list[CookIngredient] = Field(default_factory=list, max_length=80)
    steps: list[str] = Field(default_factory=list, max_length=60)


class TranslateRequest(BaseModel):
    language: Language
    transliterate: bool = False  # “Show in English letters”
    meals: list[CookMeal] = Field(max_length=14)
    allow_llm: bool = True


class TranslatedMeal(BaseModel):
    key: str
    title: str
    ingredients: list[CookIngredient]
    steps: list[str]
    translated: bool  # false = English fallback for this meal


class TranslateResponse(BaseModel):
    language: Language
    transliterate: bool
    meals: list[TranslatedMeal]
    status: Literal["ok", "partial", "fallback", "not_needed"]


class _LlmMeal(BaseModel):
    key: str
    title: str
    ingredient_names: list[str]
    unit_words: list[str]
    steps: list[str]


class _LlmOut(BaseModel):
    meals: list[_LlmMeal]


_DIGITS = re.compile(r"\d+(?:[.,]\d+)?")


def _same_numbers(source: str, translated: str) -> bool:
    return sorted(_DIGITS.findall(source)) == sorted(_DIGITS.findall(translated))


def _english(meal: CookMeal) -> TranslatedMeal:
    return TranslatedMeal(key=meal.key, title=meal.title, ingredients=meal.ingredients, steps=meal.steps, translated=False)


def _merge(meal: CookMeal, out: Optional[_LlmMeal]) -> TranslatedMeal:
    """Accept the model's words only where they line up with the source; otherwise keep English."""
    if out is None or len(out.ingredient_names) != len(meal.ingredients) or len(out.unit_words) != len(meal.ingredients) or len(out.steps) != len(meal.steps):
        return _english(meal)
    ingredients = [
        CookIngredient(name=(name.strip() or src.name), unit=(unit.strip() or src.unit) if src.unit else "")
        for src, name, unit in zip(meal.ingredients, out.ingredient_names, out.unit_words)
    ]
    steps = [t.strip() if t.strip() and _same_numbers(s, t) else s for s, t in zip(meal.steps, out.steps)]
    return TranslatedMeal(key=meal.key, title=out.title.strip() or meal.title, ingredients=ingredients, steps=steps, translated=True)


def _prompt(req: TranslateRequest) -> str:
    target = LANGUAGE_NAMES[req.language]
    if req.language == "hinglish":
        script = "Latin letters (Hinglish)"
    elif req.transliterate:
        script = f"English/Latin letters (transliterated {target}, not translated to English)"
    else:
        script = f"the native {NATIVE_SCRIPT.get(req.language, '')} script"
    return (
        f"Translate this home-cooking content for a cook into {target}, written in {script}. "
        "Use everyday kitchen words a home cook in India would use (e.g. common local names for vegetables and spices). "
        "Translate: each meal title, each ingredient name, each unit word, and each method step. "
        "Keep every number exactly as written, keep the same number of items in the same order, add nothing, and never "
        "convert or change quantities. Return one entry per meal with the same key."
    )


async def translate(req: TranslateRequest) -> TranslateResponse:
    if req.language == "en" or not req.meals:
        return TranslateResponse(language=req.language, transliterate=req.transliterate, meals=[_english(m) for m in req.meals], status="not_needed")
    source = [{"key": m.key, "title": m.title, "ingredient_names": [i.name for i in m.ingredients],
               "unit_words": [i.unit for i in m.ingredients], "steps": m.steps} for m in req.meals]
    out: Optional[_LlmOut] = None
    if req.allow_llm:
        try:
            out = await parse_structured("kitchen_circle_translate", settings.openai_mini_model,
                                         [{"role": "system", "content": _prompt(req)}, {"role": "user", "content": json.dumps(source, ensure_ascii=False)}], _LlmOut, temperature=0)
        except LLMUnavailable:
            out = None
        except Exception as exc:  # noqa: BLE001 — the cook must still see the meal
            logger.warning("cook translation failed: %s", exc)
            out = None
    by_key = {m.key: m for m in out.meals} if out else {}
    meals = [_merge(m, by_key.get(m.key)) for m in req.meals]
    translated = sum(m.translated for m in meals)
    status = "fallback" if translated == 0 else "ok" if translated == len(meals) else "partial"
    trace.emit("kitchen_circle.translate", language=req.language, transliterate=req.transliterate, meals=len(meals), status=status)
    return TranslateResponse(language=req.language, transliterate=req.transliterate, meals=meals, status=status)
