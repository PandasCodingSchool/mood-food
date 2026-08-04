"""DIY recipe generation (dish name -> structured Recipe).

Uses the OpenAI SDK directly (not LangChain) with Pydantic response_format —
the same pattern validated in the recipe-agent notebook. This is a single
deterministic extraction call with no tool-calling or multi-step planning, so
a raw structured-output call is the right tool (see recipe_agent.ipynb intro).
"""

from __future__ import annotations

import hashlib
import logging
import time
from typing import Optional

from app.config import settings
from app.schemas.recipe import Recipe

logger = logging.getLogger("recipe_generator")

_RECIPE_MODEL = "gpt-4o-2024-08-06"  # any model that supports structured outputs

_SYSTEM_PROMPT = (
    "You are an expert chef. Given a dish name, produce a clear, authentic recipe.\n"
    "- List every ingredient with a realistic quantity and unit.\n"
    "- Write concise, ordered, beginner-friendly steps.\n"
    "- Assume standard kitchen equipment."
)

_CACHE: dict[str, tuple[float, Recipe]] = {}
_CACHE_TTL_S = 3600.0
_CACHE_MAX = 256


def _cache_key(dish: str, servings: int) -> str:
    canonical = f"{dish.strip().lower()}|{servings}"
    return hashlib.sha256(canonical.encode()).hexdigest()


def _cache_get(key: str) -> Optional[Recipe]:
    entry = _CACHE.get(key)
    if not entry:
        return None
    expires, recipe = entry
    if expires < time.time():
        _CACHE.pop(key, None)
        return None
    return recipe


def _cache_put(key: str, recipe: Recipe) -> None:
    if len(_CACHE) >= _CACHE_MAX:
        oldest = min(_CACHE.items(), key=lambda kv: kv[1][0])[0]
        _CACHE.pop(oldest, None)
    _CACHE[key] = (time.time() + _CACHE_TTL_S, recipe)


def get_recipe(dish: str, servings: int = 2) -> Recipe:
    """Return a structured Recipe for the given dish. Raises on failure."""
    key = _cache_key(dish, servings)
    if (cached := _cache_get(key)) is not None:
        return cached

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    start = time.time()
    completion = client.beta.chat.completions.parse(
        model=_RECIPE_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Give me a recipe for {dish} that serves {servings}."},
        ],
        response_format=Recipe,
        temperature=0.4,
    )
    recipe = completion.choices[0].message.parsed
    if recipe is None:
        raise ValueError("Model refused or returned no parsed recipe")

    elapsed = round(time.time() - start, 2)
    logger.info("get_recipe(%r, servings=%d) -> %d ingredients, %d steps in %.2fs",
                dish, servings, len(recipe.items), len(recipe.steps), elapsed)
    _cache_put(key, recipe)
    return recipe
