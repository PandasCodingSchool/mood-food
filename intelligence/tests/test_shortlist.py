"""Deterministic shortlist hard-filter + scoring tests."""

from app.data.dishes import DISHES_BY_ID
from app.schemas.request import (
    Mood, Preferences, RecommendationConfig, Situational, Budget, UserContext, History,
)
from app.services.shortlist import build_shortlist, hard_filter, score_dish


def test_hard_filter_excludes_allergens():
    ctx = UserContext(
        mood=Mood(primary="happy"),
        preferences=Preferences(allergies=["dairy"]),
    )
    pool = hard_filter(ctx)
    assert all("dairy" not in [a.lower() for a in d.allergens] for d in pool)


def test_hard_filter_vegetarian():
    ctx = UserContext(
        mood=Mood(primary="happy"),
        preferences=Preferences(dietary_restrictions=["vegetarian"]),
    )
    pool = hard_filter(ctx)
    assert all("non_veg" not in [t.lower() for t in d.dietary_tags] for d in pool)


def test_hard_filter_budget():
    ctx = UserContext(
        mood=Mood(primary="happy"),
        situational=Situational(budget=Budget(max=150)),
    )
    pool = hard_filter(ctx)
    assert all(d.price_inr <= 150 for d in pool)


def test_shortlist_size_and_diversity():
    ctx = UserContext(
        mood=Mood(primary="stressed", energy_level=3),
        preferences=Preferences(cuisine_types=["indian"], dietary_restrictions=["non_veg"]),
        situational=Situational(budget=Budget(max=800), delivery_preferred=True),
    )
    short = build_shortlist(ctx, RecommendationConfig(count=3, diversity="medium"), size=12)
    assert 3 <= len(short) <= 16
    # Should prefer mood-aligned dishes
    top = short[0]
    assert score_dish(top, ctx) >= score_dish(short[-1], ctx)


def test_avoid_list_respected():
    ctx = UserContext(
        mood=Mood(primary="happy"),
        history=History(avoid_these=["biryani"]),
    )
    pool = hard_filter(ctx)
    assert all("biryani" not in d.name.lower() for d in pool)


def test_swiggy_hints_on_problem_dishes():
    mutton = DISHES_BY_ID["in_023"]
    paneer = DISHES_BY_ID["in_027"]
    andhra = DISHES_BY_ID["in_028"]
    assert mutton.swiggy_search_category == "North Indian"
    assert paneer.swiggy_search_category == "North Indian"
    assert andhra.swiggy_search_category == "Biryani"
    assert any("Lamb" in a or "Goat" in a for a in mutton.swiggy_aliases)
