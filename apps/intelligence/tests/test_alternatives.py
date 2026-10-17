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


def test_swaps_never_surface_complimentary_items():
    # Butter Naan / Aloo Paratha / Kachumber Salad are breads/accompaniments —
    # never a real swap target for an actual main course.
    complimentary_names = {"Butter Naan", "Aloo Paratha", "Kachumber Salad"}
    for dish in DISHES:
        if dish.category not in _MAIN_CATEGORIES or dish.tier == "complimentary":
            continue
        for swap in (_healthier_swap(dish, []), _budget_swap(dish, [])):
            assert swap.name not in complimentary_names
            assert swap.tier != "complimentary"


def test_budget_swap_falls_back_to_similar_tier_within_band():
    # Poha (₹60) has no strictly-cheaper same-tier candidate — the nearest is
    # Upma at the same price, which should surface as a similar_tier_swap
    # (within the 10-15% band) rather than being omitted or picked at random.
    poha = _find("Poha")
    alts = _build_alternatives(poha, [])
    types = {a.type for a in alts}
    assert "budget_swap" not in types
    assert "similar_tier_swap" in types
    similar = next(a for a in alts if a.type == "similar_tier_swap")
    assert similar.practical_details.estimated_price <= poha.price_inr * 1.15


def test_swaps_vary_with_the_dish_not_one_global_pick():
    # Regression: healthiest/cheapest-in-cuisine made 161 dishes swap to Daal Rice and 162 to Poha.
    from collections import Counter

    healthier, budget = Counter(), Counter()
    mains = [d for d in DISHES if d.tier != "complimentary"]
    for d in mains:
        for a in _build_alternatives(d, []):
            (healthier if a.type == "healthier_swap" else budget)[a.name] += 1
    assert healthier.most_common(1)[0][1] < len(mains) * 0.1
    assert budget.most_common(1)[0][1] < len(mains) * 0.1


def test_swaps_are_actually_healthier_and_cheaper_and_alike():
    from app.services.recommender import _swap_similarity

    dish = next(d for d in DISHES if d.name == "Paneer Butter Masala")
    alts = {a.type: a for a in _build_alternatives(dish, [])}
    assert alts["healthier_swap"].practical_details.health_score > dish.health_score
    assert alts["budget_swap"].practical_details.estimated_price < dish.price_inr
    healthier = next(d for d in DISHES if d.id == alts["healthier_swap"].dish_id)
    assert _swap_similarity(dish, healthier) > 0
