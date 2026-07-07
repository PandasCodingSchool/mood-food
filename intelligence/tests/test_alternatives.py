"""Tests for course/diet-aware alternatives and the deterministic veg filter."""

from app.data.dishes import DISHES, DISHES_BY_ID
from app.services.recommender import (
    _apply_diet_filter,
    _budget_swap,
    _build_alternatives,
    _diet_allows,
    _healthier_swap,
    _MAIN_CATEGORIES,
)

NON_MAIN = {"beverage", "dessert", "snack"}


def _find(name_substr: str):
    return next(d for d in DISHES if name_substr in d.name)


def test_biryani_swaps_are_mains_not_drinks():
    biryani = _find("Chicken Biryani")
    for swap in (_healthier_swap(biryani, []), _budget_swap(biryani, [])):
        assert swap.category in _MAIN_CATEGORIES
        assert swap.category not in NON_MAIN
        assert swap.name != "Masala Chai"


def test_swaps_respect_vegetarian_preference():
    biryani = _find("Chicken Biryani")
    for swap in (_healthier_swap(biryani, ["vegetarian"]), _budget_swap(biryani, ["vegetarian"])):
        assert "non_veg" not in [t.lower() for t in swap.dietary_tags]


def test_alternatives_carry_full_dish_info():
    biryani = _find("Chicken Biryani")
    alts = _build_alternatives(biryani, [])
    assert alts, "expected at least one alternative"
    for a in alts:
        assert a.practical_details is not None
        assert a.practical_details.estimated_price >= 0
        assert a.category is not None
        assert a.image_url


def test_diet_allows():
    veg = _find("Dal Makhani")   # vegetarian
    nonveg = _find("Chicken Biryani")
    assert _diet_allows(veg, ["vegetarian"]) is True
    assert _diet_allows(nonveg, ["vegetarian"]) is False
    assert _diet_allows(nonveg, ["non_veg"]) is True
    assert _diet_allows(veg, ["non_veg"]) is False
    assert _diet_allows(nonveg, []) is True  # no restriction => allowed


def test_apply_diet_filter_drops_and_backfills():
    # Rank two non-veg dishes; a vegetarian filter must drop them and backfill veg.
    nonveg = [d for d in DISHES if "non_veg" in [t.lower() for t in d.dietary_tags]][:2]
    ranked = [{"dish_id": d.id, "confidence": 0.9} for d in nonveg]
    out = _apply_diet_filter(ranked, ["vegetarian"], count=3)
    assert len(out) == 3
    for item in out:
        d = DISHES_BY_ID[item["dish_id"]]
        assert "non_veg" not in [t.lower() for t in d.dietary_tags]


def test_apply_diet_filter_noop_when_no_restriction():
    ranked = [{"dish_id": DISHES[0].id}]
    assert _apply_diet_filter(ranked, [], count=3) == ranked
