from fastapi.testclient import TestClient

from app.kitchen_circle import chat
from app.kitchen_circle.chat import interpret
from app.kitchen_circle.chat_schemas import InterpretRequest
from app.main import app

client = TestClient(app)
DAYS = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]


def req(message: str, members: int = 1, **extra) -> InterpretRequest:
    body = {
        "message": message, "today": "2026-11-02", "member_count": members,
        "days": [{"slot_id": f"s{i}", "planned_for": d, "weekday": i, "state": "blank"} for i, d in enumerate(DAYS)],
        "recipes": [{"recipe_id": "dal", "version_id": "dal-v1", "title": "Dal Tadka"}, {"recipe_id": "poha", "version_id": "poha-v1", "title": "Poha"}],
        "rules": [], "allow_llm": False,
    }
    body.update(extra)
    return InterpretRequest.model_validate(body)


async def test_going_out_friday_solo_marks_household_out():
    res = await interpret(req("We are going out Friday"))
    assert [(a.type, a.slot_id, a.state) for a in res.actions] == [("SET_DAY_STATUS", "s4", "household_out")]
    assert res.clarification is None and res.source == "rules"


async def test_going_out_friday_multi_member_asks_everyone_or_only_me():
    res = await interpret(req("We are going out Friday", members=3))
    assert not res.actions
    options = {o.label: o.actions for o in res.clarification.options}
    assert [a.state for a in options["Everyone is out"]] == ["household_out"]
    assert [(a.type, a.status) for a in options["Only me"]] == [("SET_ATTENDANCE", "absent")]
    everyone = await interpret(req("Everyone is eating out on Friday", members=3))
    assert everyone.actions[0].state == "household_out"


async def test_meal_with_known_recipe_free_text_and_servings():
    res = await interpret(req("Let's make dal tadka on Wednesday for 4 people"))
    a = res.actions[0]
    assert (a.type, a.slot_id, a.recipe_id, a.recipe_version_id, a.servings) == ("SET_MEAL", "s2", "dal", "dal-v1", 4)
    free = await interpret(req("we want pizza for saturday"))
    labels = [o.label for o in free.clarification.options]
    assert labels[0] == "Write a recipe for Pizza (AI)" and labels[-1] == "Just write “Pizza”"
    assert free.clarification.options[0].actions[0].type == "CREATE_RECIPE" and free.clarification.options[0].actions[0].slot_id == "s5"
    servings = await interpret(req("cook for 6 people on sunday"))
    assert (servings.actions[0].type, servings.actions[0].servings, servings.actions[0].slot_id) == ("SET_SERVINGS", 6, "s6")


async def test_missing_day_asks_which_day_with_concrete_options():
    res = await interpret(req("make poha"))
    assert res.clarification.question == "Which day should Poha go on?"
    assert len(res.clarification.options) == 7
    assert res.clarification.options[0].actions[0].recipe_id == "poha"


async def test_day_status_locks_attendance_and_ranges():
    assert (await interpret(req("leftovers tomorrow"))).actions[0].state == "leftovers"
    assert [a.slot_id for a in (await interpret(req("lock the weekend"))).actions] == ["s5", "s6"]
    assert (await interpret(req("unlock monday"))).actions[0].type == "UNLOCK_SLOT"
    me = await interpret(req("I won't be home on Thursday", members=2))
    assert [(a.type, a.status, a.slot_id) for a in me.actions] == [("SET_ATTENDANCE", "absent", "s3")]
    assert (await interpret(req("clear tuesday"))).actions[0].type == "CLEAR_DAY"
    assert (await interpret(req("no cooking on the 6th"))).actions[0].slot_id == "s4"


async def test_rules_recurring_clarify_and_turn_off():
    weekly = await interpret(req("every Monday vegetarian"))
    assert [(a.type, a.weekday, a.constraint) for a in weekly.actions] == [("CREATE_RECURRING_RULE", 0, {"diet": "vegetarian"})]
    plural = await interpret(req("no onion on tuesdays"))
    assert plural.actions[0].constraint == {"exclude_ingredients": ["onion"]}
    unclear = await interpret(req("vegetarian on Monday"))
    assert [o.label for o in unclear.clarification.options] == ["Every week", "Just this week"]
    week_only = unclear.clarification.options[1].actions[0]
    assert (week_only.type, week_only.this_week_only, week_only.summary) == ("CREATE_RECURRING_RULE", True, "This week, Monday: vegetarian")
    rules = [{"rule_id": "r1", "weekday": 0, "strength": "hard", "category": "diet", "constraint": {"diet": "vegetarian"}}]
    off = await interpret(req("stop the monday rule", rules=rules))
    assert [(a.type, a.rule_id, a.active) for a in off.actions] == [("UPDATE_RECURRING_RULE", "r1", False)]


async def test_autofill_and_grocery_requests():
    assert (await interpret(req("can you fill the rest of the week?"))).actions[0].type == "REQUEST_AUTOFILL"
    week = await interpret(req("make a grocery list"))
    assert (week.actions[0].type, week.actions[0].scope) == ("CREATE_GROCERY_SNAPSHOT", "week")
    day = await interpret(req("groceries for friday"))
    assert (day.actions[0].scope, day.actions[0].slot_id) == ("day", "s4")


async def test_unknown_message_without_llm_returns_help_and_no_actions():
    res = await interpret(req("what a lovely day"))
    assert res.source == "none" and not res.actions and "Try" in res.reply


def test_chat_route_mounted():
    resp = client.post("/api/kitchen-circle/chat/interpret", json=req("lock friday").model_dump())
    assert resp.status_code == 200, resp.text
    assert resp.json()["actions"][0]["type"] == "LOCK_SLOT"


TWO_WEEKS = [{"slot_id": f"w{i}", "planned_for": f"2026-11-{4 + i:02d}", "weekday": (2 + i) % 7, "state": "blank"} for i in range(12)]  # Wed 4 Nov → Sun 15 Nov


async def test_weekday_means_the_next_one_across_this_and_next_week():
    body = {"today": "2026-11-04", "days": TWO_WEEKS}
    monday = await interpret(req("leftovers on monday", **body))
    assert [a.planned_for for a in monday.actions] == ["2026-11-09"]  # next week's Monday, not missing
    friday = await interpret(req("leftovers friday", **body))
    assert [a.planned_for for a in friday.actions] == ["2026-11-06"]  # this Friday only, never both
    week = await interpret(req("no cooking all week", **body))
    assert [a.planned_for for a in week.actions] == ["2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]


async def test_replacing_a_planned_meal_is_said_back():
    days = [{"slot_id": f"s{i}", "planned_for": d, "weekday": i, "state": "planned" if i == 4 else "blank", "meal_title": "Dal Tadka" if i == 4 else None} for i, d in enumerate(DAYS)]
    res = await interpret(req("make poha on friday", days=days))
    assert (res.actions[0].replaces, res.actions[0].summary) == ("Dal Tadka", "Poha on Friday (instead of Dal Tadka)")


async def test_explicit_recipe_requests_create_an_ai_draft_action():
    res = await interpret(req("create a recipe for fried chicken on friday"))
    a = res.actions[0]
    assert (a.type, a.dish, a.slot_id) == ("CREATE_RECIPE", "Fried Chicken", "s4")
    no_day = await interpret(req("write me a recipe for butter chicken"))
    assert (no_day.actions[0].dish, no_day.actions[0].slot_id) == ("Butter Chicken", None)


MORE = [{"recipe_id": "c65", "version_id": "c65-v1", "title": "Chicken 65"}, {"recipe_id": "cc", "version_id": "cc-v1", "title": "Chicken Curry"},
        {"recipe_id": "rajma", "version_id": "rajma-v1", "title": "Rajma Chawal"}, {"recipe_id": "pt", "version_id": "pt-v1", "title": "Paneer Tikka"},
        {"recipe_id": "pav", "version_id": "pav-v1", "title": "Pav Bhaji"}, {"recipe_id": "egg", "version_id": "egg-v1", "title": "Egg Curry"}]


def test_same_dish_needs_every_asked_word():
    assert chat.same_dish("pav bhaji", "Pav Bhaji") and chat.same_dish("rajmah", "Rajma Chawal") and chat.same_dish("anda curry", "Egg Curry")
    assert not chat.same_dish("chicken tacos", "Chicken 65")
    assert not chat.same_dish("paneer tikka masala", "Paneer Tikka")


async def test_a_different_dish_never_maps_to_a_recipe_that_shares_a_word():
    recipes = req("x").model_dump()["recipes"] + MORE
    tacos = await interpret(req("Can we do chicken tacos on wednesday?", recipes=recipes))
    assert not tacos.actions and tacos.clarification.options[0].actions[0].type == "CREATE_RECIPE"
    assert tacos.clarification.options[0].actions[0].dish == "Chicken Tacos" and tacos.clarification.options[0].actions[0].slot_id == "s2"
    pav = await interpret(req("Can we do pav bhaji on thursday?", recipes=recipes))
    assert (pav.actions[0].recipe_id, pav.actions[0].slot_id) == ("pav", "s3")
    rajmah = await interpret(req("make rajmah on monday", recipes=recipes, today="2026-11-01"))
    assert rajmah.actions[0].recipe_id == "rajma"
    which = await interpret(req("let's have chicken on friday", recipes=recipes))
    assert [o.label for o in which.clarification.options] == ["Chicken 65", "Chicken Curry", "Write a new Chicken recipe (AI)"]


def test_haldi_by_name_is_an_address_not_an_ingredient():
    assert chat.strip_address("Haldi, make poha on monday") == "make poha on monday"
    assert chat.strip_address("hey haldi: leftovers tomorrow") == "leftovers tomorrow"
    assert chat.strip_address("haldi can we do pav bhaji thursday") == "can we do pav bhaji thursday"
    assert chat.strip_address("no haldi on monday") == "no haldi on monday"
    assert chat.strip_address("haldi milk on sunday") == "haldi milk on sunday"
    assert chat.strip_address("Haldi") == "Haldi"


async def test_messages_addressed_to_haldi_still_act():
    res = await interpret(req("Haldi, make poha on wednesday"))
    assert (res.actions[0].type, res.actions[0].recipe_id, res.actions[0].slot_id) == ("SET_MEAL", "poha", "s2")
    rule = await interpret(req("no haldi on tuesdays"))
    assert rule.actions[0].constraint == {"exclude_ingredients": ["haldi"]}
