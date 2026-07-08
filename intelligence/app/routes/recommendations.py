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

    # recommendations currently held (mutated in-place as unmatched slots get
    # replaced) and the accumulated Swiggy matches for whichever dishes end up
    # in that list.
    recommendations = list(response.recommendations)
    matched_data: dict[str, dict] = {}
    unavailable: list[str] = []
    # Only the dishes that still need a Swiggy lookup this round — starts as
    # everyone, then shrinks to just the replacements on each retry.
    pending = recommendations

    for attempt in range(_MAX_SWIGGY_RETRIES):
        enrich_input = [
            EnrichDishInput(id=rec.dish.id, name=rec.dish.name, cuisine=rec.dish.cuisine)
            for rec in pending
        ]

        try:
            _, matches = await service.enrich(
                enrich_input, address_id=request.swiggy_address_id
            )
        except Exception as exc:
            logger.warning("swiggy availability check failed (attempt %d): %s", attempt + 1, exc)
            break

        matched_ids = {m.dish_id for m in matches if m.matched}
        for m in matches:
            if m.matched:
                matched_data[m.dish_id] = m.model_dump()

        unmatched = [rec for rec in pending if rec.dish.id not in matched_ids]

        if not unmatched or attempt == _MAX_SWIGGY_RETRIES - 1:
            break

        unmatched_ids = {rec.dish.id for rec in unmatched}
        unmatched_names = [rec.dish.name for rec in unmatched]
        logger.info(
            "swiggy: %d dish(es) unavailable (attempt %d/%d): %s — fetching replacements",
            len(unmatched_names), attempt + 1, _MAX_SWIGGY_RETRIES, unmatched_names,
        )
        unavailable.extend(unmatched_names)

        # Exclude both dishes already tried-and-failed and dishes already
        # confirmed available, so GPT doesn't recommend a duplicate for the
        # replacement slot(s).
        kept_names = [
            rec.dish.name for rec in recommendations if rec.dish.id not in unmatched_ids
        ]
        exclude_names = list(dict.fromkeys(unavailable + kept_names))

        modified_ctx = request.user_context.model_copy(
            update={"unavailable_dishes": exclude_names}
        )
        replacement_config = request.recommendation_config.model_copy(
            update={"count": len(unmatched)}
        )
        replacement_request = request.model_copy(
            update={"user_context": modified_ctx, "recommendation_config": replacement_config}
        )
        replacement_response = recommender.get_recommendations(replacement_request)

        if not replacement_response.success or not replacement_response.recommendations:
            break  # can't get replacements — keep the unmatched slots as-is

        replacement_iter = iter(replacement_response.recommendations)
        new_recommendations = []
        replaced = []
        for rec in recommendations:
            if rec.dish.id in unmatched_ids:
                repl = next(replacement_iter, None)
                if repl is not None:
                    new_recommendations.append(repl)
                    replaced.append(repl)
                    continue
            new_recommendations.append(rec)
        recommendations = new_recommendations
        pending = replaced  # only re-enrich the newly substituted dishes

    final_matches = {
        rec.dish.id: matched_data[rec.dish.id]
        for rec in recommendations
        if rec.dish.id in matched_data
    }
    return response.model_copy(update={
        "recommendations": recommendations,
        "swiggy_matches": final_matches,
        "swiggy_address_id": request.swiggy_address_id,
    })
