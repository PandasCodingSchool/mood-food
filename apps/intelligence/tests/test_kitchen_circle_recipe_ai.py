from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.kitchen_circle import recipe_ai
from app.kitchen_circle.recipe_ai import AiRecipe, GenerateRequest, generate, harden
from app.main import app

client = TestClient(app)


def ai_recipe(**overrides) -> AiRecipe:
    body = {
        "title": "Fried Chicken", "cuisine": "Indian", "effort": "medium", "freshness_class": "perishable", "prep_minutes": 20, "cook_minutes": 25,
        "default_servings": 4, "dietary_tags": ["vegetarian"], "allergens": [],
        "ingredients": [{"name": "chicken drumsticks", "quantity": 800, "unit": "g"}, {"name": "curd", "quantity": 0.5, "unit": "cup"},
                        {"name": "maida", "quantity": 0.5, "unit": "cup"}, {"name": "oil", "quantity": 500, "unit": "ml"},
                        {"name": "salt", "quantity": 1, "unit": "to taste", "optional": True}],
        "steps": ["Marinate the chicken in curd and spices for 30 minutes.", "Coat in maida and deep-fry until golden."],
    }
    body.update(overrides)
    return AiRecipe.model_validate(body)


def test_safety_facts_are_rederived_from_ingredients():
    hardened, added = harden(ai_recipe())
    assert "non_vegetarian" in hardened.dietary_tags and "vegetarian" not in hardened.dietary_tags
    assert added == ["dairy", "gluten"] and set(hardened.allergens) >= {"dairy", "gluten"}
    veg, _ = harden(ai_recipe(title="Paneer Tikka", dietary_tags=["vegan"], ingredients=[{"name": "paneer", "quantity": 250, "unit": "g"}, {"name": "capsicum", "quantity": 1, "unit": "piece"}]))
    assert veg.dietary_tags == ["vegetarian"]  # vegan is impossible with paneer


async def test_generate_warns_about_household_conflicts_without_naming_anyone():
    members = [{"user_id": "m1", "role": "owner", "preferences": [{"strength": "cannot_eat", "category": "diet", "value": "vegetarian"}]}]
    call = AsyncMock(return_value=ai_recipe())
    with patch.object(recipe_ai, "parse_structured", call):
        res = await generate(GenerateRequest(dish="fried chicken", servings=4, members=members))
    assert res.warnings[0].startswith("Not safe for everyone eating")
    assert "m1" not in " ".join(res.warnings)
    assert "diet: vegetarian" in call.await_args.args[2][0]["content"]  # limits passed, aggregated


def test_generate_route_reports_unavailable_without_a_key_and_fit_check_works():
    resp = client.post("/api/kitchen-circle/recipes/generate", json={"dish": "fried chicken"})
    assert resp.status_code == 200 and resp.json() == {"success": False, "error": "Recipe writing isn't available right now."}
    fit = client.post("/api/kitchen-circle/check-fit", json={
        "recipe": {"recipe_id": "r", "version_id": "v", "title": "Poha", "source": "catalog", "default_servings": 2, "allergens": ["peanut"], "ingredients": ["poha", "peanuts"]},
        "members": [{"user_id": "a", "role": "owner", "preferences": [{"strength": "cannot_eat", "category": "allergen", "value": "peanuts"}]}],
        "slot": {"slot_id": "s", "planned_for": "2026-11-06", "weekday": 4, "state": "planned", "servings": 2}})
    assert fit.json() == {"safe": False, "warnings": ["Not safe for everyone eating — it conflicts with an allergy or diet at the table."]}


def test_plant_milks_are_not_dairy():
    from app.kitchen_circle.recipe_ai import AiIngredient, AiRecipe, harden

    recipe = AiRecipe(title="Veg Stew", cuisine="Kerala", effort="easy", freshness_class="fresh", prep_minutes=10, cook_minutes=20,
                      default_servings=4, dietary_tags=["vegan"], allergens=[],
                      ingredients=[AiIngredient(name="coconut milk", quantity=400, unit="ml"), AiIngredient(name="potato", quantity=2, unit="piece")],
                      steps=["Simmer.", "Serve."])
    hardened, added = harden(recipe)
    assert added == [] and "vegan" in hardened.dietary_tags
    curd = recipe.model_copy(update={"ingredients": [*recipe.ingredients, AiIngredient(name="curd", quantity=1, unit="cup")]})
    assert "dairy" in harden(curd)[1] and "vegan" not in harden(curd)[0].dietary_tags


def test_ingredient_names_match_the_catalog_and_merge():
    from app.kitchen_circle.recipe_ai import AiIngredient, AiRecipe, canonical_ingredient, tidy_ingredients

    known = {"onion", "tomato", "cumin powder", "coriander leaves", "kashmiri red chilli powder", "salt", "lemon"}
    assert canonical_ingredient("Onion, finely chopped", known) == "onion"
    assert canonical_ingredient("Tomatoes, finely chopped", known) == "tomato"
    assert canonical_ingredient("Ground cumin", known) == "cumin powder"
    assert canonical_ingredient("Fresh coriander leaves, chopped", known) == "coriander leaves"
    assert canonical_ingredient("Kashmiri chilli powder", known) == "kashmiri red chilli powder"
    assert canonical_ingredient("Boneless chicken thighs, cut into small pieces", known) == "chicken thighs"
    recipe = AiRecipe(title="Test", cuisine="Indian", effort="easy", freshness_class="fresh", prep_minutes=5, cook_minutes=5, default_servings=2,
                      ingredients=[AiIngredient(name="Salt", quantity=0.5, unit="tsp"), AiIngredient(name="salt (for marinade)", quantity=0.5, unit="tsp"),
                                   AiIngredient(name="Onions", quantity=1, unit="piece")], steps=["a", "b"])
    tidy = tidy_ingredients(recipe, sorted(known))
    assert [(i.name, i.quantity) for i in tidy.ingredients] == [("salt", 1.0), ("onion", 1)]
