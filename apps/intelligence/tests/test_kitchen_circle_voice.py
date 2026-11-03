"""Voice notes in the KitchenCircle chat: transcription with recipe-name hints; failures are clear, never crashes."""

import base64
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.kitchen_circle import voice
from app.main import app

client = TestClient(app)
AUDIO = base64.b64encode(b"\x00\x00\x00\x18ftypM4A " + b"\x01" * 64).decode()


def fake(text: str):
    create = AsyncMock(return_value=SimpleNamespace(text=text))
    return create, patch.object(voice, "async_openai", return_value=SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create))))


async def test_transcribes_with_recipe_names_as_hints_on_the_cheapest_model():
    create, client_patch = fake("I want rajma chawal on Monday, Tuesday pav bhaji ")
    with patch.object(voice.settings, "openai_api_key", "k"), client_patch:
        out = await voice.transcribe(voice.TranscribeRequest(audio_base64=AUDIO, mime_type="audio/webm;codecs=opus", hints=["Rajma Chawal", "Pav Bhaji", "Rajma Chawal"]))
    assert out.text == "I want rajma chawal on Monday, Tuesday pav bhaji" and out.model == "gpt-4o-mini-transcribe"
    kwargs = create.await_args.kwargs
    assert kwargs["model"] == voice.settings.kitchen_circle_transcribe_model
    assert kwargs["file"][0] == "voice.webm" and kwargs["file"][2] == "audio/webm"
    assert "Rajma Chawal, Pav Bhaji." in kwargs["prompt"] and "Latin letters" in kwargs["prompt"] and kwargs["prompt"].count("Rajma Chawal") == 1


async def test_empty_or_oversized_audio_is_rejected_before_any_call():
    create, client_patch = fake("x")
    with patch.object(voice.settings, "openai_api_key", "k"), client_patch, patch.object(voice, "MAX_AUDIO_BYTES", 10):
        assert await voice.transcribe(voice.TranscribeRequest(audio_base64=AUDIO)) is None
    assert create.await_count == 0


def test_route_says_so_plainly_when_voice_is_unavailable_or_fails():
    with patch.object(voice.settings, "openai_api_key", ""):
        resp = client.post("/api/kitchen-circle/chat/transcribe", json={"audio_base64": AUDIO, "mime_type": "audio/m4a"})
    assert resp.status_code == 200 and resp.json() == {"success": False, "error": "Voice isn't available right now. You can type instead."}
    create = AsyncMock(side_effect=RuntimeError("boom"))
    broken = patch.object(voice, "async_openai", return_value=SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create))))
    with patch.object(voice.settings, "openai_api_key", "k"), broken:
        resp = client.post("/api/kitchen-circle/chat/transcribe", json={"audio_base64": AUDIO, "mime_type": "audio/m4a"})
    assert resp.json()["success"] is False and "Try again" in resp.json()["error"]
    _, ok = fake("Leftovers on Friday")
    with patch.object(voice.settings, "openai_api_key", "k"), ok:
        resp = client.post("/api/kitchen-circle/chat/transcribe", json={"audio_base64": AUDIO, "mime_type": "audio/m4a", "hints": ["Poha"]})
    assert resp.json() == {"success": True, "text": "Leftovers on Friday", "model": "gpt-4o-mini-transcribe", "confidence": None, "checked": False}


def lp(*probs: float):
    import math
    return [SimpleNamespace(token="t", logprob=math.log(p)) for p in probs]


INVENTED = "On Monday, make Dal Tadka with Jeera Rice. Tuesday, how about Masala Dosa? Wednesday, Egg Curry with Aloo Gobi."


def test_doubtful_transcripts_are_low_confidence_or_too_long_for_the_clip():
    assert not voice.doubtful("Pav Bhaji on Friday please", 0.99, 3)
    assert voice.doubtful("Pav Bhaji on Friday please", 0.67, 3)
    assert voice.doubtful(INVENTED, None, 3)  # 19 words in 3 seconds
    assert not voice.doubtful(INVENTED, None, 12) and not voice.doubtful("Leftovers", None, None)
    assert voice.settle(INVENTED, "") == "" and voice.settle(INVENTED, "uh") == ""
    assert voice.settle("Pav Bhaji on Friday", "Have Punjabi on Friday") == "Pav Bhaji on Friday"  # keep the hinted spelling
    assert voice.settle(INVENTED, "Friday rice") == "Friday rice"  # the hint added most of it


async def test_hinted_silence_is_rechecked_without_the_hint_and_comes_back_empty():
    create = AsyncMock(side_effect=[SimpleNamespace(text=INVENTED, logprobs=lp(0.7, 0.6, 0.7)), SimpleNamespace(text="", logprobs=[])])
    with patch.object(voice.settings, "openai_api_key", "k"), patch.object(voice, "async_openai", return_value=SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))):
        out = await voice.transcribe(voice.TranscribeRequest(audio_base64=AUDIO, hints=["Dal Tadka"], seconds=4))
    assert (out.text, out.checked, out.confidence) == ("", True, 0.665)
    first, second = (c.kwargs for c in create.await_args_list)
    assert "Dal Tadka" in first["prompt"] and "prompt" not in second and first["include"] == ["logprobs"]


async def test_clear_speech_is_trusted_in_one_call():
    create = AsyncMock(return_value=SimpleNamespace(text="Pav Bhaji on Friday, please.", logprobs=lp(0.99, 0.98, 0.995)))
    with patch.object(voice.settings, "openai_api_key", "k"), patch.object(voice, "async_openai", return_value=SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create)))):
        out = await voice.transcribe(voice.TranscribeRequest(audio_base64=AUDIO, hints=["Pav Bhaji"], seconds=2))
    assert (out.text, out.checked, create.await_count) == ("Pav Bhaji on Friday, please.", False, 1)


def speech_client(audio: bytes = b"ID3fake-mp3"):
    create = AsyncMock(return_value=SimpleNamespace(read=lambda: audio))
    return create, patch.object(voice, "async_openai", return_value=SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=create))))


async def test_read_aloud_speaks_the_cooks_language_on_the_tts_model():
    create, client_patch = speech_client()
    with patch.object(voice.settings, "openai_api_key", "k"), client_patch:
        audio = await voice.speak(voice.SpeakRequest(text="चरण 2. आलू उबालें।", language="hi"))
    assert audio == b"ID3fake-mp3"
    kwargs = create.await_args.kwargs
    assert (kwargs["model"], kwargs["voice"], kwargs["response_format"]) == ("gpt-4o-mini-tts", "coral", "mp3")
    assert kwargs["instructions"].startswith("Speak in Hindi.") and kwargs["input"] == "चरण 2. आलू उबालें।"


def test_speak_route_returns_audio_or_a_plain_error():
    _, ok = speech_client(b"mp3bytes")
    with patch.object(voice.settings, "openai_api_key", "k"), ok:
        resp = client.post("/api/kitchen-circle/speak", json={"text": "Step 1. Knead the dough.", "language": "en"})
    assert resp.json() == {"success": True, "audio_base64": base64.b64encode(b"mp3bytes").decode(), "mime": "audio/mpeg"}
    with patch.object(voice.settings, "openai_api_key", ""):
        resp = client.post("/api/kitchen-circle/speak", json={"text": "x", "language": "ta"})
    assert resp.json() == {"success": False, "error": "Read-aloud isn't available right now."}
