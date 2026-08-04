from __future__ import annotations

import base64
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.image_moderation import is_food_photo

logger = logging.getLogger("moderation_routes")
router = APIRouter(prefix="/api/moderation", tags=["moderation"])


class CheckFoodPhotoRequest(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"


class CheckFoodPhotoResponse(BaseModel):
    success: bool
    is_food: bool = False
    reason: str = ""
    error: str | None = None


@router.post("/check-food-photo", response_model=CheckFoodPhotoResponse)
async def check_food_photo(req: CheckFoodPhotoRequest) -> CheckFoodPhotoResponse:
    try:
        image_bytes = base64.b64decode(req.image_base64)
    except Exception as exc:  # noqa: BLE001
        return CheckFoodPhotoResponse(success=False, error=f"Invalid image data: {exc}")

    try:
        result = is_food_photo(image_bytes, req.mime_type)
        return CheckFoodPhotoResponse(success=True, is_food=result.is_food, reason=result.reason)
    except Exception as exc:  # noqa: BLE001 - surface classifier failure cleanly
        logger.warning("check_food_photo failed: %s", exc)
        return CheckFoodPhotoResponse(success=False, error=str(exc))
