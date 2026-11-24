from fastapi.testclient import TestClient

from app.kitchen_circle.planner import autofill
from app.kitchen_circle.schemas import AutofillRequest
from app.main import app

client = TestClient(app)

RECIPES = [
    {"recipe_id": "dal", "version_id": "dal-v1", "title": "Dal Tadka", "source": "catalog", "default_servings": 4, "cuisine": "North Indian",
     "effort": "easy", "prep_minutes": 10, "cook_minutes": 25, "dietary_tags": ["vegetarian", "vegan"], "ingredients": ["toor dal", "onion", "tomato", "garlic", "salt"]},
    {"recipe_id": "chicken", "version_id": "chicken-v1", "title": "Chicken Curry", "source": "catalog", "default_servings": 4, "cuisine": "North Indian",
     "effort": "medium", "prep_minutes": 40, "cook_minutes": 35, "dietary_tags": ["non_vegetarian"], "allergens": ["dairy"], "ingredients": ["chicken", "onion", "tomato", "curd"]},
    {"recipe_id": "egg", "version_id": "egg-v1", "title": "Egg Curry", "source": "catalog", "default_servings": 4, "cuisine": "North Indian",
     "effort": "medium", "prep_minutes": 15, "cook_minutes": 25, "dietary_tags": ["eggetarian"], "allergens": ["egg"], "ingredients": ["eggs", "onion", "tomato"]},
    {"recipe_id": "poha", "version_id": "poha-v1", "title": "Poha", "source": "catalog", "default_servings": 2, "cuisine": "Maharashtrian",
     "effort": "easy", "prep_minutes": 10, "cook_minutes": 10, "dietary_tags": ["vegetarian", "vegan"], "allergens": ["peanut"], "ingredients": ["thick poha", "onion", "peanuts"]},
    {"recipe_id": "paneer", "version_id": "paneer-v1", "title": "Paneer Bhurji", "source": "catalog", "default_servings": 3, "cuisine": "North Indian",
     "effort": "easy", "prep_minutes": 10, "cook_minutes": 10, "dietary_tags": ["vegetarian"], "allergens": ["dairy"], "ingredients": ["paneer", "onion", "tomato"]},
    {"recipe_id": "upma", "version_id": "upma-v1", "title": "Vegetable Upma", "source": "catalog", "default_servings": 3, "cuisine": "South Indian",
     "effort": "easy", "prep_minutes": 10, "cook_minutes": 15, "dietary_tags": ["vegetarian"], "allergens": ["gluten"], "ingredients": ["semolina", "carrot", "green peas"]},
    {"recipe_id": "draft", "version_id": "draft-v1", "title": "Unreviewed Pulao", "source": "ai_draft", "default_servings": 2, "ingredients": ["rice"]},
]


def week(states=None, recipe_ids=None):
    days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]
    states = states or {}
    recipe_ids = recipe_ids or {}
    return [{"slot_id": f"s{i}", "planned_for": d, "weekday": i, "state": states.get(i, "blank"), "servings": 2, "recipe_id": recipe_ids.get(i)} for i, d in enumerate(days)]


def request(**overrides) -> AutofillRequest:
    body = {"members": [{"user_id": "a", "role": "owner"}, {"user_id": "b", "role": "member"}], "slots": week(), "recipes": RECIPES}
    body.update(overrides)
    return AutofillRequest.model_validate(body)


def picks(response):
    return {p.planned_for: p.pick.recipe_id for p in response.proposals}


def test_fills_only_blank_days_never_repeats_and_never_uses_unreviewed_drafts():
    res = autofill(request(slots=week(states={1: "locked", 3: "leftovers"}, recipe_ids={1: "dal"})))
    days = picks(res)
    assert set(days) == {"2026-11-02", "2026-11-04", "2026-11-06", "2026-11-07", "2026-11-08"}
    assert len(set(days.values())) == len(days)  # no within-week repeat while unused recipes exist
    assert "dal" not in days.values()  # already cooked on the locked Tuesday
    assert "draft" not in days.values()
    assert all(p.pick.reasons for p in res.proposals) and all(a.reasons for p in res.proposals for a in p.alternatives)


def test_attending_member_allergy_and_diet_are_hard_but_absent_members_do_not_restrict():
    members = [{"user_id": "a", "role": "owner", "preferences": [{"strength": "cannot_eat", "category": "diet", "value": "vegetarian"}]},
               {"user_id": "b", "role": "member", "preferences": [{"strength": "cannot_eat", "category": "allergen", "value": "dairy"}]}]
    slots = week()
    slots[2]["attendance"] = [{"user_id": "a", "status": "absent"}]  # Wednesday: only b eats
    res = autofill(request(members=members, slots=slots))
    by_day = {p.planned_for: p for p in res.proposals}
    for day, proposal in by_day.items():
        recipe = next(r for r in RECIPES if r["recipe_id"] == proposal.pick.recipe_id)
        assert "dairy" not in recipe.get("allergens", [])  # b always eats
        if day != "2026-11-04":
            assert recipe["recipe_id"] not in {"chicken", "egg"}  # a is vegetarian (no eggs)
    assert by_day["2026-11-04"].servings == 1
    assert "Safe for every diet and allergy at the table" in by_day["2026-11-02"].pick.reasons


def test_hard_weekday_rule_and_never_plan_are_enforced():
    rules = [{"weekday": 0, "strength": "hard", "category": "diet", "constraint": {"diet": "vegan"}},
             {"weekday": None, "strength": "preference", "category": "mood", "constraint": {"vibe": "cosy"}}]
    members = [{"user_id": "a", "role": "owner", "preferences": [{"strength": "never_plan", "category": "dish", "value": "Poha"}]}]
    res = autofill(request(rules=rules, members=members))
    monday = next(p for p in res.proposals if p.planned_for == "2026-11-02")
    assert monday.pick.recipe_id == "dal"  # only vegan recipe once Poha is never planned
    assert "poha" not in picks(res).values()
    assert any("Monday" in reason for reason in monday.pick.reasons)
    assert res.ignored_rules == ["mood: 'vibe' is not understood by the planner yet"]


def test_unfillable_day_is_reported_not_guessed():
    rules = [{"weekday": 4, "strength": "hard", "category": "cuisine", "constraint": {"cuisine": "Thai"}}]
    res = autofill(request(rules=rules))
    assert "2026-11-06" not in picks(res)
    assert res.unfilled[0].planned_for == "2026-11-06"
    assert "couldn't be filled" in res.summary


def test_favourites_rank_up_and_repeats_from_last_week_rank_down():
    members = [{"user_id": "a", "role": "owner", "preferences": [{"strength": "favourite", "category": "cuisine", "value": "South Indian"}]}]
    res = autofill(request(members=members, slots=week()[:1], history=[{"recipe_id": "dal", "planned_for": "2026-10-28"}]))
    pick = res.proposals[0].pick
    assert pick.recipe_id == "upma"
    assert pick.breakdown.favourites > 0
    dal = next(a for a in res.proposals[0].alternatives if a.recipe_id == "dal") if any(a.recipe_id == "dal" for a in res.proposals[0].alternatives) else None
    assert dal is None or dal.breakdown.repeat < 0


def test_neighbouring_days_avoid_the_same_protein_and_cuisine():
    res = autofill(request(slots=week()[:3]))
    breakdowns = [p.pick for p in res.proposals]
    assert breakdowns[1].breakdown.diversity == 0  # second day differs from the first
    assert len({p.recipe_id for p in breakdowns}) == 3


def test_swap_exclusion_and_seed_change_the_pick_deterministically():
    first = autofill(request(slots=week()[:1]))
    pick = first.proposals[0].pick.recipe_id
    swapped = autofill(request(slots=week()[:1], exclude={"s0": [pick]}))
    assert swapped.proposals[0].pick.recipe_id != pick
    assert autofill(request(slots=week()[:1], seed=7)) == autofill(request(slots=week()[:1], seed=7))


def test_cook_only_counts_as_eater_when_attending():
    members = [{"user_id": "a", "role": "owner"},
               {"user_id": "cook", "role": "cook", "preferences": [{"strength": "cannot_eat", "category": "ingredient", "value": "onion"}]}]
    res = autofill(request(members=members, slots=week()[:2]))
    assert any(p.pick.recipe_id != "upma" for p in res.proposals)  # onion recipes allowed: the cook is not eating
    slots = week()[:1]
    slots[0]["attendance"] = [{"user_id": "cook", "status": "attending"}]
    eating = autofill(request(members=members, slots=slots))
    assert eating.proposals[0].pick.recipe_id == "upma"  # the only recipe without onion


def test_route_is_mounted_and_validates():
    body = request(slots=week()[:2]).model_dump()
    resp = client.post("/api/kitchen-circle/autofill", json=body)
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["proposals"]) == 2
    assert client.post("/api/kitchen-circle/autofill", json={"members": []}).status_code == 422


def test_first_pick_without_tastes_or_history_still_has_a_reason():
    res = autofill(request(members=[{"user_id": "a", "role": "owner"}], slots=week()[:1]))
    assert res.proposals[0].pick.reasons[-1] == "Easy · North Indian — fits everyone eating"


def test_moodfood_imported_allergy_category_is_enforced():
    # PlannerProfileAdapter imports allergies as category "allergy" (not "allergen").
    members = [{"user_id": "a", "role": "owner", "preferences": [{"strength": "cannot_eat", "category": "allergy", "value": "dairy"}]}]
    res = autofill(request(members=members))
    picked = {p.pick.recipe_id for p in res.proposals}
    assert not picked & {"chicken", "paneer"}  # both contain dairy


def test_feedback_shapes_future_fit_and_learns_weeknight_effort():
    loved = autofill(request(members=[{"user_id": "a", "role": "owner"}], slots=week()[:1],
                             feedback=[{"recipe_id": "poha", "outcome": "loved", "weekday": 2}]))
    assert loved.proposals[0].pick.recipe_id == "poha"
    assert "Your household loved it last time" in loved.proposals[0].pick.reasons
    base = autofill(request(members=[{"user_id": "a", "role": "owner"}], slots=week()[:1]))
    skipped = autofill(request(members=[{"user_id": "a", "role": "owner"}], slots=week()[:1],
                               feedback=[{"recipe_id": base.proposals[0].pick.recipe_id, "outcome": "skipped", "weekday": 1}] * 2))
    assert skipped.proposals[0].pick.recipe_id != base.proposals[0].pick.recipe_id
    slow = [{"recipe_id": "chicken", "outcome": "skipped", "weekday": 0}, {"recipe_id": "chicken", "outcome": "skipped", "weekday": 1}]
    learned = autofill(request(slots=week()[:5], feedback=slow))
    assert all(p.pick.breakdown.feedback <= 0 or p.pick.recipe_id != "chicken" for p in learned.proposals)


def test_cook_unavailable_favours_quick_easy_dishes_and_budget_is_reported_not_scored():
    rules = [{"weekday": 6, "strength": "hard", "category": "cook", "constraint": {"cook_unavailable": True}},
             {"weekday": 0, "strength": "preference", "category": "budget", "constraint": {"budget_per_serving_rupees": 60}}]
    res = autofill(request(rules=rules))
    sunday = next(p for p in res.proposals if p.planned_for == "2026-11-08")
    recipe = next(r for r in RECIPES if r["recipe_id"] == sunday.pick.recipe_id)
    assert recipe["effort"] == "easy" and recipe["prep_minutes"] + recipe["cook_minutes"] <= 35
    assert res.ignored_rules == ["budget: budget is saved; recipes don't have prices yet"]
