from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.routes.recommendations import router as recommendations_router
from app.routes.dish import router as dish_router
from app.routes.character_match import router as character_match_router

app = FastAPI(title="FoodMood API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recommendations_router)
app.include_router(dish_router)
app.include_router(character_match_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
