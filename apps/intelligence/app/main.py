import asyncio
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.config import settings

from app.observability import configure_logging, request_id_var

# Configure logging so the Swiggy MCP loggers actually emit. SWIGGY_DEBUG=true
# raises the Swiggy loggers to DEBUG (full raw tool payloads). Every line
# carries the request id the API sent (X-Request-Id).
configure_logging(settings.log_level.upper(), json_logs=settings.json_logs)
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
from app.routes.food_graph import router as food_graph_router
from app.security import require_service_key
from app.services.swiggy_mcp import track_user_token

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Build missing dish embeddings and warm craving/archetype anchors in the
    # background so the request path never waits on (or calls) the embeddings API.
    async def _warm() -> None:
        from app.learning import embeddings, retrieval

        log = logging.getLogger("startup")
        try:
            built = await asyncio.to_thread(embeddings.build_dish_matrix)
            n = await asyncio.to_thread(embeddings.warm_text_cache, retrieval.startup_texts())
            log.info("dish embeddings ready=%s; warmed %d anchor embeddings", built, n)
        except Exception as exc:  # noqa: BLE001 — never block boot
            log.warning("embedding warm-up failed: %s", exc)

    task = asyncio.create_task(_warm())
    yield
    task.cancel()
    from app.learning import store

    store.close()


app = FastAPI(title="FoodMood API", version="1.0.0", lifespan=lifespan)

# Server-to-server only by default; browsers are allowed only when listed.
_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
if _origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def bind_request_id(request: Request, call_next):
    """Bind the caller's X-Request-Id (or a fresh one) to logs and echo it back."""
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex
    token = request_id_var.set(rid)
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)
    response.headers["X-Request-Id"] = rid
    return response


@app.middleware("http")
async def flag_rejected_user_token(request: Request, call_next):
    """Tell the API (via a private header) when Swiggy rejected the user's token, so it drops the link."""
    state = track_user_token(request.headers.get("x-swiggy-user-token"))
    response = await call_next(request)
    if state.rejected:
        response.headers["X-Swiggy-Token-Rejected"] = "1"
    return response


_auth = [Depends(require_service_key)]
for _router in (
    recommendations_router,
    dish_router,
    game_assist_router,
    swiggy_router,
    learn_router,
    recipe_router,
    instamart_router,
    moderation_router,
    food_graph_router,
):
    app.include_router(_router, dependencies=_auth)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
