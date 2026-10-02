"""Unit tests for the menu_scout semantic matching helper.

All tests mock ChatOpenAI — no network access required.
"""
from __future__ import annotations

import asyncio
import json

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import app.services.menu_scout as _scout_mod
from app.services.menu_scout import (
    MAX_PAIRS,
    ScoutCandidateInput,
    ScoutDishInput,
    scout_ambiguous_matches,
)


# --- Helpers ---

def _dish(dish_id: str = "d1", name: str = "Dal Makhani", cuisine: str = "indian",
          aliases: list[str] | None = None) -> ScoutDishInput:
    return ScoutDishInput(dish_id=dish_id, dish_name=name, cuisine=cuisine, aliases=aliases or [])


def _cand(item_id: str = "i1", name: str = "Black Dal Makhani",
          is_veg: bool | None = True, price: float = 299.0) -> ScoutCandidateInput:
    return ScoutCandidateInput(item_id=item_id, item_name=name, is_veg=is_veg, price=price)


def _llm_response(data: dict) -> MagicMock:
    mock = MagicMock()
    mock.content = json.dumps(data)
    return mock


def _mock_llm(response_data: dict) -> MagicMock:
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=_llm_response(response_data))
    return llm


# --- Tests ---

@pytest.mark.asyncio
async def test_empty_input_skips_model():
    """Empty pairs list must return {} without instantiating the LLM."""
    with patch("app.services.menu_scout.ChatOpenAI") as mock_cls:
        result = await scout_ambiguous_matches([])
    mock_cls.assert_not_called()
    assert result == {}


@pytest.mark.asyncio
async def test_single_pair_accepted():
    """Compatible pair above confidence threshold is returned in output."""
    dish = _dish()
    cand = _cand()
    data = {f"{dish.dish_id}:{cand.item_id}": {"compatible": True, "confidence": 0.88, "reason": "close variant"}}

    with patch("app.services.menu_scout.ChatOpenAI", return_value=_mock_llm(data)):
        result = await scout_ambiguous_matches([(dish, cand)])

    assert (dish.dish_id, cand.item_id) in result
    decision = result[(dish.dish_id, cand.item_id)]
    assert decision.compatible is True
    assert decision.confidence == pytest.approx(0.88)
    assert decision.reason == "close variant"


@pytest.mark.asyncio
async def test_confidence_gate_excludes_low_confidence():
    """compatible=true but confidence < _MIN_CONFIDENCE (0.75) is NOT returned."""
    dish = _dish()
    cand = _cand()
    data = {f"{dish.dish_id}:{cand.item_id}": {"compatible": True, "confidence": 0.60, "reason": "weak"}}

    with patch("app.services.menu_scout.ChatOpenAI", return_value=_mock_llm(data)):
        result = await scout_ambiguous_matches([(dish, cand)])

    assert result == {}


@pytest.mark.asyncio
async def test_incompatible_pair_excluded():
    """compatible=false must be excluded regardless of confidence."""
    dish = _dish()
    cand = _cand()
    data = {f"{dish.dish_id}:{cand.item_id}": {"compatible": False, "confidence": 0.95, "reason": "protein mismatch"}}

    with patch("app.services.menu_scout.ChatOpenAI", return_value=_mock_llm(data)):
        result = await scout_ambiguous_matches([(dish, cand)])

    assert result == {}


@pytest.mark.asyncio
async def test_malformed_json_returns_empty():
    """Non-JSON response returns {} and does not crash."""
    llm = MagicMock()
    bad = MagicMock()
    bad.content = "this is not JSON {{{"
    llm.ainvoke = AsyncMock(return_value=bad)

    with patch("app.services.menu_scout.ChatOpenAI", return_value=llm):
        result = await scout_ambiguous_matches([(_dish(), _cand())])

    assert result == {}


@pytest.mark.asyncio
async def test_malformed_entry_skipped_valid_entry_returned():
    """Malformed individual entries are skipped; other valid entries still returned."""
    dish1 = _dish("d1", "Dal Makhani")
    cand1 = _cand("i1", "Black Dal Makhani")
    dish2 = _dish("d2", "Butter Chicken")
    cand2 = _cand("i2", "Murgh Makhani")

    data = {
        "d1:i1": {"compatible": True, "confidence": 0.90, "reason": "same dish"},
        "d2:i2": "not_a_dict",           # malformed — must be skipped
        "d1:i1_extra": {"compatible": True},  # missing confidence — skipped
    }
    with patch("app.services.menu_scout.ChatOpenAI", return_value=_mock_llm(data)):
        result = await scout_ambiguous_matches([(dish1, cand1), (dish2, cand2)])

    assert ("d1", "i1") in result
    assert ("d2", "i2") not in result


@pytest.mark.asyncio
async def test_timeout_returns_empty():
    """LLM call that exceeds timeout returns {} without crashing."""
    llm = MagicMock()

    async def _slow(*args, **kwargs):
        await asyncio.sleep(10)
        return _llm_response({})

    llm.ainvoke = _slow

    original = _scout_mod._TIMEOUT_S
    _scout_mod._TIMEOUT_S = 0.02
    try:
        with patch("app.services.menu_scout.ChatOpenAI", return_value=llm):
            result = await scout_ambiguous_matches([(_dish(), _cand())])
    finally:
        _scout_mod._TIMEOUT_S = original

    assert result == {}


@pytest.mark.asyncio
async def test_llm_error_returns_empty():
    """LLM exception returns {} without crashing."""
    llm = MagicMock()
    llm.ainvoke = AsyncMock(side_effect=RuntimeError("network error"))

    with patch("app.services.menu_scout.ChatOpenAI", return_value=llm):
        result = await scout_ambiguous_matches([(_dish(), _cand())])

    assert result == {}


@pytest.mark.asyncio
async def test_pairs_capped_at_max_pairs_one_llm_call():
    """More than MAX_PAIRS input pairs → exactly ONE LLM call with at most MAX_PAIRS pairs."""
    pairs = [
        (_dish(f"d{i}", f"Dish {i}"), _cand(f"i{i}", f"Item {i}"))
        for i in range(MAX_PAIRS + 5)
    ]
    llm = MagicMock()
    llm.ainvoke = AsyncMock(return_value=_llm_response({}))

    with patch("app.services.menu_scout.ChatOpenAI", return_value=llm):
        await scout_ambiguous_matches(pairs)

    llm.ainvoke.assert_called_once()
    # Verify prompt contains exactly MAX_PAIRS target blocks.
    call_messages = llm.ainvoke.call_args[0][0]
    human_msg = call_messages[1]
    assert human_msg.content.count("TARGET:") == MAX_PAIRS


@pytest.mark.asyncio
async def test_exact_confidence_boundary_accepted():
    """confidence == _MIN_CONFIDENCE (0.75) exactly should be accepted."""
    from app.services.menu_scout import _MIN_CONFIDENCE
    dish = _dish()
    cand = _cand()
    data = {f"{dish.dish_id}:{cand.item_id}": {"compatible": True, "confidence": _MIN_CONFIDENCE, "reason": "boundary"}}

    with patch("app.services.menu_scout.ChatOpenAI", return_value=_mock_llm(data)):
        result = await scout_ambiguous_matches([(dish, cand)])

    assert (dish.dish_id, cand.item_id) in result
