"""KitchenCircle kitchen agent: tool calls are validated, read tools ground decisions, code guards hard failures."""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.kitchen_circle import agent
from app.kitchen_circle.chat import interpret
from app.kitchen_circle.chat_schemas import InterpretRequest, ReplyRequest
from app.main import app

client = TestClient(app)
DAYS = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]
RECIPES = [
    {"recipe_id": "c65", "version_id": "c65-v1", "title": "Chicken 65", "dietary_tags": ["non_vegetarian"], "allergens": ["dairy"], "ingredients": ["chicken", "curd"], "source": "catalog"},
    {"recipe_id": "pav", "version_id": "pav-v1", "title": "Pav Bhaji", "dietary_tags": ["vegetarian"], "allergens": ["dairy", "gluten"], "ingredients": ["pav", "potato", "butter"], "source": "catalog"},
    {"recipe_id": "lemon", "version_id": "lemon-v1", "title": "Lemon Rice", "dietary_tags": ["vegetarian", "vegan"], "allergens": ["peanut"], "ingredients": ["rice", "peanuts", "lemon"], "source": "catalog"},
    {"recipe_id": "rajma", "version_id": "rajma-v1", "title": "Rajma Chawal", "dietary_tags": ["vegetarian"], "allergens": [], "ingredients": ["rajma", "rice"], "source": "catalog"},
]


def req(message: str, **extra) -> InterpretRequest:
    body = {"message": message, "today": "2026-11-02", "member_count": 2, "allow_llm": True, "recipes": RECIPES,
            "days": [{"slot_id": f"s{i}", "planned_for": d, "weekday": i, "state": "planned" if i == 3 else "blank", "meal_title": "Egg Curry" if i == 3 else None} for i, d in enumerate(DAYS)],
            "members": [{"user_id": "u1", "role": "owner", "preferences": [{"strength": "cannot_eat", "category": "allergy", "value": "peanut"}]},
                        {"user_id": "u2", "role": "member", "preferences": []}]}
    body.update(extra)
    return InterpretRequest.model_validate(body)


def call(name: str, **args):
    return SimpleNamespace(id=f"call_{name}_{len(args)}", type="function", function=SimpleNamespace(name=name, arguments=json.dumps(args)))


def turn(*calls, content: str = ""):
    return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content, tool_calls=list(calls) or None))], usage=None)


def scripted(*turns):
    create = AsyncMock(side_effect=list(turns))
    fake = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return create, patch.object(agent, "async_openai", return_value=fake)


def keyed():
    return patch.object(agent.settings, "openai_api_key", "test-key")


async def test_agent_looks_up_then_acts_and_tool_results_feed_back():
    create, client_patch = scripted(
        turn(call("find_recipes", query="pav bhaji", diet=None)),
        turn(call("check_dish", recipe_id="pav", date="2026-11-05")),
        turn(call("plan_meal", date="2026-11-05", recipe_id="pav", meal_title=None, servings=None)),
        turn(content="Pav Bhaji is on Thursday instead of Egg Curry."),
    )
    with keyed(), client_patch:
        res = await interpret(req("Can we do pav bhaji on thursday?"))
    assert res.source == "agent"
    assert [(a.type, a.slot_id, a.recipe_version_id, a.replaces) for a in res.actions] == [("SET_MEAL", "s3", "pav-v1", "Egg Curry")]
    assert [s["tool"] for s in res.steps] == ["find_recipes", "check_dish", "plan_meal"]
    found = res.steps[0]["result"]["results"][0]
    assert found["recipe_id"] == "pav" and found["same_dish_as_query"] is True
    assert res.steps[1]["result"]["safe_for_everyone"] is True
    # tool results were sent back to the model before its next turn
    second_call_messages = create.await_args_list[1].kwargs["messages"]
    assert second_call_messages[-1]["role"] == "tool" and "Pav Bhaji" in second_call_messages[-1]["content"]
    assert create.await_args_list[0].kwargs["model"] == agent.settings.kitchen_circle_agent_model


async def test_find_recipes_never_calls_a_lookalike_the_same_dish():
    result = agent.KitchenAgent(req("x")).find_recipes("chicken tacos")
    assert all(not r["same_dish_as_query"] for r in result["results"])


async def test_check_dish_flags_allergies_without_naming_anyone():
    result = agent.KitchenAgent(req("x")).check_dish("lemon", "2026-11-04")
    assert result["safe_for_everyone"] is False
    assert "peanut" not in json.dumps(result).lower() and "u1" not in json.dumps(result)


async def test_invalid_tool_calls_go_back_as_errors_and_the_model_corrects_itself():
    create, client_patch = scripted(
        turn(call("plan_meal", date="2026-12-25", recipe_id="pav", meal_title=None, servings=None),
             call("set_servings", date="2026-11-04", servings=99)),
        turn(call("plan_meal", date="2026-11-03", recipe_id="pav", meal_title=None, servings=None)),
        turn(content="Done."),
    )
    with keyed(), client_patch:
        res = await interpret(req("pav bhaji tuesday"))
    assert [(a.type, a.slot_id) for a in res.actions] == [("SET_MEAL", "s1")]
    assert res.steps[0]["result"]["ok"] is False and res.steps[1]["result"]["ok"] is False


async def test_every_planner_action_is_a_tool():
    rule_req = req("x", rules=[{"rule_id": "r1", "weekday": 0, "strength": "hard", "category": "diet", "constraint": {"diet": "vegetarian"}}])
    a = agent.KitchenAgent(rule_req)
    calls = [("write_recipe", {"dish": "Chicken Tacos", "date": "2026-11-04"}), ("clear_day", {"date": "2026-11-02"}),
             ("set_day_status", {"date": "2026-11-06", "state": "household_out"}), ("set_servings", {"date": "2026-11-04", "servings": 6}),
             ("set_my_attendance", {"date": "2026-11-04", "eating": False}), ("lock_day", {"date": "2026-11-04"}), ("unlock_day", {"date": "2026-11-04"}),
             ("add_rule", {"weekday": 1, "diet": "vegetarian", "exclude_ingredient": None, "this_week_only": True}),
             ("turn_off_rule", {"rule_id": "r1"}), ("suggest_meals", {}), ("make_grocery_list", {"scope": "day", "date": "2026-11-04"})]
    for name, args in calls:
        assert a.run_tool(name, args)["ok"] is True, name
    assert [x.type for x in a.actions] == ["CREATE_RECIPE", "CLEAR_DAY", "SET_DAY_STATUS", "SET_SERVINGS", "SET_ATTENDANCE", "LOCK_SLOT", "UNLOCK_SLOT",
                                           "CREATE_RECURRING_RULE", "UPDATE_RECURRING_RULE", "REQUEST_AUTOFILL", "CREATE_GROCERY_SNAPSHOT"]
    assert a.actions[4].status == "absent" and a.actions[7].this_week_only is True and a.actions[10].slot_id == "s2"


async def test_code_guard_turns_a_lookalike_plan_into_writing_the_asked_dish():
    _, client_patch = scripted(turn(call("plan_meal", date="2026-11-04", recipe_id="c65", meal_title=None, servings=None)), turn(content="Planned."))
    with keyed(), client_patch:
        res = await interpret(req("Can we do chicken tacos on wednesday?"))
    assert [(a.type, a.dish, a.slot_id) for a in res.actions] == [("CREATE_RECIPE", "Chicken Tacos", "s2")]


async def test_agent_questions_need_real_answers():
    _, client_patch = scripted(turn(call("ask_member", question="Which day?", options=[
        {"label": "Friday", "actions": [{**{k: None for k in agent._ACTION_PROPS}, "type": "CREATE_RECIPE", "dish": "Fried chicken", "planned_for": "2026-11-06"}]},
        {"label": "Nonsense", "actions": [{**{k: None for k in agent._ACTION_PROPS}, "type": "SET_MEAL", "planned_for": "2030-01-01", "recipe_id": "pav"}]}])))
    with keyed(), client_patch:
        res = await interpret(req("fried chicken sometime"))
    assert res.clarification.question == "Which day?" and [o.label for o in res.clarification.options] == ["Friday"]


async def test_conversation_and_open_question_reach_the_model():
    create, client_patch = scripted(turn(content="Happy to help."))
    with keyed(), client_patch:
        res = await interpret(req("friday then", pending={"question": "Which day?", "original": "we want fried chicken"},
                                  recent=[{"role": "member", "text": "we want fried chicken"}, {"role": "assistant", "text": "Which day?"}]))
    sent = create.await_args.kwargs["messages"]
    assert [m["role"] for m in sent] == ["system", "system", "user", "assistant", "user"] and sent[-1]["content"] == "friday then"
    context = json.loads(sent[1]["content"])
    assert context["open_question_you_asked"]["question"] == "Which day?"
    assert context["household_limits_anonymous"] == ["allergy: peanut (cannot eat)"] and "u1" not in sent[1]["content"]
    assert (res.source, res.reply) == ("agent", "Happy to help.")


async def test_model_down_falls_back_to_rules_and_no_key_never_calls_it():
    create, client_patch = scripted(RuntimeError("boom"))
    with keyed(), client_patch:
        res = await interpret(req("lock friday"))
    assert res.source == "rules" and res.actions[0].type == "LOCK_SLOT"
    create, client_patch = scripted(turn(content="unused"))
    with patch.object(agent.settings, "openai_api_key", ""), client_patch:
        res = await interpret(req("Can we do chicken tacos on wednesday?"))
    assert create.await_count == 0 and res.clarification.options[0].actions[0].type == "CREATE_RECIPE"


async def test_reply_is_written_by_the_reply_model_from_real_outcomes():
    create, client_patch = scripted(turn(content="Pav Bhaji is on for Thursday, and you'll need a few more tomatoes."))
    body = ReplyRequest(message="pav bhaji thursday", outcomes=[{"summary": "Pav Bhaji on Thursday", "status": "applied", "note": "Needs more tomato."}],
                        fallback="Done: Pav Bhaji on Thursday.")
    with keyed(), client_patch:
        res = await agent.compose_reply(body)
    assert (res.source, res.reply) == ("llm", "Pav Bhaji is on for Thursday, and you'll need a few more tomatoes.")
    kwargs = create.await_args.kwargs
    assert kwargs["model"] == agent.settings.kitchen_circle_reply_model and kwargs["reasoning_effort"] == "none"
    assert json.loads(kwargs["messages"][-1]["content"])["outcomes"][0]["result"] == "DONE"
    create, client_patch = scripted(RuntimeError("down"), RuntimeError("down"))
    with keyed(), client_patch:
        assert (await agent.compose_reply(body)).reply == "Done: Pav Bhaji on Thursday."


def test_reply_route_mounted_and_falls_back_without_a_key():
    with patch.object(agent.settings, "openai_api_key", ""):
        resp = client.post("/api/kitchen-circle/chat/reply", json={"message": "hi", "outcomes": [{"summary": "x", "status": "applied"}], "fallback": "Done: x."})
    assert resp.status_code == 200 and resp.json() == {"reply": "Done: x.", "source": "fallback"}


async def test_guard_leaves_correct_mappings_alone():
    _, client_patch = scripted(turn(call("plan_meal", date="2026-11-07", recipe_id="rajma", meal_title=None, servings=None)), turn(content="Done."))
    with keyed(), client_patch:
        res = await interpret(req("Actually make it rajmah on saturday instead"))
    assert [(a.type, a.recipe_version_id) for a in res.actions] == [("SET_MEAL", "rajma-v1")]


async def test_obvious_lookups_are_done_in_code_so_one_round_decides():
    create, client_patch = scripted(turn(call("plan_meal", date="2026-11-05", recipe_id="pav", meal_title=None, servings=None)),
                                    turn(content="never reached"))
    with keyed(), client_patch:
        res = await interpret(req("Can we do pav bhaji on thursday?"))
    assert create.await_count == 1  # acted in the first round, and no closing round after accepted actions
    assert [(a.type, a.recipe_version_id) for a in res.actions] == [("SET_MEAL", "pav-v1")]
    lookups = json.loads(create.await_args.kwargs["messages"][1]["content"])["lookups"]
    assert lookups["dish_asked"] == "pav bhaji" and lookups["matches"][0]["same_dish_as_query"] is True
    assert lookups["fit"] == [{"recipe_id": "pav", "date": "2026-11-05", "safe_for_everyone": True, "warnings": [], "day_now": {"state": "planned", "meal": "Egg Curry"}}]
    unsafe = agent.KitchenAgent(req("plan lemon rice for wednesday")).lookups()
    assert unsafe["fit"][0]["safe_for_everyone"] is False


async def test_a_rejected_call_gets_another_round_to_fix_it():
    create, client_patch = scripted(turn(call("plan_meal", date="2030-01-01", recipe_id="pav", meal_title=None, servings=None)),
                                    turn(call("plan_meal", date="2026-11-05", recipe_id="pav", meal_title=None, servings=None)))
    with keyed(), client_patch:
        res = await interpret(req("pav bhaji thursday"))
    assert create.await_count == 2 and res.actions[0].slot_id == "s3"


async def test_a_multi_part_message_gets_one_more_turn_when_only_one_part_was_done():
    create, client_patch = scripted(turn(call("set_servings", date="2026-11-07", servings=6)),
                                    turn(call("set_my_attendance", date="2026-11-06", eating=False)))
    with keyed(), client_patch:
        res = await interpret(req("We'll be 6 on Saturday, and I'm not eating at home on Friday"))
    assert create.await_count == 2 and [a.type for a in res.actions] == ["SET_SERVINGS", "SET_ATTENDANCE"]


async def test_a_reply_that_hides_a_failure_or_a_pending_confirm_is_replaced_by_the_summary():
    failed = ReplyRequest(message="chicken tacos wednesday", fallback="Couldn’t do: Write a recipe for Chicken Tacos (Recipe writing isn’t available right now.).",
                          outcomes=[{"summary": "Write a recipe for Chicken Tacos", "status": "failed", "note": "Recipe writing isn’t available right now."}])
    _, client_patch = scripted(turn(content="Wednesday is set for chicken tacos."))
    with keyed(), client_patch:
        assert (await agent.compose_reply(failed)).source == "fallback"
    _, client_patch = scripted(turn(content="I couldn't write the chicken tacos recipe just now, so Wednesday is unchanged."))
    with keyed(), client_patch:
        assert (await agent.compose_reply(failed)).source == "llm"
    pending = ReplyRequest(message="grocery list", fallback="Needs confirmation: Build a grocery list.",
                           outcomes=[{"summary": "Build a grocery list", "status": "needs_confirmation"}])
    _, client_patch = scripted(turn(content="Your grocery list is ready."))
    with keyed(), client_patch:
        assert (await agent.compose_reply(pending)).source == "fallback"


async def test_waiting_outcomes_name_the_cards_real_button():
    create, client_patch = scripted(turn(content="I've written it; tap Approve & plan to put it on Wednesday."))
    body = ReplyRequest(message="tacos", fallback="x", outcomes=[
        {"summary": "Write a recipe for Chicken Tacos", "status": "applied"},
        {"summary": "Chicken Tacos on Wednesday", "status": "needs_confirmation", "policy": "ai_recipe_review"},
        {"summary": "Build a grocery list", "status": "needs_confirmation", "policy": "order_action"}])
    with keyed(), client_patch:
        await agent.compose_reply(body)
    results = [o["result"] for o in json.loads(create.await_args.kwargs["messages"][-1]["content"])["outcomes"]]
    assert results[0] == "DONE" and "Approve & plan" in results[1] and '"Confirm"' in results[2]


async def test_agent_reports_live_progress_in_plain_words():
    lines: list[str] = []
    _, client_patch = scripted(turn(call("write_recipe", dish="chicken tacos", date="2026-11-04")))
    with keyed(), client_patch:
        await interpret(req("Can we do chicken tacos on wednesday?"), emit=lines.append)
    assert lines[0] == "Reading your message"
    assert "Chicken Tacos isn't in your recipes yet" in lines
    assert lines[-1] == "Chicken Tacos isn't in your recipes — I'll write one"


def test_streamed_interpret_sends_progress_then_the_result():
    _, client_patch = scripted(turn(call("plan_meal", date="2026-11-05", recipe_id="pav", meal_title=None, servings=None)))
    with keyed(), client_patch:
        resp = client.post("/api/kitchen-circle/chat/interpret/stream", json=req("Can we do pav bhaji on thursday?").model_dump())
    rows = [json.loads(line) for line in resp.text.strip().splitlines()]
    progress = [r["progress"] for r in rows if "progress" in r]
    assert "Found Pav Bhaji in your recipes" in progress and "Putting Pav Bhaji on Thursday" in progress
    assert rows[-1]["result"]["actions"][0]["recipe_version_id"] == "pav-v1"
