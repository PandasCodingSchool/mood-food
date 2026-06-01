from fastapi import APIRouter
from app.schemas.request import RecommendationRequest
from app.schemas.response import RecommendationResponse
from app.services import recommender

router = APIRouter()


@router.post("/api/ai-recommendations", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest) -> RecommendationResponse:
    return recommender.get_recommendations(request)
