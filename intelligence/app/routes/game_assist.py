from fastapi import APIRouter

from app.schemas.game_assist import GameAssistRequest, GameAssistResponse
from app.services import game_assist

router = APIRouter()


@router.post("/api/game-assist", response_model=GameAssistResponse)
async def assist(request: GameAssistRequest) -> GameAssistResponse:
    return game_assist.get_assist(request)
