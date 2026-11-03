from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.kitchen_circle import translate as tr
from app.kitchen_circle.translate import TranslateRequest, _LlmMeal, _LlmOut, translate
from app.main import app

client = TestClient(app)
MEAL = {"key": "v1", "title": "Chicken biryani", "ingredients": [{"name": "chicken", "unit": "g"}, {"name": "basmati rice", "unit": "cup"}, {"name": "salt", "unit": ""}],
        "steps": ["Marinate for 30 minutes.", "Cook rice for 3 whistles."]}


def req(language="hi", **extra):
    return TranslateRequest.model_validate({"language": language, "meals": [MEAL], **extra})


async def test_english_needs_no_model_call():
    with patch.object(tr, "parse_structured", AsyncMock(side_effect=AssertionError("no call"))):
        res = await translate(req("en"))
    assert res.status == "not_needed" and res.meals[0].title == "Chicken biryani"


async def test_valid_translation_is_used_and_numbers_are_checked_per_step():
    out = _LlmOut(meals=[_LlmMeal(key="v1", title="चिकन बिरयानी", ingredient_names=["चिकन", "बासमती चावल", "नमक"], unit_words=["ग्राम", "कप", ""],
                                  steps=["30 मिनट मैरिनेट करें।", "चावल को 4 सीटी तक पकाएं।"])])  # second step changed 3 → 4
    with patch.object(tr, "parse_structured", AsyncMock(return_value=out)):
        res = await translate(req("hi"))
    meal = res.meals[0]
    assert res.status == "ok" and meal.translated and meal.title == "चिकन बिरयानी"
    assert [i.name for i in meal.ingredients] == ["चिकन", "बासमती चावल", "नमक"] and meal.ingredients[2].unit == ""
    assert meal.steps == ["30 मिनट मैरिनेट करें।", "Cook rice for 3 whistles."]  # a changed number falls back to English


async def test_mismatched_shape_or_failure_falls_back_to_english():
    bad = _LlmOut(meals=[_LlmMeal(key="v1", title="x", ingredient_names=["only one"], unit_words=["g"], steps=["a", "b"])])
    with patch.object(tr, "parse_structured", AsyncMock(return_value=bad)):
        res = await translate(req("ta"))
    assert res.status == "fallback" and res.meals[0].title == "Chicken biryani"
    with patch.object(tr, "parse_structured", AsyncMock(side_effect=RuntimeError("down"))):
        res = await translate(req("kn"))
    assert res.status == "fallback" and not res.meals[0].translated


async def test_prompt_asks_for_native_script_or_english_letters():
    assert "native Devanagari script" in tr._prompt(req("mr"))
    assert "English/Latin letters" in tr._prompt(req("te", transliterate=True))
    assert "Latin letters (Hinglish)" in tr._prompt(req("hinglish"))


def test_route_mounted():
    resp = client.post("/api/kitchen-circle/cook/translate", json={"language": "bn", "meals": [MEAL], "allow_llm": False})
    assert resp.status_code == 200 and resp.json()["status"] == "fallback"
