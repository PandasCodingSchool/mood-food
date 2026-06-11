from fastapi import APIRouter
from app.schemas.character_match import CharacterMatchRequest, CharacterMatchResponse
from app.services import character_matcher

router = APIRouter()


@router.post("/api/character-match", response_model=CharacterMatchResponse)
async def match_character(request: CharacterMatchRequest) -> CharacterMatchResponse:
    return character_matcher.match_character(request.answers)
