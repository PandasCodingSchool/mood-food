import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.config import settings

# Configure logging so the Swiggy MCP loggers actually emit. SWIGGY_DEBUG=true
# raises the Swiggy loggers to DEBUG (full raw tool payloads).
logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
if settings.swiggy_debug:
    for name in ("swiggy_mcp", "swiggy_discovery", "swiggy_routes"):
        logging.getLogger(name).setLevel(logging.DEBUG)

from app.routes.recommendations import router as recommendations_router
from app.routes.dish import router as dish_router
from app.routes.character_match import router as character_match_router
from app.routes.game_assist import router as game_assist_router
from app.routes.swiggy import router as swiggy_router

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
app.include_router(game_assist_router)
app.include_router(swiggy_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
