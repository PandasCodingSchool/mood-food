"""DIY recipe generation schemas.

Mirrors the structured-output shape from the recipe-agent notebook: a dish
name in, a Recipe (ingredients + ordered steps) out, via
client.beta.chat.completions.parse with this Pydantic model as response_format.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class Ingredient(BaseModel):
    name: str = Field(..., description="Ingredient name, e.g. 'ground beef'")
    quantity: str = Field(..., description="Amount as a string, e.g. '500' or '2'")
    unit: str = Field(..., description="Unit of measure, e.g. 'g', 'cup', 'tbsp', 'piece'")
    notes: Optional[str] = Field(
        None, description="Optional prep note, e.g. 'finely chopped', 'to taste'"
    )


class Recipe(BaseModel):
    dish: str = Field(..., description="The dish name")
    servings: int = Field(..., description="Number of servings this recipe yields")
    items: list[Ingredient] = Field(..., description="Structured list of ingredients required")
    steps: list[str] = Field(..., description="Ordered cooking steps")


class RecipeRequest(BaseModel):
    dish: str
    servings: int = 2


class RecipeResponse(BaseModel):
    success: bool
    recipe: Optional[Recipe] = None
    error: Optional[str] = None
