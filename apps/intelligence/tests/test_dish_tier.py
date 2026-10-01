"""Tests for the keyword tier classifier used on the Swiggy hot path.

Guards against add-ons/sides/condiments (sauce, pav, extra puri) leaking into
"budget"/"healthier" swaps as if they were real standalone dishes.
"""

from app.services.dish_tier import TierClassifyInput, _keyword_fallback


def _classify(*names: str) -> dict[str, str]:
    items = [TierClassifyInput(id=str(i), name=n) for i, n in enumerate(names)]
    tiers = _keyword_fallback(items)
    return {n: tiers[str(i)] for i, n in enumerate(names)}


def test_sides_condiments_and_addons_are_complimentary():
    tiers = _classify(
        "Vegan Garlic Sauce (toum)",
        "Extra Puri",
        "Butter Pav",
        "Butter Naan",
        "Garlic Naan",
        "Tandoori Roti",
        "Papad",
        "Mixed Raita",
        "Green Salad",
        "Schezwan Sauce",
        "Garlic Dip",
    )
    for name, tier in tiers.items():
        assert tier == "complimentary", f"{name} should be complimentary, got {tier}"


def test_real_dishes_stay_main():
    tiers = _classify(
        "Pav Bhaji",
        "Vada Pav",
        "Masala Pav",
        "Chicken Biryani",
        "Butter Chicken",
        "White Sauce Pasta",
        "Greek Salad",
        "Paneer Butter Masala",
        "Dal Makhani",
        "Cheese Pizza",
        "Puri Bhaji",
    )
    for name, tier in tiers.items():
        assert tier == "main", f"{name} should be main, got {tier}"
