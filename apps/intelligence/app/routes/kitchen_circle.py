import asyncio
import base64
import json
import logging
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.kitchen_circle.cart import build_preview
from app.kitchen_circle.cart_schemas import AddressOption, CartCheckoutRequest, CartPreviewRequest, CartPreviewResponse, CartWriteRequest, CartWriteResponse
from app.kitchen_circle.grocery_provider import InstamartKitchenCircleAdapter, provider_for
from app.schemas.instamart import InstamartCheckoutResponse, PaymentStatusResponse
from app.services.swiggy_mcp import SwiggyAuthError, SwiggyMCPError

from app.kitchen_circle.chat import interpret
from app.kitchen_circle.agent import compose_reply
from app.kitchen_circle.voice import SpeakRequest, TranscribeRequest, TranscribeResponse, speak, transcribe
from app.kitchen_circle.chat_schemas import InterpretRequest, InterpretResponse, ReplyRequest, ReplyResponse
from app.kitchen_circle.planner import autofill
from app.kitchen_circle.recipe_ai import FitRequest, FitResponse, GenerateRequest, check_fit, generate
from app.llm import LLMUnavailable
from app.kitchen_circle.translate import TranslateRequest, TranslateResponse, translate
from app.kitchen_circle.schemas import AutofillRequest, AutofillResponse

router = APIRouter()
logger = logging.getLogger("kitchen_circle_routes")


@router.post("/api/kitchen-circle/autofill", response_model=AutofillResponse)
def kitchen_circle_autofill(request: AutofillRequest) -> AutofillResponse:
    """Propose recipes for a household's open days. Pure and deterministic; nothing is stored."""
    return autofill(request)


@router.post("/api/kitchen-circle/chat/interpret", response_model=InterpretResponse)
async def kitchen_circle_chat_interpret(request: InterpretRequest) -> InterpretResponse:
    """Turn a chat message into typed planner actions. Never writes; the API applies its policy."""
    return await interpret(request)


@router.post("/api/kitchen-circle/chat/interpret/stream")
async def kitchen_circle_chat_interpret_stream(request: InterpretRequest):
    """Same as /chat/interpret, streamed as NDJSON: `{"progress": "..."}` lines while the agent works, then `{"result": {...}}`."""
    queue: asyncio.Queue = asyncio.Queue()

    async def work():
        try:
            result = await interpret(request, emit=lambda text: queue.put_nowait({"progress": text}))
            queue.put_nowait({"result": result.model_dump()})
        except Exception as exc:  # noqa: BLE001
            logger.warning("chat stream failed: %s", exc)
            queue.put_nowait({"error": "interpret failed"})

    async def lines():
        task = asyncio.create_task(work())
        try:
            while True:
                item = await queue.get()
                yield json.dumps(item, ensure_ascii=False) + "\n"
                if "result" in item or "error" in item:
                    break
        finally:
            task.cancel() if not task.done() else None

    return StreamingResponse(lines(), media_type="application/x-ndjson")


@router.post("/api/kitchen-circle/chat/transcribe")
async def kitchen_circle_chat_transcribe(request: TranscribeRequest):
    """Voice message → text (the API then sends it through the normal chat loop)."""
    try:
        result = await transcribe(request)
    except LLMUnavailable:
        return {"success": False, "error": "Voice isn't available right now. You can type instead."}
    except Exception as exc:  # noqa: BLE001
        logger.warning("transcription failed: %s", exc)
        return {"success": False, "error": "Couldn't hear that clearly. Try again, or type it."}
    if result is None:
        return {"success": False, "error": "That recording couldn't be read. Try again."}
    return {"success": True, **TranscribeResponse.model_validate(result).model_dump()}


@router.post("/api/kitchen-circle/speak")
async def kitchen_circle_speak(request: SpeakRequest):
    """Read a recipe aloud in the cook's language: `{success, audio_base64, mime}`. The API caches by text."""
    try:
        audio = await speak(request)
    except LLMUnavailable:
        return {"success": False, "error": "Read-aloud isn't available right now."}
    except Exception as exc:  # noqa: BLE001
        logger.warning("speech failed: %s", exc)
        return {"success": False, "error": "Couldn't read that aloud just now. Try again."}
    return {"success": True, "audio_base64": base64.b64encode(audio).decode(), "mime": "audio/mpeg"}


@router.post("/api/kitchen-circle/chat/reply", response_model=ReplyResponse)
async def kitchen_circle_chat_reply(request: ReplyRequest) -> ReplyResponse:
    """The assistant's chat message, written from what the API actually did (falls back to the API's own summary)."""
    return await compose_reply(request)


# ── Cart (Phase 7). The API gates live provider access and writes behind feature flags and owner-only rules;
# these routes use whichever Swiggy token the API forwards (the household owner's).

def _token(request: Request) -> Optional[str]:
    return request.headers.get("x-swiggy-user-token")


@router.post("/api/kitchen-circle/cart/preview", response_model=CartPreviewResponse)
async def kitchen_circle_cart_preview(req: CartPreviewRequest, request: Request) -> CartPreviewResponse:
    """Read-only: match requirement lines to products and optimize pack combinations."""
    return await build_preview(req, provider_for(req.provider, _token(request)))


@router.get("/api/kitchen-circle/cart/addresses")
async def kitchen_circle_cart_addresses(request: Request) -> dict:
    try:
        addresses: list[AddressOption] = await InstamartKitchenCircleAdapter(_token(request)).addresses()
        return {"success": True, "addresses": [a.model_dump() for a in addresses]}
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("cart addresses failed: %s", exc)
        return {"success": False, "error": str(exc), "addresses": []}


@router.post("/api/kitchen-circle/cart/write", response_model=CartWriteResponse)
async def kitchen_circle_cart_write(req: CartWriteRequest, request: Request) -> CartWriteResponse:
    """Live write: replaces the owner's Instamart cart with exactly these items."""
    try:
        return await InstamartKitchenCircleAdapter(_token(request)).write_cart(req.address_id, req.items)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("cart write failed: %s", exc)
        return CartWriteResponse(success=False, error=str(exc))


@router.post("/api/kitchen-circle/cart/checkout", response_model=InstamartCheckoutResponse)
async def kitchen_circle_cart_checkout(req: CartCheckoutRequest, request: Request) -> InstamartCheckoutResponse:
    """Places a real order. Requires confirmed=true; the shared order service enforces the ₹ minimum and cap."""
    try:
        return await InstamartKitchenCircleAdapter(_token(request)).orders.checkout(
            req.address_id, req.payment_method, req.intent_app, False, req.confirmed
        )
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("cart checkout failed: %s", exc)
        return InstamartCheckoutResponse(success=False, error=str(exc))


class _PaymentStatusRequest(BaseModel):
    paas_id: str
    order_id: str


@router.post("/api/kitchen-circle/cart/payment-status", response_model=PaymentStatusResponse)
async def kitchen_circle_cart_payment_status(req: _PaymentStatusRequest, request: Request) -> PaymentStatusResponse:
    try:
        return await InstamartKitchenCircleAdapter(_token(request)).orders.check_payment_status(req.paas_id, req.order_id)
    except (SwiggyAuthError, SwiggyMCPError) as exc:
        logger.warning("cart payment status failed: %s", exc)
        return PaymentStatusResponse(success=False, error=str(exc))


@router.post("/api/kitchen-circle/cook/translate", response_model=TranslateResponse)
async def kitchen_circle_cook_translate(request: TranslateRequest) -> TranslateResponse:
    """Translate a cook view's words; quantities are never touched. The API caches successful results."""
    return await translate(request)


@router.post("/api/kitchen-circle/recipes/generate")
async def kitchen_circle_generate_recipe(request: GenerateRequest) -> dict:
    """AI-written recipe for a dish not in the catalog. The API stores it as a draft for household review."""
    try:
        result = await generate(request)
        return {"success": True, **result.model_dump()}
    except LLMUnavailable:
        return {"success": False, "error": "Recipe writing isn't available right now."}
    except Exception as exc:  # noqa: BLE001 — never a 500 for a failed model call
        logger.warning("recipe generation failed: %s", exc)
        return {"success": False, "error": "Couldn't write that recipe. Try a different dish name."}


@router.post("/api/kitchen-circle/check-fit", response_model=FitResponse)
def kitchen_circle_check_fit(request: FitRequest) -> FitResponse:
    """Is this dish safe for everyone eating that day (allergies, diets, never-plan, hard rules)? No names in the answer."""
    return check_fit(request)
