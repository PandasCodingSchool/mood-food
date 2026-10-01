"""Food-only image gate for DIY wall photo uploads.

Strict, no-exceptions classifier: a photo is only accepted onto the wall if
GPT-4o vision confirms it depicts food. Anything else — people, screenshots,
random objects — is rejected before it ever reaches storage.
"""

from __future__ import annotations

import base64
import logging

from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger("image_moderation")

_VISION_MODEL = "gpt-4o-2024-08-06"

_SYSTEM_PROMPT = (
    "You are a strict content classifier for a cooking app's photo wall. "
    "Look at the image and decide if it clearly shows food or a cooked/prepared "
    "dish. Be strict: reject people, screenshots, text, random objects, or "
    "anything that is not plainly food."
)


class FoodPhotoClassification(BaseModel):
    is_food: bool = Field(..., description="True only if the image clearly shows food")
    reason: str = Field(..., description="One short sentence explaining the decision")


def is_food_photo(image_bytes: bytes, mime_type: str = "image/jpeg") -> FoodPhotoClassification:
    """Classify whether image_bytes depicts food. Raises on API failure."""
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    b64 = base64.b64encode(image_bytes).decode("utf-8")

    completion = client.beta.chat.completions.parse(
        model=_VISION_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Is this a photo of food?"},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64}"}},
                ],
            },
        ],
        response_format=FoodPhotoClassification,
        temperature=0.0,
    )
    result = completion.choices[0].message.parsed
    if result is None:
        raise ValueError("Model refused or returned no classification")
    logger.info("is_food_photo -> is_food=%s reason=%r", result.is_food, result.reason)
    return result
