"""Diet + allergen hard constraints: every restriction against the whole catalog."""

import pytest

from app.data.dishes import DISHES
from app.schemas.request import GameData, Mood, Preferences, UserContext
from app.services import diet


def _tags(d):
    return {t.lower() for t in d.dietary_tags}


def _allergens(d):
    return {a.lower() for a in d.allergens}


@pytest.mark.parametrize("dish", DISHES, ids=lambda d: d.id)
def test_every_dish_against_every_rule(dish):
    assert diet.allows(dish, []) is True
    assert diet.allows(dish, ["vegetarian"]) is ("non_veg" not in _tags(dish))
    assert diet.allows(dish, ["vegan"]) is (
        "vegan" in _tags(dish) and not _allergens(dish) & {"dairy", "eggs", "shellfish"}
    )
    assert diet.allows(dish, ["non_veg"]) is ("non_veg" in _tags(dish))
    assert diet.allows(dish, ["gluten_free"]) is ("gluten" not in _allergens(dish))
    assert diet.allows(dish, ["dairy-free"]) is ("dairy" not in _allergens(dish))
    for allergen in ("dairy", "gluten", "eggs", "nuts", "shellfish", "soy"):
        rules = diet.make_rules(allergies=[allergen])
        assert diet.allows(dish, rules) is (allergen not in _allergens(dish))


def test_vegan_never_allows_dairy_or_eggs():
    vegan_ok = [d for d in DISHES if diet.allows(d, ["vegan"])]
    assert vegan_ok, "catalog should have vegan dishes"
    assert all(not _allergens(d) & {"dairy", "eggs"} for d in vegan_ok)
    assert all("non_veg" not in _tags(d) for d in vegan_ok)


def test_mobile_ids_are_understood():
    # preferences.tsx sends `gf` for gluten-free and `soy` as an allergy.
    assert diet.make_rules(restrictions=["gf"]).excluded_allergens == {"gluten"}
    soy = diet.make_rules(allergies=["soy"])
    assert not any(diet.allows(d, soy) for d in DISHES if "soy" in d.allergens)
    assert sum("soy" in d.allergens for d in DISHES) >= 40


def test_allergy_aliases_normalize():
    rules = diet.make_rules(allergies=["Peanuts", "milk", "egg", "Prawns", "wheat"])
    assert rules.excluded_allergens == {"nuts", "dairy", "eggs", "shellfish", "gluten"}


def test_unknown_restriction_is_ignored_not_blocking():
    rules = diet.make_rules(restrictions=["keto"])
    assert rules.is_empty
    assert all(diet.allows(d, rules) for d in DISHES)


def test_rules_for_falls_back_to_game_diet_preference():
    ctx = UserContext(mood=Mood(primary="happy"), game_data=GameData(type="quiz", diet_preference="veg"))
    assert diet.rules_for(ctx).restrictions == {"vegetarian"}


def test_rules_for_explicit_preferences_win_and_include_allergies():
    ctx = UserContext(
        mood=Mood(primary="happy"),
        preferences=Preferences(dietary_restrictions=["vegan"], allergies=["nuts"]),
        game_data=GameData(type="quiz", diet_preference="non-veg"),
    )
    rules = diet.rules_for(ctx)
    assert rules.restrictions == {"vegan"}
    assert rules.excluded_allergens == {"nuts"}
