"""Shared LLM client: request parameters, telemetry, cache-only embeddings."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import HumanMessage, SystemMessage

from app import llm as llm_mod
from app.config import settings


def _fake_client(content='{"ok": true}'):
    resp = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=SimpleNamespace(model_dump=lambda: {"total_tokens": 42}),
        model="gpt-6-luna-2026-09-01",
    )
    client = MagicMock()
    client.chat.completions.create = AsyncMock(return_value=resp)
    return client


@pytest.fixture
def fake_openai(monkeypatch):
    client = _fake_client()
    monkeypatch.setattr(llm_mod, "async_openai", lambda: client)
    return client


async def test_json_chat_builds_current_model_params(fake_openai, monkeypatch):
    monkeypatch.setattr(settings, "openai_supports_temperature", True)
    chat = llm_mod.JsonChat(model="gpt-6-luna", kind="rank", temperature=0.4, max_tokens=300)
    result = await chat.ainvoke([SystemMessage(content="sys"), HumanMessage(content="hi")])

    kwargs = fake_openai.chat.completions.create.call_args.kwargs
    assert kwargs["messages"] == [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}]
    assert kwargs["max_completion_tokens"] == 300
    assert "max_tokens" not in kwargs
    assert kwargs["response_format"] == {"type": "json_object"}
    assert kwargs["temperature"] == 0.4
    assert result.content == '{"ok": true}'
    assert result.response_metadata["token_usage"]["total_tokens"] == 42
    assert result.response_metadata["model_name"] == "gpt-6-luna-2026-09-01"


async def test_temperature_omitted_when_model_rejects_it(fake_openai, monkeypatch):
    monkeypatch.setattr(settings, "openai_supports_temperature", False)
    await llm_mod.JsonChat(model="m", kind="rank", temperature=0.9).ainvoke([HumanMessage(content="x")])
    assert "temperature" not in fake_openai.chat.completions.create.call_args.kwargs


async def test_call_failure_propagates(monkeypatch):
    client = MagicMock()
    client.chat.completions.create = AsyncMock(side_effect=RuntimeError("down"))
    monkeypatch.setattr(llm_mod, "async_openai", lambda: client)
    with pytest.raises(RuntimeError):
        await llm_mod.JsonChat(model="m", kind="rank").ainvoke([HumanMessage(content="x")])


def test_models_come_from_config():
    assert settings.model_fields["openai_model"].default == "gpt-6-luna"
    import app.services.image_moderation as im
    import app.services.recipe_generator as rg

    assert not hasattr(im, "_VISION_MODEL")
    assert not hasattr(rg, "_RECIPE_MODEL")


def test_embed_text_cache_only_never_calls_remote(monkeypatch, tmp_path):
    from app.learning import embeddings

    monkeypatch.setattr(embeddings, "_anchor_cache", {})
    remote = MagicMock(return_value=None)
    monkeypatch.setattr(embeddings, "_embed_remote", remote)
    assert embeddings.embed_text("food craving: smoky", allow_remote=False) is None
    assert embeddings.embed_tags(["smoky", "crunchy"], allow_remote=False) is None
    remote.assert_not_called()


def test_warm_text_cache_batches_missing(monkeypatch, tmp_path):
    import numpy as np
    from app.learning import embeddings, retrieval

    monkeypatch.setattr(embeddings, "_anchor_cache", {})
    from app.config import settings
    from app.learning import store

    monkeypatch.setattr(settings, "model_store_path", str(tmp_path / "m.db"))
    store.close()
    calls = []

    def fake_remote(texts):
        calls.append(list(texts))
        return np.ones((len(texts), 4), dtype=np.float32)

    monkeypatch.setattr(embeddings, "_embed_remote", fake_remote)
    texts = retrieval.startup_texts()
    assert embeddings.warm_text_cache(texts) == len(set(texts))
    assert len(calls) == 1
    assert embeddings.warm_text_cache(texts) == 0  # all cached now
    assert embeddings.embed_text(embeddings.craving_text("smoky"), allow_remote=False) is not None
    monkeypatch.setattr(embeddings, "_anchor_cache", None)  # reload from the store
    assert embeddings.embed_text(embeddings.craving_text("smoky"), allow_remote=False) is not None
    store.close()


async def test_missing_key_fails_fast(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    with pytest.raises(llm_mod.LLMUnavailable):
        await llm_mod.JsonChat(model="m", kind="rank").ainvoke([HumanMessage(content="x")])
