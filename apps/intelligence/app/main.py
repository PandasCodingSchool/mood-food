import logging

from fastapi import FastAPI, Request
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
from app.routes.game_assist import router as game_assist_router
from app.routes.swiggy import router as swiggy_router
from app.routes.learn import router as learn_router
from app.routes.recipe import router as recipe_router
from app.routes.instamart import router as instamart_router
from app.routes.moderation import router as moderation_router
from app.services.swiggy_mcp import track_user_token

app = FastAPI(title="FoodMood API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def flag_rejected_user_token(request: Request, call_next):
    """Tell the API (via a private header) when Swiggy rejected the user's token, so it drops the link."""
    state = track_user_token(request.headers.get("x-swiggy-user-token"))
    response = await call_next(request)
    if state.rejected:
        response.headers["X-Swiggy-Token-Rejected"] = "1"
    return response


app.include_router(recommendations_router)
app.include_router(dish_router)
app.include_router(game_assist_router)
app.include_router(swiggy_router)
app.include_router(learn_router)
app.include_router(recipe_router)
app.include_router(instamart_router)
app.include_router(moderation_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
