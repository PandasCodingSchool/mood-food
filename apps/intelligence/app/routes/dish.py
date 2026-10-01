from fastapi import APIRouter
from app.schemas.response import DishDetailResponse
from app.services import recommender

router = APIRouter()


@router.get("/api/dish/{dish_id}", response_model=DishDetailResponse)
def get_dish(dish_id: str) -> DishDetailResponse:
    return recommender.get_dish_detail(dish_id)
