"""KitchenCircle kitchen agent: the shared chat is a tool-calling agent, not a parser.

The model reads the week, the household's limits and its recipe book, looks things up with read tools
(`find_recipes`, `check_dish`) and acts through action tools (plan a meal, write a recipe, change servings, …).
Every action tool call is re-validated against the real plan before it is accepted — a bad id or date goes back
to the model as a tool error so it can correct itself. Nothing is written here: the API applies its own
permission/confirmation policy to the accepted actions. Hard constraints stay in code (`check_dish` uses the
auto-fill rules; a plan_meal that names a different dish than the member asked for is turned into "write it").

The rule parser in `chat.py` is only the fallback for when the model is unavailable.
"""

from __future__ import annotations

import json
import logging
import re
from difflib import SequenceMatcher
from typing import Any, Callable, Optional

from app.config import settings
from app.lab import trace
from app.llm import LLMUnavailable, _create, async_openai, sampling_kwargs
from app.observability import timed_call

from .chat_schemas import (
    ChatRecipe, Clarification, ClarificationOption, InterpretRequest, InterpretResponse, PlannerAction, ReplyRequest, ReplyResponse,
)
from .recipe_ai import fit_warnings
from .schemas import PlannerRecipe, PlannerRule, PlannerSlot

logger = logging.getLogger("kitchen_circle.agent")

MAX_ROUNDS = 5

_SYSTEM = """You are Haldi, KitchenCircle's kitchen agent for one Indian household. You run their week of home meals in a shared
chat: what's cooked each day, who's eating, servings, household food rules, recipes, and the grocery list. Members may
call you by name ("Haldi, …"); your name is never a dish. "haldi" elsewhere in a message is turmeric, the ingredient.

How you work:
- Act ONLY on the member's latest message. Earlier turns are context (what "it", "that day" or "yes" refer to) and
  were already handled — never repeat their actions.
- Read the latest message with the conversation so far. `days` is this week and next (a weekday name means the
  next upcoming one; "this week" means the first week). `today` is in the household's timezone.
- `lookups` already holds the recipe search for the dish they named and the safety check for the day(s) they named —
  use it and act in your FIRST turn. Call find_recipes / check_dish only for something `lookups` doesn't cover
  (another dish, another day, or a vague request).
- Make every tool call you need in the same turn (they run together); don't spread them over turns.
- A recipe matches only if it is the SAME dish ("rajmah" = Rajma Chawal, "anda curry" = Egg Curry). Sharing an
  ingredient is not a match: "chicken tacos" is not Chicken 65. If their dish isn't in the book, call write_recipe with
  the dish and the day — you can write any recipe; the household reviews it before it's planned.
- If check_dish says a dish isn't safe for everyone, don't plan it silently: tell them in your reply (never say whose
  allergy or diet it is) and offer a safe alternative or ask with ask_member.
- Several things in one message → several tool calls. Only ask (ask_member, with 2–4 concrete answers) when you
  genuinely can't tell what they want; otherwise act.
- set_my_attendance is only ever about the person writing. Never invent days, recipes, people or rules.
- If they just chat or ask a question, answer without tools.
Finish with one or two short, warm sentences saying what you did or found (no exclamation marks, no lists)."""


def _fn(name: str, description: str, properties: dict[str, Any], required: Optional[list[str]] = None) -> dict:
    return {"type": "function", "function": {"name": name, "description": description, "parameters": {
        "type": "object", "properties": properties, "required": required if required is not None else list(properties), "additionalProperties": False}}}


_DATE = {"type": "string", "description": "YYYY-MM-DD, one of `days`"}
_ACTION_PROPS = {
    "type": {"type": "string", "enum": ["SET_MEAL", "CREATE_RECIPE", "CLEAR_DAY", "SET_DAY_STATUS", "SET_SERVINGS", "SET_ATTENDANCE",
                                        "LOCK_SLOT", "UNLOCK_SLOT", "CREATE_RECURRING_RULE", "UPDATE_RECURRING_RULE", "REQUEST_AUTOFILL",
                                        "CREATE_GROCERY_SNAPSHOT"]},
    "planned_for": {"type": ["string", "null"]}, "recipe_id": {"type": ["string", "null"]}, "meal_title": {"type": ["string", "null"]},
    "dish": {"type": ["string", "null"]}, "state": {"type": ["string", "null"]}, "servings": {"type": ["integer", "null"]},
    "status": {"type": ["string", "null"]}, "rule_id": {"type": ["string", "null"]}, "weekday": {"type": ["integer", "null"]},
    "diet": {"type": ["string", "null"]}, "exclude_ingredient": {"type": ["string", "null"]}, "scope": {"type": ["string", "null"]},
}

TOOLS = [
    # read tools
    _fn("find_recipes", "Search the household's recipe book (catalog + their own) by dish name, ingredient, cuisine or diet. "
        "Results say whether each is the same dish as the query.", {
            "query": {"type": "string"}, "diet": {"type": ["string", "null"], "enum": ["vegetarian", "vegan", "eggetarian", "non_vegetarian", "jain", None]}}),
    _fn("check_dish", "Check a recipe against everyone's allergies/diets and the household rules for a day, and see what that day has now.",
        {"recipe_id": {"type": "string"}, "date": _DATE}),
    # action tools
    _fn("plan_meal", "Put a recipe from the book on a day (replaces what's there). Use meal_title only for a no-recipe meal they asked for.",
        {"date": _DATE, "recipe_id": {"type": ["string", "null"]}, "meal_title": {"type": ["string", "null"]}, "servings": {"type": ["integer", "null"]}}),
    _fn("write_recipe", "Write a new recipe with measured ingredients for a dish that isn't in the book; with a date it is planned there "
        "once a member approves it.", {"dish": {"type": "string"}, "date": {"type": ["string", "null"]}}),
    _fn("clear_day", "Remove the meal from a day.", {"date": _DATE}),
    _fn("set_day_status", "Mark a day as leftovers, a no-cook day, or the whole household eating out.",
        {"date": _DATE, "state": {"type": "string", "enum": ["leftovers", "no_cook", "household_out"]}}),
    _fn("set_servings", "Change how many servings to cook on a day.", {"date": _DATE, "servings": {"type": "integer", "minimum": 1, "maximum": 30}}),
    _fn("set_my_attendance", "Whether the person writing is eating at home that day (never anyone else).",
        {"date": _DATE, "eating": {"type": "boolean"}}),
    _fn("lock_day", "Lock a day so auto-fill and quick edits leave it alone.", {"date": _DATE}),
    _fn("unlock_day", "Unlock a locked day.", {"date": _DATE}),
    _fn("add_rule", "Add a household food rule for a weekday (0=Monday … 6=Sunday): a diet or an ingredient to avoid.",
        {"weekday": {"type": "integer", "minimum": 0, "maximum": 6}, "diet": {"type": ["string", "null"], "enum": ["vegetarian", "vegan", "eggetarian", "jain", None]},
         "exclude_ingredient": {"type": ["string", "null"]}, "this_week_only": {"type": "boolean"}}),
    _fn("turn_off_rule", "Turn off one of the household's rules.", {"rule_id": {"type": "string"}}),
    _fn("suggest_meals", "Ask the planner to suggest meals for the open days (a proposal the household reviews).", {}),
    _fn("make_grocery_list", "Build a grocery list for the rest of the week, or for one day.",
        {"scope": {"type": "string", "enum": ["week", "day"]}, "date": {"type": ["string", "null"]}}),
    _fn("ask_member", "Ask one short question when you truly can't tell what they want; each answer carries the exact actions it takes.",
        {"question": {"type": "string"}, "options": {"type": "array", "minItems": 2, "maxItems": 4, "items": {
            "type": "object", "additionalProperties": False, "required": ["label", "actions"],
            "properties": {"label": {"type": "string"}, "actions": {"type": "array", "items": {
                "type": "object", "additionalProperties": False, "required": list(_ACTION_PROPS), "properties": _ACTION_PROPS}}}}}}),
]
READ_TOOLS = {"find_recipes", "check_dish"}
_MULTI_PART = re.compile(r",|;|\b(and|also|plus|then|aur)\b", re.I)


def _tokens(text: str) -> list[str]:
    from .chat import _dish_tokens
    return _dish_tokens(text)


def _score(query: str, r: ChatRecipe) -> float:
    q = _tokens(query)
    if not q:
        return 0.0
    title, extra = _tokens(r.title), [*_tokens(" ".join(r.ingredients)), *_tokens(r.cuisine or "")]
    hit = lambda w, pool: max((SequenceMatcher(None, w, t).ratio() for t in pool), default=0.0)  # noqa: E731
    return sum(max(hit(w, title), 0.6 * hit(w, extra)) for w in q) / len(q)


class KitchenAgent:
    def __init__(self, req: InterpretRequest, emit: Optional[Callable[[str], None]] = None):
        self.req = req
        self._emit = emit
        self.by_id = {r.recipe_id: r for r in req.recipes}
        self.days = {d.planned_for: d for d in req.days}
        self.actions: list[PlannerAction] = []
        self.clarification: Optional[Clarification] = None
        self.steps: list[dict[str, Any]] = []
        self.asked: list[str] = []  # dish names the member used in find_recipes/write_recipe queries

    @staticmethod
    def dish_name(text: str) -> str:
        """'bbq chicken' → 'BBQ Chicken': title case, but vowel-less short words (BBQ, BLT) stay capitals."""
        return " ".join(w.upper() if len(w) <= 4 and not re.search(r"[aeiou]", w, re.I) else (w if w[:1].isupper() else w.capitalize()) for w in text.split())

    def say(self, text: str) -> None:
        """A live progress line for the member ("Looking up pav bhaji…"); never blocks or fails the agent."""
        if self._emit and text:
            try:
                self._emit(text)
            except Exception:  # noqa: BLE001
                pass

    def _day(self, date: Optional[str]) -> str:
        from .chat import _nice_day
        return _nice_day(date) if date and date in self.days else "that day"

    def describe(self, name: str, a: dict) -> str:
        """What a tool call is doing, in the member's words."""
        title = lambda rid: self.by_id[rid].title if rid in self.by_id else "that recipe"  # noqa: E731
        return {
            "find_recipes": lambda: f"Looking up “{a.get('query', '')}” in your recipes",
            "check_dish": lambda: f"Checking {title(a.get('recipe_id'))} is safe for everyone on {self._day(a.get('date'))}",
            "plan_meal": lambda: f"Putting {title(a.get('recipe_id')) if a.get('recipe_id') else a.get('meal_title') or 'the meal'} on {self._day(a.get('date'))}",
            "write_recipe": lambda: f"{self.dish_name(str(a.get('dish', 'That dish')).strip())} isn't in your recipes — I'll write one",
            "clear_day": lambda: f"Clearing {self._day(a.get('date'))}",
            "set_day_status": lambda: f"Updating {self._day(a.get('date'))}",
            "set_servings": lambda: f"Setting {a.get('servings')} servings for {self._day(a.get('date'))}",
            "set_my_attendance": lambda: f"Marking you as {'eating' if a.get('eating') else 'not eating'} at home on {self._day(a.get('date'))}",
            "lock_day": lambda: f"Locking {self._day(a.get('date'))}",
            "unlock_day": lambda: f"Unlocking {self._day(a.get('date'))}",
            "add_rule": lambda: "Adding a household food rule",
            "turn_off_rule": lambda: "Turning off a household rule",
            "suggest_meals": lambda: "Asking the planner for meal ideas",
            "make_grocery_list": lambda: "Preparing the grocery list",
            "ask_member": lambda: "Checking something with you",
        }.get(name, lambda: "Working on it")()

    # ── context ───────────────────────────────────────────────────────────
    def context(self) -> dict:
        from .chat import WEEKDAY_NAMES
        limits = sorted({f"{p.category}: {p.value} ({p.strength.replace('_', ' ')})" for m in self.req.members for p in m.preferences
                         if p.strength in {"cannot_eat", "never_plan", "prefer_less"}})
        return {
            "today": self.req.today, "members_in_household": self.req.member_count,
            "household_limits_anonymous": limits,
            "days": [{"date": d.planned_for, "weekday": WEEKDAY_NAMES[d.weekday], "state": d.state, "meal": d.meal_title} for d in self.req.days],
            "rules": [{"id": r.rule_id, "weekday": r.weekday, "strength": r.strength, "category": r.category, "constraint": r.constraint} for r in self.req.rules],
            # Ids and titles only — details come from find_recipes, which keeps every round's prompt small.
            "recipe_book": [{"id": r.recipe_id, "title": r.title} for r in self.req.recipes[:250]],
            "open_question_you_asked": self.req.pending.model_dump() if self.req.pending else None,
            "lookups": self.lookups(),
        }

    def lookups(self) -> dict:
        """Do the obvious look-ups in code before the first model call, so a clear request is decided in one round."""
        from .chat import Interpreter, _dish_tokens
        interp = Interpreter(self.req.model_copy(update={"allow_llm": False}))
        asked = interp.dish_phrase()
        words = set(_dish_tokens(self.req.message))
        named = [r for r in self.req.recipes if (t := _dish_tokens(r.title)) and set(t) <= words]  # whole title in the message
        matches = self.find_recipes(asked)["results"][:5] if asked else []
        self.asked = self.asked[:-1] if asked else self.asked  # not the member's own query
        candidates = [m["recipe_id"] for m in matches if m["same_dish_as_query"]][:2] + [r.recipe_id for r in named][:2]
        days = [d.planned_for for d in interp.days()][:2]
        fit = [{"recipe_id": rid, "date": d, **self.check_dish(rid, d)} for rid in dict.fromkeys(candidates) for d in days]
        return {"dish_asked": asked, "matches": matches, "recipes_named_in_message": [{"recipe_id": r.recipe_id, "title": r.title} for r in named[:3]],
                "days_named": days, "fit": fit}

    # ── read tools ─────────────────────────────────────────────────────────
    def find_recipes(self, query: str, diet: Optional[str] = None) -> dict:
        from .chat import same_dish
        self.asked.append(query)
        pool = [r for r in self.req.recipes if not diet or diet in r.dietary_tags]
        ranked = sorted(pool, key=lambda r: -_score(query, r))[:8]
        return {"results": [{
            "recipe_id": r.recipe_id, "title": r.title, "same_dish_as_query": same_dish(query, r.title),
            "source": r.source, "tags": r.dietary_tags, "allergens": r.allergens, "cuisine": r.cuisine,
            "minutes": (r.prep_minutes or 0) + (r.cook_minutes or 0) or None,
        } for r in ranked if _score(query, r) >= 0.45]}

    def check_dish(self, recipe_id: str, date: str) -> dict:
        recipe, day = self.by_id.get(recipe_id), self.days.get(date)
        if not recipe or not day:
            return {"error": "Unknown recipe_id or date — use ids from find_recipes and dates from `days`."}
        planner_recipe = PlannerRecipe(recipe_id=recipe.recipe_id, version_id=recipe.version_id, title=recipe.title,
                                       source=recipe.source if recipe.source in {"catalog", "household", "ai_draft"} else "catalog",
                                       default_servings=recipe.default_servings or 4, dietary_tags=recipe.dietary_tags,
                                       allergens=recipe.allergens, ingredients=recipe.ingredients, cuisine=recipe.cuisine)
        rules = [PlannerRule(weekday=r.weekday, strength=r.strength, category=r.category, constraint=r.constraint)
                 for r in self.req.rules if r.weekday is None or r.weekday == day.weekday]
        slot = PlannerSlot(slot_id=day.slot_id, planned_for=day.planned_for, weekday=day.weekday, state="blank", servings=recipe.default_servings or 4)
        warnings = fit_warnings(planner_recipe, self.req.members, rules, slot) if self.req.members else []
        return {"safe_for_everyone": not warnings, "warnings": warnings, "day_now": {"state": day.state, "meal": day.meal_title}}

    # ── action tools → typed planner actions ──────────────────────────────
    def _raw(self, name: str, a: dict) -> Optional[dict]:
        date = a.get("date")
        return {
            "plan_meal": lambda: {"type": "SET_MEAL", "planned_for": date, "recipe_id": a.get("recipe_id"), "meal_title": a.get("meal_title"), "servings": a.get("servings")},
            "write_recipe": lambda: {"type": "CREATE_RECIPE", "dish": a.get("dish"), "planned_for": date},
            "clear_day": lambda: {"type": "CLEAR_DAY", "planned_for": date},
            "set_day_status": lambda: {"type": "SET_DAY_STATUS", "planned_for": date, "state": a.get("state")},
            "set_servings": lambda: {"type": "SET_SERVINGS", "planned_for": date, "servings": a.get("servings")},
            "set_my_attendance": lambda: {"type": "SET_ATTENDANCE", "planned_for": date, "status": "attending" if a.get("eating") else "absent"},
            "lock_day": lambda: {"type": "LOCK_SLOT", "planned_for": date},
            "unlock_day": lambda: {"type": "UNLOCK_SLOT", "planned_for": date},
            "add_rule": lambda: {"type": "CREATE_RECURRING_RULE", "weekday": a.get("weekday"), "diet": a.get("diet"),
                                 "exclude_ingredient": a.get("exclude_ingredient"), "this_week_only": a.get("this_week_only")},
            "turn_off_rule": lambda: {"type": "UPDATE_RECURRING_RULE", "rule_id": a.get("rule_id")},
            "suggest_meals": lambda: {"type": "REQUEST_AUTOFILL"},
            "make_grocery_list": lambda: {"type": "CREATE_GROCERY_SNAPSHOT", "scope": a.get("scope"), "planned_for": date if a.get("scope") == "day" else None},
        }.get(name, lambda: None)()

    def _accept(self, raw: dict) -> Optional[PlannerAction]:
        from .chat import _LlmAction, _validate
        action = _validate(self.req, _LlmAction(**raw))
        if action and action.type == "SET_MEAL" and action.recipe_version_id:
            day = self.days.get(action.planned_for or "")
            replaces = day.meal_title if day and day.meal_title and day.meal_title.lower() != (action.meal_title or "").lower() else None
            if replaces:
                action = action.model_copy(update={"replaces": replaces, "summary": f"{action.summary} (instead of {replaces})"})
            if raw.get("servings"):
                action = action.model_copy(update={"servings": raw["servings"]})
        return action

    def run_tool(self, name: str, args: dict) -> dict:
        if name == "find_recipes":
            return self.find_recipes(args.get("query", ""), args.get("diet"))
        if name == "check_dish":
            return self.check_dish(args.get("recipe_id", ""), args.get("date", ""))
        if name == "ask_member":
            options = []
            for o in args.get("options", [])[:4]:
                acts = [a for a in (self._accept(raw) for raw in o.get("actions", [])) if a]
                if acts and str(o.get("label", "")).strip():
                    options.append(ClarificationOption(label=str(o["label"]).strip()[:60], actions=acts))
            if len(options) < 1 or not str(args.get("question", "")).strip():
                return {"ok": False, "error": "Each answer needs a label and at least one valid action (real dates and recipe ids)."}
            self.clarification = Clarification(question=str(args["question"]).strip()[:300], options=options)
            return {"ok": True, "note": "Question shown with tappable answers. Stop here."}
        raw = self._raw(name, args)
        if raw is None:
            return {"ok": False, "error": f"Unknown tool {name}."}
        if name == "write_recipe" and args.get("dish"):
            self.asked.append(str(args["dish"]))
        action = self._accept(raw)
        if not action:
            return {"ok": False, "error": "Not valid against the plan — check the date is in `days`, the recipe_id came from find_recipes, and values are allowed."}
        self.actions.append(action)
        return {"ok": True, "queued": action.summary, "note": "The app applies it now or asks the household to confirm."}

    def guard(self) -> None:
        """Hard check in code: a recipe planned for a dish they named must be that dish, otherwise write the dish they asked for."""
        from .chat import Interpreter, _keep_dish
        asked = Interpreter(self.req).dish_phrase()
        if asked:
            self.actions = [_keep_dish(a, asked.title()) for a in self.actions]
        seen: set[str] = set()
        unique = []
        for a in self.actions:  # write_recipe + its own plan_meal fallback, or the guard, can duplicate
            key = json.dumps(a.model_dump(exclude={"summary"}), sort_keys=True, default=str)
            if key not in seen:
                seen.add(key)
                unique.append(a)
        self.actions = unique

    # ── loop ───────────────────────────────────────────────────────────────
    async def run(self) -> Optional[InterpretResponse]:
        if not settings.openai_api_key:
            raise LLMUnavailable("OPENAI_API_KEY is not set")
        self.say("Reading your message")
        context = self.context()
        lk = context["lookups"]
        if lk["dish_asked"]:
            same = [m for m in lk["matches"] if m["same_dish_as_query"]]
            self.say(f"Found {same[0]['title']} in your recipes" if same else f"{self.dish_name(lk['dish_asked'])} isn't in your recipes yet")
        if any(not f.get("safe_for_everyone", True) for f in lk["fit"]):
            self.say("That dish isn't safe for everyone at the table")
        self.say("Deciding what to do")
        messages: list[dict[str, Any]] = [{"role": "system", "content": _SYSTEM},
                                          {"role": "system", "content": json.dumps(context, ensure_ascii=False)}]
        for turn in self.req.recent[-8:]:
            role, text = ("member", turn) if isinstance(turn, str) else (turn.role, turn.text)
            messages.append({"role": "user" if role == "member" else "assistant", "content": text})
        messages.append({"role": "user", "content": self.req.message})
        final = ""
        for _ in range(MAX_ROUNDS):
            kwargs = {"model": settings.kitchen_circle_agent_model, "messages": messages, "tools": TOOLS, "tool_choice": "auto", **sampling_kwargs(0)}
            # Chat Completions only allows function tools on these models with reasoning off (the API says so in its 400).
            if settings.kitchen_circle_agent_reasoning:
                kwargs["reasoning_effort"] = settings.kitchen_circle_agent_reasoning
            with timed_call("kitchen_circle_agent", "openai", kwargs["model"]) as fields:
                resp = await _create(async_openai().chat.completions.create, kwargs)
                fields["tokens"] = getattr(resp.usage, "total_tokens", None)
            msg = resp.choices[0].message
            calls = msg.tool_calls or []
            if not calls:
                final = (msg.content or "").strip()
                break
            messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
                {"id": c.id, "type": "function", "function": {"name": c.function.name, "arguments": c.function.arguments}} for c in calls]})
            for call in calls:
                try:
                    args = json.loads(call.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                self.say(self.describe(call.function.name, args))
                result = self.run_tool(call.function.name, args)
                self.steps.append({"tool": call.function.name, "args": args, "result": result})
                trace.emit("kitchen_circle.agent.tool", tool=call.function.name, args=args, ok=result.get("ok", "error" not in result))
                messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result, ensure_ascii=False)})
            if self.clarification:
                break
            # Only actions, all accepted: done — the reply is written separately from the real outcomes, so no closing round.
            # Unless a multi-part message ("…, and …") got a single action: give the model one more turn for the rest.
            actions_only = all(c.function.name not in READ_TOOLS for c in calls) and all(s.get("result", {}).get("ok") for s in self.steps[-len(calls):])
            if actions_only and not (len(self.actions) == 1 and _MULTI_PART.search(self.req.message)):
                break
        self.guard()
        if self.clarification and not self.actions:
            return InterpretResponse(clarification=self.clarification, reply=self.clarification.question, source="agent", steps=self.steps)
        if self.actions:
            return InterpretResponse(actions=self.actions, reply=final or "; ".join(a.summary for a in self.actions), source="agent", steps=self.steps)
        if final:
            return InterpretResponse(reply=final, source="agent", steps=self.steps)
        return None


async def run_agent(req: InterpretRequest, emit: Optional[Callable[[str], None]] = None) -> Optional[InterpretResponse]:
    try:
        return await KitchenAgent(req, emit).run()
    except LLMUnavailable:
        return None
    except Exception as exc:  # noqa: BLE001 — the chat must still answer (rule fallback)
        logger.warning("kitchen agent failed: %s", exc)
        return None


# ── replies ────────────────────────────────────────────────────────────────
_REPLY_SYSTEM = """You are Haldi, KitchenCircle's warm, capable kitchen agent in a household's shared chat. Write the reply to the
member's latest message in one or two short, natural sentences, as yourself ("I've put…"). Never sign or announce your name.
Facts: use ONLY what is in `outcomes` (and `your_draft`, if given). Do not add tips, ingredients, quantities, servings,
dates, advice or anything else that isn't written there. Each outcome's `result`: DONE = already done, say it in the past tense ("Pav Bhaji is on Thursday"), never "queued" or
"pending"; WAITING = say exactly what it tells you to tap; DID NOT HAPPEN = say plainly
it didn't happen and why, in a few words — never present it as done. If a note says it isn't safe for everyone, say so plainly. Notes are for you: never quote them or
say "the note"; you may name up to three ingredients from them, without quantities. Never use the words applied,
needs_confirmation, noted or status. Never name whose allergy or diet anything is. No exclamation marks, lists or emoji.

Style templates (fill <…> ONLY from the outcomes; never reuse a template's wording for a different fact):
- <Dish> is on for <day> — you'll need <ingredient>, <ingredient> and <ingredient> for it.
- <Day> is locked. Tap Confirm below and I'll build the grocery list.
- I've written a recipe for <recipe title>. Have a look, then tap Approve & plan to put it on <day>.
- <Day> is set for <n>, and you're marked as eating out on <day>."""


_PLAIN = {"applied": "DONE", "confirmed": "DONE", "needs_confirmation": "WAITING — someone taps Confirm on the card",
          "needs_clarification": "ASKED A QUESTION", "failed": "DID NOT HAPPEN", "rejected": "DID NOT HAPPEN", "expired": "DID NOT HAPPEN"}
_NEGATIVE = re.compile(r"\b(couldn'?t|could not|can'?t|cannot|didn'?t|did not|wasn'?t|isn'?t|not|unable|failed|no longer)\b|n['’]t\b", re.I)
_WAITING = re.compile(r"\b(confirm|approve|tap|check|review|once someone|waiting)\b", re.I)


def _result(o) -> str:
    if o.status == "needs_confirmation":
        return 'WAITING — tell them to tap "Approve & plan" on the card' if o.policy == "ai_recipe_review" else 'WAITING — tell them to tap "Confirm" on the card'
    return _PLAIN.get(o.status, o.status)


def _faithful(text: str, req: ReplyRequest) -> bool:
    """A small model must not turn a failure into success or skip a pending confirmation; otherwise use the API summary."""
    statuses = {o.status for o in req.outcomes}
    if statuses & {"failed", "rejected", "expired"} and not _NEGATIVE.search(text):
        return False
    if "needs_confirmation" in statuses and not _WAITING.search(text):
        return False
    return True


async def compose_reply(req: ReplyRequest) -> ReplyResponse:
    """The assistant's message, written by the cheapest model from what actually happened; falls back to the API's summary."""
    if not settings.openai_api_key or not req.outcomes and not req.draft:
        return ReplyResponse(reply=req.fallback, source="fallback")
    payload = {"member_said": req.message, "your_draft": req.draft,
               "outcomes": [{"what": o.summary, "result": _result(o), "note": o.note} for o in req.outcomes]}
    # Outcomes only — earlier turns made the small model blend old facts into this reply.
    messages = [{"role": "system", "content": _REPLY_SYSTEM}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False)}]
    model = settings.kitchen_circle_reply_model
    kwargs: dict[str, Any] = {"model": model, "messages": messages, "max_completion_tokens": 400}
    if settings.kitchen_circle_reply_reasoning:
        kwargs["reasoning_effort"] = settings.kitchen_circle_reply_reasoning
    try:
        with timed_call("kitchen_circle_reply", "openai", model) as fields:
            try:
                resp = await _create(async_openai().chat.completions.create, kwargs)
            except Exception:  # noqa: BLE001 — retry once without the reasoning hint some models reject
                if "reasoning_effort" not in kwargs:
                    raise
                kwargs.pop("reasoning_effort")
                resp = await _create(async_openai().chat.completions.create, kwargs)
            fields["tokens"] = getattr(resp.usage, "total_tokens", None)
        text = " ".join((resp.choices[0].message.content or "").split())
    except Exception as exc:  # noqa: BLE001
        logger.warning("reply composer failed: %s", exc)
        return ReplyResponse(reply=req.fallback, source="fallback")
    if not text or len(text) > 600 or any(w in text.lower() for w in ("needs_confirmation", "needs_clarification", "applied:", "status")) \
            or not _faithful(text, req):
        return ReplyResponse(reply=req.fallback, source="fallback")
    trace.emit("kitchen_circle.reply", model=model, outcomes=len(req.outcomes))
    return ReplyResponse(reply=text, source="llm")
