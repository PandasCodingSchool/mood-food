"""Character matcher: deterministic description path (client picks the character)."""

from app.schemas.character_match import AnswerItem
from app.services.character_matcher import match_character


class _FakeLLM:
    def __init__(self, content: str) -> None:
        self._content = content

    def invoke(self, _messages):
        class _R:
            content = self._content

        return _R()


def test_provided_character_id_is_kept_and_described():
    llm = _FakeLLM('{"spirit_animal": "Tonight you are pure adventure."}')
    answers = [AnswerItem(question="Saturday night?", selected="Explore", emoji="🌍")]
    resp = match_character(answers, character_id="bunny", match_percent=91, llm=llm)
    assert resp.character_id == "bunny"          # not re-picked by the AI
    assert resp.match_percent == 91
    assert "adventure" in resp.spirit_animal.lower()
    assert resp.fallback is False


def test_invalid_character_id_falls_through_to_selection():
    # Unknown id -> selection prompt path; AI returns a valid character.
    llm = _FakeLLM('{"character_id": "joey", "match_percent": 80, "spirit_animal": "Food is love."}')
    answers = [AnswerItem(question="q", selected="Pizza")]
    resp = match_character(answers, character_id="not_a_char", llm=llm)
    assert resp.character_id == "joey"
