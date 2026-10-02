from __future__ import annotations

import logging

from fastapi import APIRouter

from app.schemas.recipe import RecipeRequest, RecipeResponse
from app.services.recipe_generator import get_recipe

logger = logging.getLogger("recipe_routes")
router = APIRouter(prefix="/api/recipe", tags=["recipe"])


@router.post("/generate", response_model=RecipeResponse)
async def generate(req: RecipeRequest) -> RecipeResponse:
    try:
        recipe = get_recipe(req.dish, req.servings)
        return RecipeResponse(success=True, recipe=recipe)
    except Exception as exc:  # noqa: BLE001 - surface any generation failure cleanly
        logger.warning("recipe generation failed for %r: %s", req.dish, exc)
        return RecipeResponse(success=False, error=str(exc))
