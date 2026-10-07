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


# --- WP1: meal windows, exact avoids, mood aliases, diet everywhere -------------

from app.schemas.request import GameData  # noqa: E402
from app.services.recommender import _apply_diet_filter, _build_alternatives  # noqa: E402
from app.services.shortlist import MOOD_ALIASES, mood_tags_for  # noqa: E402


def _delivery_ctx(time_of_day, **kw):
    return UserContext(
        mood=Mood(primary="happy"),
        situational=Situational(time_of_day=time_of_day, delivery_preferred=True),
        **kw,
    )


def test_dinner_delivery_keeps_full_dinner_pool():
    pool = hard_filter(_delivery_ctx("dinner"))
    dinner_dishes = [d for d in DISHES_BY_ID.values() if "dinner" in d.meal_time and d.delivery_friendly]
    assert len(pool) >= len(dinner_dishes)
    assert len(pool) > 40  # was 20 when a 9pm request was bucketed late_night


def test_late_night_delivery_includes_dinner_dishes():
    pool = hard_filter(_delivery_ctx("late_night"))
    assert any("dinner" in d.meal_time and "late_night" not in d.meal_time for d in pool)


def test_breakfast_delivery_stays_breakfast():
    pool = hard_filter(_delivery_ctx("breakfast"))
    assert pool and all("breakfast" in d.meal_time for d in pool)


def test_disliking_a_dish_only_excludes_that_dish():
    chicken_dishes = [d for d in DISHES_BY_ID.values() if "chicken" in d.name.lower()]
    assert len(chicken_dishes) >= 2
    target = chicken_dishes[0]
    ctx = UserContext(mood=Mood(primary="happy"), game_data=GameData(type="swipe", disliked=[target.name]))
    pool_ids = {d.id for d in hard_filter(ctx)}
    assert target.id not in pool_ids
    assert any(d.id in pool_ids for d in chicken_dishes[1:])


def test_avoid_keyword_still_excludes_matching_dishes():
    ctx = UserContext(mood=Mood(primary="happy"), history=History(avoid_these=["chicken"]))
    assert all("chicken" not in d.name.lower() for d in hard_filter(ctx))


def test_mood_aliases_map_to_real_catalog_tags():
    catalog_tags = {t for d in DISHES_BY_ID.values() for t in d.mood_tags}
    for tags in MOOD_ALIASES.values():
        assert tags <= catalog_tags


def test_every_mobile_mood_gets_the_mood_bonus_on_many_dishes():
    for mood in ("happy", "tired", "stressed", "adventurous", "celebrating", "relaxed"):
        tags = mood_tags_for(mood)
        hits = [d for d in DISHES_BY_ID.values() if tags & set(d.mood_tags)]
        assert len(hits) >= 10, mood


def test_tired_gets_mood_bonus_on_comfort_dish():
    comfort = next(d for d in DISHES_BY_ID.values() if "comfort" in d.mood_tags)
    tired = UserContext(mood=Mood(primary="tired", energy_level=3))
    unmatched = UserContext(mood=Mood(primary="zzz_unknown", energy_level=3))
    assert score_dish(comfort, tired) - score_dish(comfort, unmatched) == 8.0


def test_allergies_enforced_in_backfill_and_alternatives():
    from app.services import diet

    rules = diet.make_rules(allergies=["dairy"])
    ranked = [{"dish_id": d.id} for d in DISHES_BY_ID.values() if "dairy" in d.allergens][:3]
    out = _apply_diet_filter(ranked, rules, count=3)
    assert len(out) == 3
    assert all("dairy" not in DISHES_BY_ID[it["dish_id"]].allergens for it in out)
    for dish in list(DISHES_BY_ID.values())[:20]:
        for alt in _build_alternatives(dish, rules):
            assert "dairy" not in DISHES_BY_ID[alt.dish_id].allergens


# --- WP5: order history shapes the shortlist ------------------------------------

from datetime import datetime, timedelta, timezone  # noqa: E402

from app.schemas.request import RecentOrder  # noqa: E402
from app.services.shortlist import history_adjustment  # noqa: E402

NOW = datetime(2026, 10, 7, 20, 0, tzinfo=timezone.utc)
PAV = DISHES_BY_ID["in_007"]


def _with_orders(*orders):
    return UserContext(mood=Mood(primary="happy"), history=History(recent_orders=list(orders)))


def _ago(hours):
    return (NOW - timedelta(hours=hours)).isoformat()


def test_no_history_no_change():
    assert history_adjustment(PAV, UserContext(mood=Mood(primary="happy")), NOW) == 0.0
    assert history_adjustment(PAV, _with_orders(RecentOrder(dish="Something Else", date=_ago(2))), NOW) == 0.0


def test_just_had_it_is_penalised():
    assert history_adjustment(PAV, _with_orders(RecentOrder(dish="pav bhaji", date=_ago(3))), NOW) == -6.0
    assert history_adjustment(PAV, _with_orders(RecentOrder(dish="Pav Bhaji", date=_ago(30))), NOW) == 0.0


def test_routine_favourite_is_boosted():
    ctx = _with_orders(
        RecentOrder(dish="Pav Bhaji", date=_ago(50), rating=5),
        RecentOrder(dish="Pav Bhaji", date=_ago(200)),
    )
    assert history_adjustment(PAV, ctx, NOW) == 3.0


def test_badly_rated_is_penalised_even_if_repeated():
    ctx = _with_orders(
        RecentOrder(dish="Pav Bhaji", date=_ago(50), rating=2),
        RecentOrder(dish="Pav Bhaji", date=_ago(200), rating=5),
    )
    assert history_adjustment(PAV, ctx, NOW) == -4.0


def test_bad_dates_are_ignored():
    assert history_adjustment(PAV, _with_orders(RecentOrder(dish="Pav Bhaji", date="yesterday")), NOW) == 0.0
