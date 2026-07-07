import logging

from fastapi import APIRouter
from app.schemas.request import RecommendationRequest
from app.schemas.response import RecommendationResponse
from app.services import recommender

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_SWIGGY_RETRIES = 3


@router.post("/api/ai-recommendations", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest) -> RecommendationResponse:
    response = recommender.get_recommendations(request)

    if not request.swiggy_address_id or not response.success or not response.recommendations:
        return response

    # Lazy imports — Swiggy services only instantiated when Swiggy is live
    from app.services.swiggy_token import load_token
    from app.services.swiggy_mcp import SwiggyMCPClient
    from app.services.swiggy_discovery import SwiggyDiscoveryService
    from app.schemas.swiggy import EnrichDishInput

    token = load_token()
    if not token:
        return response

    client = SwiggyMCPClient(token=token)
    service = SwiggyDiscoveryService(client=client)

    current_request = request
    current_response = response
    unavailable: list[str] = []

    for attempt in range(_MAX_SWIGGY_RETRIES):
        enrich_input = [
            EnrichDishInput(
                id=rec.dish.id, name=rec.dish.name, cuisine=rec.dish.cuisine
            )
            for rec in current_response.recommendations
        ]

        try:
            _, matches = await service.enrich(
                enrich_input, address_id=request.swiggy_address_id
            )
        except Exception as exc:
            logger.warning("swiggy availability check failed (attempt %d): %s", attempt + 1, exc)
            break

        matched_ids = {m.dish_id for m in matches if m.matched}
        unmatched_names = [
            rec.dish.name
            for rec in current_response.recommendations
            if rec.dish.id not in matched_ids
        ]

        if not unmatched_names or attempt == _MAX_SWIGGY_RETRIES - 1:
            current_response = current_response.model_copy(update={
                "swiggy_matches": {m.dish_id: m.model_dump() for m in matches if m.matched},
                "swiggy_address_id": request.swiggy_address_id,
            })
            break

        logger.info(
            "swiggy: %d dish(es) unavailable (attempt %d/%d): %s — retrying GPT",
            len(unmatched_names), attempt + 1, _MAX_SWIGGY_RETRIES, unmatched_names,
        )
        unavailable.extend(unmatched_names)
        modified_ctx = current_request.user_context.model_copy(
            update={"unavailable_dishes": list(unavailable)}
        )
        current_request = current_request.model_copy(
            update={"user_context": modified_ctx}
        )
        current_response = recommender.get_recommendations(current_request)

    return current_response
