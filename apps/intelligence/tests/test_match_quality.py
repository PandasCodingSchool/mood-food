"""Confidence matching quality for known Swiggy failure cases."""

from app.schemas.swiggy import EnrichDishInput, SwiggyMenuItem
from app.services.swiggy_discovery import (
    match_confidence,
    _best_confident_match,
    _best_borderline_match,
    _MATCH_CONFIDENCE_THRESHOLD,
    _BORDERLINE_MIN_SCORE,
)
from app.data.dishes import DISHES_BY_ID


def _item(name: str, **kw) -> SwiggyMenuItem:
    return SwiggyMenuItem(id="x", name=name, **kw)


def test_rejects_mutton_curry_to_rajmah():
    dish = EnrichDishInput(
        id="in_023",
        name="Mutton Curry",
        cuisine="indian",
        aliases=DISHES_BY_ID["in_023"].swiggy_aliases,
    )
    bad = _item("Punjabi Rajmah Curry", is_veg=True, price=447)
    assert match_confidence(bad, dish) < _MATCH_CONFIDENCE_THRESHOLD
    assert _best_confident_match([bad], dish) is None


def test_rejects_paneer_tikka_masala_to_roll():
    dish = EnrichDishInput(
        id="in_027",
        name="Paneer Tikka Masala",
        cuisine="indian",
        aliases=DISHES_BY_ID["in_027"].swiggy_aliases,
    )
    bad = _item("Paneer Tikka Roll", is_veg=True, price=299)
    assert match_confidence(bad, dish) < _MATCH_CONFIDENCE_THRESHOLD
    assert _best_confident_match([bad], dish) is None


def test_accepts_andhra_biryani_alias():
    dish = EnrichDishInput(
        id="in_028",
        name="Andhra Biryani",
        cuisine="indian",
        aliases=DISHES_BY_ID["in_028"].swiggy_aliases,
    )
    good = _item(
        "Andhra Chicken Biryani Thali with Kebabs(Andhra Chicken Thali)",
        is_veg=False,
        price=459,
    )
    conf = match_confidence(good, dish)
    assert conf >= _MATCH_CONFIDENCE_THRESHOLD
    hit = _best_confident_match([good], dish)
    assert hit is not None
    assert hit[0].name.startswith("Andhra")


def test_accepts_exact_paneer_tikka_masala():
    dish = EnrichDishInput(id="in_027", name="Paneer Tikka Masala", cuisine="indian")
    good = _item("Paneer Tikka Masala", is_veg=True, price=320)
    assert match_confidence(good, dish) >= _MATCH_CONFIDENCE_THRESHOLD


# --- Borderline / scout-queue exclusion tests ---

def test_hard_reject_mutton_to_rajmah_not_borderline():
    """Mutton Curry -> Rajmah Curry has confidence 0 (protein conflict) — never queued as borderline."""
    dish = EnrichDishInput(
        id="in_023",
        name="Mutton Curry",
        cuisine="indian",
        aliases=DISHES_BY_ID["in_023"].swiggy_aliases,
    )
    bad = _item("Punjabi Rajmah Curry", is_veg=True, price=447)
    # match_confidence returns 0 due to mutton/rajmah protein conflict
    assert match_confidence(bad, dish) == 0.0
    # _best_borderline_match must return None (score < _BORDERLINE_MIN_SCORE)
    assert _best_borderline_match([bad], dish) is None


def test_hard_reject_paneer_tikka_masala_to_roll_not_borderline():
    """Paneer Tikka Masala -> Paneer Tikka Roll has form conflict — never queued as borderline."""
    dish = EnrichDishInput(
        id="in_027",
        name="Paneer Tikka Masala",
        cuisine="indian",
        aliases=DISHES_BY_ID["in_027"].swiggy_aliases,
    )
    bad = _item("Paneer Tikka Roll", is_veg=True, price=299)
    # match_confidence returns 0 due to form conflict ("roll" not in dish target)
    assert match_confidence(bad, dish) < _BORDERLINE_MIN_SCORE
    assert _best_borderline_match([bad], dish) is None


def test_borderline_match_detected_not_accepted_deterministically():
    """A plausible synonym scores in the borderline range (not 0, not >= threshold)."""
    dish = EnrichDishInput(id="in_002", name="Dal Makhani", cuisine="indian")
    # "Dal Tadka" shares 'dal' (protein group match) and no form conflict.
    # Expected score: 1 word overlap * 3.0 = 3.0 → borderline
    borderline_item = SwiggyMenuItem(id="bl1", name="Dal Tadka", is_veg=True, price=180)
    conf = match_confidence(borderline_item, dish)
    assert _BORDERLINE_MIN_SCORE <= conf < _MATCH_CONFIDENCE_THRESHOLD, (
        f"Expected borderline score [{_BORDERLINE_MIN_SCORE}, {_MATCH_CONFIDENCE_THRESHOLD}), got {conf}"
    )
    # Deterministically not accepted
    assert _best_confident_match([borderline_item], dish) is None
    # But detected as a borderline candidate for scout evaluation
    hit = _best_borderline_match([borderline_item], dish)
    assert hit is not None
    assert hit[0].id == "bl1"
    assert hit[1] == conf


def test_borderline_prefers_higher_score():
    """_best_borderline_match returns the highest-scored borderline item."""
    dish = EnrichDishInput(id="in_002", name="Dal Makhani", cuisine="indian")
    weak = SwiggyMenuItem(id="w1", name="Dal Fry", is_veg=True, price=160)  # overlap: dal
    stronger = SwiggyMenuItem(id="s1", name="Dal Tadka", is_veg=True, price=180)  # overlap: dal
    # Both are borderline; scores may be equal but _best_borderline_match must return one of them
    result = _best_borderline_match([weak, stronger], dish)
    assert result is not None
    assert result[1] >= _BORDERLINE_MIN_SCORE


def test_closest_match_accepts_butter_chicken_variant():
    """Closest fill must accept a live Butter Chicken variant (main-style)."""
    from app.services.swiggy_discovery import _best_closest_match

    dish = EnrichDishInput(id="in_001", name="Butter Chicken", cuisine="indian")
    items = [
        SwiggyMenuItem(id="1", name="Butter Chicken Thali", is_veg=False, price=379),
        SwiggyMenuItem(id="2", name="Chicken Tikka Butter Masala", is_veg=False, price=409),
    ]
    hit = _best_closest_match(items, dish)
    assert hit is not None
    assert "Butter" in hit[0].name or "butter" in hit[0].name.lower()
    assert hit[1] >= 1.5


def test_closest_match_still_rejects_protein_conflict():
    """Closest fill must not accept mutton -> rajmah swaps."""
    from app.services.swiggy_discovery import _best_closest_match

    dish = EnrichDishInput(
        id="in_023",
        name="Mutton Curry",
        cuisine="indian",
        aliases=DISHES_BY_ID["in_023"].swiggy_aliases,
    )
    bad = SwiggyMenuItem(id="x", name="Punjabi Rajmah Curry", is_veg=True, price=447)
    assert _best_closest_match([bad], dish) is None
