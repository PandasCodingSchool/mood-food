"""Synthetic KitchenCircle data for the Planner Lab. Nothing here touches a real household."""

from __future__ import annotations

from datetime import date, timedelta

RECIPES = [
    {"recipe_id": "dal", "version_id": "dal-v1", "title": "Dal Tadka", "source": "catalog", "default_servings": 4, "cuisine": "North Indian", "effort": "easy",
     "prep_minutes": 10, "cook_minutes": 25, "dietary_tags": ["vegetarian", "vegan"], "allergens": [], "ingredients": ["toor dal", "onion", "tomato", "garlic", "ghee"]},
    {"recipe_id": "rice", "version_id": "rice-v1", "title": "Jeera Rice", "source": "catalog", "default_servings": 4, "cuisine": "North Indian", "effort": "easy",
     "prep_minutes": 20, "cook_minutes": 15, "dietary_tags": ["vegetarian", "vegan"], "allergens": [], "ingredients": ["basmati rice", "cumin seeds", "ghee"]},
    {"recipe_id": "gobi", "version_id": "gobi-v1", "title": "Aloo Gobi", "source": "catalog", "default_servings": 4, "cuisine": "North Indian", "effort": "medium",
     "prep_minutes": 15, "cook_minutes": 25, "dietary_tags": ["vegetarian", "vegan"], "allergens": [], "ingredients": ["potato", "cauliflower", "onion", "tomato"]},
    {"recipe_id": "poha", "version_id": "poha-v1", "title": "Poha", "source": "catalog", "default_servings": 2, "cuisine": "Maharashtrian", "effort": "easy",
     "prep_minutes": 10, "cook_minutes": 10, "dietary_tags": ["vegetarian", "vegan"], "allergens": ["peanut"], "ingredients": ["thick poha", "onion", "peanuts"]},
    {"recipe_id": "paneer", "version_id": "paneer-v1", "title": "Paneer Bhurji", "source": "catalog", "default_servings": 3, "cuisine": "North Indian", "effort": "easy",
     "prep_minutes": 10, "cook_minutes": 10, "dietary_tags": ["vegetarian"], "allergens": ["dairy"], "ingredients": ["paneer", "onion", "tomato"]},
    {"recipe_id": "egg", "version_id": "egg-v1", "title": "Egg Curry", "source": "catalog", "default_servings": 4, "cuisine": "North Indian", "effort": "medium",
     "prep_minutes": 15, "cook_minutes": 25, "dietary_tags": ["eggetarian"], "allergens": ["egg"], "ingredients": ["eggs", "onion", "tomato"]},
    {"recipe_id": "chicken", "version_id": "chicken-v1", "title": "Chicken Curry", "source": "catalog", "default_servings": 4, "cuisine": "North Indian", "effort": "medium",
     "prep_minutes": 40, "cook_minutes": 35, "dietary_tags": ["non_vegetarian"], "allergens": ["dairy"], "ingredients": ["chicken", "onion", "tomato", "curd"]},
    {"recipe_id": "upma", "version_id": "upma-v1", "title": "Vegetable Upma", "source": "catalog", "default_servings": 3, "cuisine": "South Indian", "effort": "easy",
     "prep_minutes": 10, "cook_minutes": 15, "dietary_tags": ["vegetarian"], "allergens": ["gluten"], "ingredients": ["semolina", "carrot", "green peas"]},
]

HOUSEHOLDS = {
    "Solo, no restrictions": [{"user_id": "asha", "role": "owner", "preferences": []}],
    "Family of four with a cook": [
        {"user_id": "asha", "role": "owner", "preferences": [{"strength": "favourite", "category": "cuisine", "value": "South Indian"}]},
        {"user_id": "meera", "role": "member", "preferences": [{"strength": "cannot_eat", "category": "allergen", "value": "peanut"}]},
        {"user_id": "arjun", "role": "member", "preferences": [{"strength": "cannot_eat", "category": "diet", "value": "vegetarian"}]},
        {"user_id": "lakshmi", "role": "cook", "preferences": []},
    ],
    "Roommates, vegan Tuesdays": [
        {"user_id": "kabir", "role": "owner", "preferences": [{"strength": "prefer_less", "category": "protein", "value": "paneer"}]},
        {"user_id": "zoya", "role": "member", "preferences": [{"strength": "never_plan", "category": "dish", "value": "Egg Curry"}]},
    ],
}

RULES = {
    "Solo, no restrictions": [],
    "Family of four with a cook": [{"weekday": None, "strength": "preference", "category": "effort", "constraint": {"effort": ["easy"]}}],
    "Roommates, vegan Tuesdays": [{"weekday": 1, "strength": "hard", "category": "diet", "constraint": {"diet": "vegan"}}],
}

CONFLICTS = {
    "Everyone allergic to onion": {"members": [{"user_id": "a", "role": "owner", "preferences": [{"strength": "cannot_eat", "category": "ingredient", "value": "onion"}]}], "rules": []},
    "Friday must be Thai (no Thai recipes)": {"members": HOUSEHOLDS["Solo, no restrictions"], "rules": [{"weekday": 4, "strength": "hard", "category": "cuisine", "constraint": {"cuisine": "Thai"}}]},
    "Vegan Monday + peanut allergy": {"members": [{"user_id": "a", "role": "owner", "preferences": [{"strength": "cannot_eat", "category": "allergen", "value": "peanuts"}]}],
                                       "rules": [{"weekday": 0, "strength": "hard", "category": "diet", "constraint": {"diet": "vegan"}}]},
}

CART_SCENARIOS = {
    "Plan example: 1.65 kg chicken, 300 g packs only": [{"line_id": "c", "name": "chicken", "canonical_name": "chicken", "quantity": 1.65, "unit": "kg", "dimension": "mass", "base_quantity": 1650}],
    "Mixed week": [
        {"line_id": "o", "name": "onion", "canonical_name": "onion", "quantity": 3, "unit": "piece", "dimension": "piece", "base_quantity": 3},
        {"line_id": "r", "name": "basmati rice", "canonical_name": "basmati rice", "quantity": 1.2, "unit": "kg", "dimension": "mass", "base_quantity": 1200},
        {"line_id": "m", "name": "toned milk", "canonical_name": "milk", "quantity": 750, "unit": "ml", "dimension": "volume", "base_quantity": 750},
        {"line_id": "cl", "name": "curry leaves", "canonical_name": "curry leaves", "quantity": 3, "unit": "sprig", "dimension": "sprig", "base_quantity": 3},
        {"line_id": "x", "name": "dragon fruit jam", "canonical_name": "dragon fruit jam", "quantity": 1, "unit": "piece", "dimension": "piece", "base_quantity": 1},
    ],
}

COOK_MEAL = {"key": "lab-biryani", "title": "Chicken biryani", "ingredients": [{"name": "chicken", "unit": "g"}, {"name": "basmati rice", "unit": "g"}, {"name": "curd", "unit": "g"}],
             "steps": ["Marinate the chicken in curd for 30 minutes.", "Par-boil rice for 6 minutes.", "Layer and cook on dum for 25 minutes."]}


def week(start: date | None = None, blank: int = 7) -> list[dict]:
    monday = (start or date.today()) - timedelta(days=(start or date.today()).weekday())
    return [{"slot_id": f"s{i}", "planned_for": (monday + timedelta(days=i)).isoformat(), "weekday": i, "state": "blank" if i < blank else "leftovers", "servings": 4}
            for i in range(7)]
