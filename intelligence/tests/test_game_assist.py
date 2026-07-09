import json
from unittest.mock import MagicMock

import pytest

from app.schemas.game_assist import GameAssistRequest
from app.services import game_assist
from app.services.game_assist import get_assist


def _mock_llm(payload: dict) -> MagicMock:
    llm = MagicMock()
    resp = MagicMock()
    resp.content = json.dumps(payload)
    llm.invoke.return_value = resp
    return llm


@pytest.fixture(autouse=True)
def _clear_cache():
    game_assist._CACHE.clear()
    yield


class TestCravingOptions:
    def test_happy_path(self):
        llm = _mock_llm({
            "options": [
                {"value": "comfort", "label": "Something that hugs back", "emoji": "🍲"},
                {"value": "spicy", "label": "Bring the heat", "emoji": "🌶️"},
            ]
        })
        req = GameAssistRequest(
            kind="craving_options",
            game_type="day_story",
            context={"mood": "stressed"},
            count=2,
        )
        result = get_assist(req, llm=llm)
        assert result.success
        assert [o.value for o in result.options] == ["comfort", "spicy"]

    def test_out_of_vocab_values_filtered(self):
        llm = _mock_llm({
            "options": [
                {"value": "comfort", "label": "ok"},
                {"value": "biryani-vibes", "label": "invented value"},
            ]
        })
        req = GameAssistRequest(kind="craving_options", context={"mood": "happy"})
        result = get_assist(req, llm=llm)
        assert result.success
        assert [o.value for o in result.options] == ["comfort"]

    def test_llm_exception_returns_failure(self):
        llm = MagicMock()
        llm.invoke.side_effect = RuntimeError("boom")
        req = GameAssistRequest(kind="craving_options", context={})
        result = get_assist(req, llm=llm)
        assert not result.success
        assert result.error

    def test_cache_hit_skips_second_llm_call(self):
        llm = _mock_llm({"options": [{"value": "sweet", "label": "Treat yourself"}]})
        req = GameAssistRequest(kind="craving_options", context={"mood": "happy"})
        first = get_assist(req, llm=llm)
        second = get_assist(req, llm=llm)
        assert first == second
        assert llm.invoke.call_count == 1


class TestFlavorKinds:
    def test_story_beat_flavor(self):
        llm = _mock_llm({"flavor_text": "What a rollercoaster of a Tuesday."})
        req = GameAssistRequest(
            kind="story_beat_flavor",
            game_type="day_story",
            context={"story_choices": ["coffee_first", "desk_lunch"]},
        )
        result = get_assist(req, llm=llm)
        assert result.success
        assert result.flavor_text == "What a rollercoaster of a Tuesday."
        assert result.options == []

    def test_followup_phrasing(self):
        llm = _mock_llm({"flavor_text": "Suit-up budget or sensible?"})
        req = GameAssistRequest(
            kind="followup_phrasing",
            game_type="character_match",
            context={"character": {"id": "barney", "name": "Barney"}},
        )
        result = get_assist(req, llm=llm)
        assert result.success
        assert "Suit-up" in result.flavor_text
