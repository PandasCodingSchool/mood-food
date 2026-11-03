"""Shared-chat interpretation: a member's message → typed, validated planner actions.

Two stages:
  1. A deterministic phrase parser for the common planning requests (days out, meals,
     servings, locks, leftovers, rules, auto-fill, groceries). It is the non-LLM path.
  2. Only when that finds nothing, an LLM structured-output call. Its actions are
     re-validated here: days must be days of this plan, recipes must be from the
     provided list, attendance always targets the sender. Anything else is dropped.

Interpretation only: the API decides what is applied, confirmed, or clarified.
"""

from __future__ import annotations

import json
import logging
import re
from difflib import SequenceMatcher
from datetime import date, timedelta
from typing import Optional

from pydantic import BaseModel, Field

from app.config import settings
from app.lab import trace

from .chat_schemas import (
    ChatDay, Clarification, ClarificationOption, InterpretRequest, InterpretResponse, PlannerAction,
)

logger = logging.getLogger("kitchen_circle.chat")

WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_WEEKDAY_TOKENS = {
    **{name: i for i, name in enumerate(WEEKDAY_NAMES)},
    **{f"{name}s": i for i, name in enumerate(WEEKDAY_NAMES)},
    "mon": 0, "tue": 1, "tues": 1, "wed": 2, "thu": 3, "thur": 3, "thurs": 3, "fri": 4, "sat": 5, "sun": 6,
}
_NUMBER_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "twelve": 12}
_MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
_DIETS = {"vegetarian": "vegetarian", "veg": "vegetarian", "meatless": "vegetarian", "vegan": "vegan", "jain": "jain", "eggetarian": "eggetarian"}

HELP = "I can plan meals, mark days out or leftovers, change servings, lock days, add rules, auto-fill the week, or start a grocery list. Try “Make dal tadka on Friday”."


_FILLER = {"a", "an", "the", "some", "of", "and", "with", "style", "special", "homemade", "home", "made", "fresh", "hot", "nice",
           "it", "that", "this", "instead", "us", "me", "them", "please", "again", "too", "also", "then", "one"}
# Common Hindi/English pairs so "anda curry" still finds Egg Curry.
_SYNONYMS = {"anda": "egg", "eggs": "egg", "murgh": "chicken", "gosht": "mutton", "machli": "fish", "macher": "fish", "aaloo": "aloo", "alu": "aloo"}


def _dish_tokens(text: str) -> list[str]:
    return [_SYNONYMS.get(w, w) for w in re.findall(r"[a-z0-9]+", text.lower()) if w not in _FILLER]


def _close(a: str, b: str) -> bool:
    return a == b or (len(a) >= 4 and len(b) >= 4 and SequenceMatcher(None, a, b).ratio() >= 0.8)


def same_dish(asked: str, title: str) -> bool:
    """True when every word of the dish they asked for is in the recipe title (allowing small spelling slips).

    "rajmah" → Rajma Chawal and "dal tadka" → Dal Tadka match; "chicken tacos" → Chicken 65 and
    "paneer tikka masala" → Paneer Tikka don't: an extra word in the request is a different dish.
    """
    want, have = _dish_tokens(asked), _dish_tokens(title)
    return bool(want) and all(any(_close(w, h) for h in have) for w in want)


def _nice_day(d: str) -> str:
    return date.fromisoformat(d).strftime("%A")


class Interpreter:
    def __init__(self, req: InterpretRequest):
        self.req = req
        self.text = " ".join(req.message.lower().replace("’", "'").split())
        self.words = re.findall(r"[a-z0-9']+", self.text)
        self.today = date.fromisoformat(req.today)

    # ── days ───────────────────────────────────────────────────────────────
    def days(self) -> list[ChatDay]:
        """Plan days the message refers to, in plan order. Empty when none are named."""
        t = self.text
        if re.search(r"\b(all|whole|entire|rest of the|this) week\b|\bevery ?day\b", t):
            upcoming = [d for d in self.req.days if d.planned_for >= self.req.today] or list(self.req.days)
            if not upcoming:
                return []
            # The week of the first upcoming day only (the plan may also hold next week's days).
            first = date.fromisoformat(min(d.planned_for for d in upcoming))
            week_end = (first + timedelta(days=6 - first.weekday())).isoformat()
            return [d for d in upcoming if d.planned_for <= week_end]
        wanted: set[str] = set()
        if re.search(r"\b(today|tonight)\b", t):
            wanted.add(self.today.isoformat())
        if "tomorrow" in t:
            wanted.add((self.today + timedelta(days=1)).isoformat())
        weekdays = {i for w in self.words if (i := _WEEKDAY_TOKENS.get(w)) is not None}
        if "weekend" in t:
            saturday = self._nearest(5)
            if saturday:
                wanted.add(saturday.planned_for)
                wanted.add((date.fromisoformat(saturday.planned_for) + timedelta(days=1)).isoformat())
        # A weekday name means the next one coming up (this week or next), never both.
        for weekday in weekdays:
            day = self._nearest(weekday)
            if day:
                wanted.add(day.planned_for)
        for m in re.finditer(r"\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)?\b", t):
            if m.group(2) or re.search(rf"\b{m.group(1)}(st|nd|rd|th)\b", t):
                wanted |= {d.planned_for for d in self.req.days if int(d.planned_for[8:]) == int(m.group(1))
                           and (not m.group(2) or int(d.planned_for[5:7]) == _MONTHS[m.group(2)])}
        return [d for d in self.req.days if d.planned_for in wanted]

    def _nearest(self, weekday: int) -> Optional[ChatDay]:
        upcoming = [d for d in self.req.days if d.weekday == weekday and d.planned_for >= self.req.today]
        pool = upcoming or [d for d in self.req.days if d.weekday == weekday]
        return min(pool, key=lambda d: d.planned_for) if pool else None

    def similar_recipes(self, dish: str, limit: int = 2):
        wanted = {w for w in re.findall(r"[a-z]+", dish.lower()) if len(w) > 2}
        scored = [(len(wanted & set(re.findall(r"[a-z]+", r.title.lower()))), r) for r in self.req.recipes]
        return [r for score, r in sorted(scored, key=lambda x: (-x[0], x[1].title)) if score > 0][:limit]

    def weekdays_named(self) -> list[int]:
        return sorted({i for w in self.words if (i := _WEEKDAY_TOKENS.get(w)) is not None})

    # ── recipes ────────────────────────────────────────────────────────────
    _DAY_WORDS = "|".join(sorted(_WEEKDAY_TOKENS, key=len, reverse=True)) + "|today|tonight|tomorrow"

    def dish_phrase(self) -> Optional[str]:
        """The dish they asked for in "make/have/do X on <day>", if the message has that shape."""
        m = re.search(r"\b(?:make|cook|have|having|do|try|eat|plan|put|want|get|order)\s+(?:some\s+|a\s+|an\s+|the\s+)?([a-z0-9][a-z0-9' ]{1,60}?)\s+(?:on|for)\s+(?:the\s+)?(?:" + self._DAY_WORDS + r")\b", self.text)
        if not m or re.fullmatch(r"(it|that|this|something|anything|dinner|lunch|food|something \w+|anything \w+)", m.group(1).strip()):
            return None
        return m.group(1).strip()

    def recipe_candidates(self) -> list:
        phrase = self.dish_phrase()
        if phrase:
            found = [r for r in self.req.recipes if same_dish(phrase, r.title)]
            exact = [r for r in found if same_dish(r.title, phrase)]
            return exact or found
        # No "make X on <day>" shape: the whole title has to be in the message (every word, numbers included).
        found = [r for r in self.req.recipes if (t := _dish_tokens(r.title)) and all(w in {_SYNONYMS.get(x, x) for x in self.words} for w in t)]
        return sorted(found, key=lambda r: -len(r.title))[:1]

    def recipe(self):
        found = self.recipe_candidates()
        return found[0] if len(found) == 1 else None

    def number(self) -> Optional[int]:
        m = re.search(r"\b(\d{1,2}|" + "|".join(_NUMBER_WORDS) + r")\s+(servings?|people|persons|portions|of us|guests|plates)\b", self.text) \
            or re.search(r"\bfor\s+(\d{1,2}|" + "|".join(_NUMBER_WORDS) + r")\b(?!\s*(st|nd|rd|th|am|pm))", self.text)
        if not m:
            return None
        raw = m.group(1)
        value = int(raw) if raw.isdigit() else _NUMBER_WORDS[raw]
        return value if 1 <= value <= 30 else None

    # ── helpers ────────────────────────────────────────────────────────────
    def _per_day(self, make, question: str, days: Optional[list[ChatDay]] = None) -> InterpretResponse:
        days = self.days() if days is None else days
        if not days:
            options = [ClarificationOption(label=f"{_nice_day(d.planned_for)} ({d.planned_for[5:]})", actions=[make(d)]) for d in self.req.days]
            return InterpretResponse(clarification=Clarification(question=question, options=options), reply=question, source="rules")
        actions = [make(d) for d in days]
        return InterpretResponse(actions=actions, reply="; ".join(a.summary for a in actions), source="rules")

    def _we(self) -> bool:
        return bool(re.search(r"\b(we|we're|were|us|our)\b", self.text))

    def _everyone(self) -> bool:
        return bool(re.search(r"\b(everyone|everybody|all of us|whole (family|house|household|gang)|nobody|no one)\b", self.text))

    # ── intents ────────────────────────────────────────────────────────────
    def parse(self) -> Optional[InterpretResponse]:
        t = self.text
        if re.search(r"\b(auto ?-?fill|fill (in )?(the )?(rest of )?(the |this )?week|plan (the |this )?(rest of the )?week|suggest (some )?meals)\b", t):
            return InterpretResponse(actions=[PlannerAction(type="REQUEST_AUTOFILL", summary="Suggest meals for the open days")], reply="I'll suggest meals for the open days for you to review.", source="rules")

        if re.search(r"\b(grocery|groceries|shopping list|order (the )?(ingredients|groceries))\b", t):
            days = self.days()
            if len(days) == 1:
                d = days[0]
                return InterpretResponse(actions=[PlannerAction(type="CREATE_GROCERY_SNAPSHOT", scope="day", planned_for=d.planned_for, slot_id=d.slot_id, summary=f"Build a grocery list for {_nice_day(d.planned_for)}")], reply=f"I can build a grocery list for {_nice_day(d.planned_for)}.", source="rules")
            return InterpretResponse(actions=[PlannerAction(type="CREATE_GROCERY_SNAPSHOT", scope="week", summary="Build a grocery list for the rest of the week")], reply="I can build a grocery list for the rest of the week.", source="rules")

        rule = self.rule_intent()
        if rule:
            return rule

        if re.search(r"\bunlock\b", t):
            return self._per_day(lambda d: PlannerAction(type="UNLOCK_SLOT", slot_id=d.slot_id, planned_for=d.planned_for, summary=f"Unlock {_nice_day(d.planned_for)}"), "Which day should I unlock?")
        if re.search(r"\block\b", t):
            return self._per_day(lambda d: PlannerAction(type="LOCK_SLOT", slot_id=d.slot_id, planned_for=d.planned_for, summary=f"Lock {_nice_day(d.planned_for)}"), "Which day should I lock?")

        absent = re.search(r"\b(count me out|skip me|without me|i'?m not (eating|home|around|in)|i won'?t be (home|there|around|eating)|i'?ll be (out|away)|i'?m (out|away|travell?ing))\b", t)
        present = re.search(r"\b(count me in|i'?ll be (home|back|there|eating)|i'?m (eating|home|in) )", t + " ")
        if absent or present:
            status = "absent" if absent else "attending"
            label = "Not eating" if absent else "Eating"
            return self._per_day(lambda d: PlannerAction(type="SET_ATTENDANCE", slot_id=d.slot_id, planned_for=d.planned_for, status=status, summary=f"{label} on {_nice_day(d.planned_for)} (you)"), "Which day?")

        if re.search(r"\b(going out|eating out|dining out|out for (dinner|lunch)|ordering in|order in|takeaway|take-?out)\b", t):
            out = lambda d: PlannerAction(type="SET_DAY_STATUS", slot_id=d.slot_id, planned_for=d.planned_for, state="household_out", summary=f"Everyone eats out on {_nice_day(d.planned_for)}")  # noqa: E731
            if self.req.member_count > 1 and self._we() and not self._everyone():
                days = self.days()
                if days:
                    me = [PlannerAction(type="SET_ATTENDANCE", slot_id=d.slot_id, planned_for=d.planned_for, status="absent", summary=f"Not eating on {_nice_day(d.planned_for)} (you)") for d in days]
                    names = ", ".join(_nice_day(d.planned_for) for d in days)
                    q = f"Is everyone eating out on {names}, or only some of you?"
                    return InterpretResponse(clarification=Clarification(question=q, options=[
                        ClarificationOption(label="Everyone is out", actions=[out(d) for d in days]),
                        ClarificationOption(label="Only me", actions=me),
                    ]), reply=q, source="rules")
            return self._per_day(out, "Which day are you eating out?")

        if re.search(r"\bleft ?overs?\b", t):
            return self._per_day(lambda d: PlannerAction(type="SET_DAY_STATUS", slot_id=d.slot_id, planned_for=d.planned_for, state="leftovers", summary=f"Leftovers on {_nice_day(d.planned_for)}"), "Which day is leftovers?")
        if re.search(r"\b(no[- ]cook(ing)?|not cooking|no cooking)\b", t):
            return self._per_day(lambda d: PlannerAction(type="SET_DAY_STATUS", slot_id=d.slot_id, planned_for=d.planned_for, state="no_cook", summary=f"No cooking on {_nice_day(d.planned_for)}"), "Which day is a no-cook day?")
        if re.search(r"\b(clear|remove|cancel|empty|undo)\b", t) and not self.recipe():
            return self._per_day(lambda d: PlannerAction(type="CLEAR_DAY", slot_id=d.slot_id, planned_for=d.planned_for, summary=f"Clear {_nice_day(d.planned_for)}"), "Which day should I clear?")

        servings = self.number()
        recipe = self.recipe()
        if servings and not recipe and re.search(r"\b(serving|servings|people|portions|guests|cook for|make it|of us)\b", t):
            return self._per_day(lambda d: PlannerAction(type="SET_SERVINGS", slot_id=d.slot_id, planned_for=d.planned_for, servings=servings, summary=f"{servings} servings on {_nice_day(d.planned_for)}"), f"Which day should serve {servings}?")

        if recipe:
            def meal(d: ChatDay) -> PlannerAction:
                replaces = d.meal_title if d.meal_title and d.meal_title.lower() != recipe.title.lower() else None
                return PlannerAction(type="SET_MEAL", slot_id=d.slot_id, planned_for=d.planned_for, recipe_id=recipe.recipe_id, recipe_version_id=recipe.version_id,
                                     meal_title=recipe.title, servings=servings, replaces=replaces,
                                     summary=f"{recipe.title} on {_nice_day(d.planned_for)}" + (f" for {servings}" if servings else "") + (f" (instead of {replaces})" if replaces else ""))
            return self._per_day(meal, f"Which day should {recipe.title} go on?")

        made = re.search(r"\b(?:create|write|generate|add|give me|find|suggest|need|get)\s+(?:me\s+)?(?:a\s+|the\s+)?(?:new\s+)?recipe\s+(?:for|of)\s+(?:some\s+|a\s+|an\s+)?([a-z][a-z' ]{1,60}?)(?:\s+(?:on|for)\s+(?:the\s+)?(?:" + "|".join(sorted(_WEEKDAY_TOKENS, key=len, reverse=True)) + r"|today|tonight|tomorrow))?\s*[.!?]*$", t)
        if made and not re.fullmatch(r"(it|that|this|something|anything|dinner|lunch)", made.group(1).strip()):
            dish = made.group(1).strip().title()
            days = self.days()
            day = days[0] if len(days) == 1 else None
            action = PlannerAction(type="CREATE_RECIPE", dish=dish, slot_id=day.slot_id if day else None, planned_for=day.planned_for if day else None,
                                   summary=f"Write a recipe for {dish}" + (f" for {_nice_day(day.planned_for)}" if day else ""))
            return InterpretResponse(actions=[action], reply=f"I'll write a recipe for {dish} for you to check.", source="rules")

        phrase = self.dish_phrase()
        if phrase:
            several = self.recipe_candidates()
            if len(several) > 1:
                return self.which_recipe(phrase.title(), several)
            # Not one of their recipes: with AI on, let the model resolve it (spelling, language) or write it; otherwise ask.
            self.unknown_title = phrase.title()
            return None if self.req.allow_llm else self.unknown_dish(self.unknown_title)
        return None

    unknown_title: Optional[str] = None

    def which_recipe(self, asked: str, found: list) -> InterpretResponse:
        days = self.days()[:1]
        day = days[0] if days else None
        if not day:
            q = f"Which day should {asked} go on?"
            return InterpretResponse(reply=q, source="rules")
        options = [ClarificationOption(label=r.title, actions=[PlannerAction(
            type="SET_MEAL", slot_id=day.slot_id, planned_for=day.planned_for, recipe_id=r.recipe_id, recipe_version_id=r.version_id,
            meal_title=r.title, summary=f"{r.title} on {_nice_day(day.planned_for)}")]) for r in found[:3]]
        options.append(ClarificationOption(label=f"Write a new {asked} recipe (AI)", actions=[PlannerAction(
            type="CREATE_RECIPE", dish=asked, slot_id=day.slot_id, planned_for=day.planned_for, summary=f"Write a recipe for {asked} for {_nice_day(day.planned_for)}")]))
        q = f"Which {asked.lower()} for {_nice_day(day.planned_for)}?"
        return InterpretResponse(clarification=Clarification(question=q, options=options), reply=q, source="rules")

    def unknown_dish(self, title: str) -> InterpretResponse:
        """A dish that isn't one of the household's recipes: offer an AI recipe, close matches, or a plain note."""
        days = self.days()
        if len(days) > 1:
            days = days[:1]
        day = days[0] if days else None
        when = f" on {_nice_day(day.planned_for)}" if day else ""
        options = [ClarificationOption(label=f"Write a recipe for {title} (AI)", actions=[PlannerAction(
            type="CREATE_RECIPE", dish=title, slot_id=day.slot_id if day else None, planned_for=day.planned_for if day else None,
            summary=f"Write a recipe for {title}" + (f" for {_nice_day(day.planned_for)}" if day else ""))])]
        if day:
            for r in self.similar_recipes(title):
                options.append(ClarificationOption(label=f"Use {r.title}", actions=[PlannerAction(
                    type="SET_MEAL", slot_id=day.slot_id, planned_for=day.planned_for, recipe_id=r.recipe_id, recipe_version_id=r.version_id,
                    meal_title=r.title, summary=f"{r.title} on {_nice_day(day.planned_for)}")]))
            options.append(ClarificationOption(label=f"Just write “{title}”", actions=[PlannerAction(
                type="SET_MEAL", slot_id=day.slot_id, planned_for=day.planned_for, meal_title=title,
                summary=f"{title} on {_nice_day(day.planned_for)} (no recipe, so no grocery list for it)")]))
        q = f"{title} isn't in your recipes yet. Shall I write one{when}?"
        return InterpretResponse(clarification=Clarification(question=q, options=options), reply=q, source="rules")

    def rule_intent(self) -> Optional[InterpretResponse]:
        t = self.text
        if re.search(r"\b(stop|remove|delete|cancel|drop|turn off)\b.*\brules?\b|\bno more\b.*\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b", t):
            weekdays = self.weekdays_named()
            matches = [r for r in self.req.rules if (not weekdays or r.weekday in weekdays)
                       and (not any(d in t for d in _DIETS) or str(r.constraint.get("diet", "")) in {_DIETS[d] for d in _DIETS if d in t})]
            if not matches:
                return InterpretResponse(reply="I couldn't find a matching household rule.", source="rules")
            make = lambda r: PlannerAction(type="UPDATE_RECURRING_RULE", rule_id=r.rule_id, active=False, summary=f"Turn off the {self._rule_label(r)} rule")  # noqa: E731
            if len(matches) == 1:
                return InterpretResponse(actions=[make(matches[0])], reply=make(matches[0]).summary, source="rules")
            q = "Which rule should I turn off?"
            return InterpretResponse(clarification=Clarification(question=q, options=[ClarificationOption(label=self._rule_label(r), actions=[make(r)]) for r in matches]), reply=q, source="rules")

        diet = next((_DIETS[w] for w in self.words if w in _DIETS), None)
        if not diet and re.search(r"\bno (meat|non-?veg|chicken|mutton|fish)\b", t):
            diet = "vegetarian" if re.search(r"\bno (meat|non-?veg)\b", t) else None
        excluded = None
        if not diet:
            em = re.search(r"\bno ([a-z]+(?: (?!(?:on|for|in|at|every|each|this|any)\b)[a-z]+)?)\b", t)
            if em and em.group(1) not in {"cooking", "cook", "one", "more"} and self.weekdays_named():
                excluded = em.group(1)
        weekdays = self.weekdays_named()
        if not weekdays or not (diet or excluded):
            return None
        recurring = re.search(r"\b(every|each|always|weekly|all)\b", t) or any(w.endswith("s") and w[:-1] in WEEKDAY_NAMES for w in self.words)
        constraint = {"diet": diet} if diet else {"exclude_ingredients": [excluded]}
        category = "diet" if diet else "ingredient"
        rules = [PlannerAction(type="CREATE_RECURRING_RULE", weekday=w, strength="hard", category=category, constraint=constraint,
                               summary=f"Every {WEEKDAY_NAMES[w].title()}: {diet or 'no ' + excluded}") for w in weekdays]
        if recurring:
            return InterpretResponse(actions=rules, reply="; ".join(r.summary for r in rules), source="rules")
        names = ", ".join(WEEKDAY_NAMES[w].title() for w in weekdays)
        this_week = [r.model_copy(update={"this_week_only": True, "summary": r.summary.replace("Every ", "This week, ")}) for r in rules]
        q = f"Should {diet or 'no ' + excluded} on {names} be a weekly rule, or just this week?"
        return InterpretResponse(clarification=Clarification(question=q, options=[
            ClarificationOption(label="Every week", actions=rules),
            ClarificationOption(label="Just this week", actions=this_week),
        ]), reply=q, source="rules")

    @staticmethod
    def _rule_label(rule) -> str:
        day = WEEKDAY_NAMES[rule.weekday].title() if rule.weekday is not None else "Every day"
        detail = rule.constraint.get("diet") or ", ".join(rule.constraint.get("exclude_ingredients") or []) or rule.category
        return f"{day} {detail}"


# ── LLM fallback ──────────────────────────────────────────────────────────
class _LlmAction(BaseModel):
    type: str
    planned_for: Optional[str] = None
    recipe_id: Optional[str] = None
    meal_title: Optional[str] = None
    dish: Optional[str] = None
    state: Optional[str] = None
    servings: Optional[int] = None
    status: Optional[str] = None
    rule_id: Optional[str] = None
    weekday: Optional[int] = None
    diet: Optional[str] = None
    exclude_ingredient: Optional[str] = None
    scope: Optional[str] = None
    this_week_only: Optional[bool] = None


def _keep_dish(action: PlannerAction, asked: str) -> PlannerAction:
    """The model picked a recipe that isn't the dish they named → write the dish they asked for instead."""
    if action.type != "SET_MEAL" or not action.recipe_version_id or same_dish(asked, action.meal_title or ""):
        return action
    # Only a true lookalike (shares a word, e.g. chicken tacos → Chicken 65); no overlap means the phrase wasn't the dish.
    want, have = _dish_tokens(asked), _dish_tokens(action.meal_title or "")
    if not want or not any(_close(w, h) for w in want for h in have):
        return action
    when = f" for {_nice_day(action.planned_for)}" if action.planned_for else ""
    trace.emit("kitchen_circle.chat.dish_guard", asked=asked, rejected=action.meal_title)
    return PlannerAction(type="CREATE_RECIPE", dish=asked, slot_id=action.slot_id, planned_for=action.planned_for, summary=f"Write a recipe for {asked}{when}")


_ALLOWED = set(PlannerAction.model_fields["type"].annotation.__args__)  # type: ignore[union-attr]


def _validate(req: InterpretRequest, raw: _LlmAction) -> Optional[PlannerAction]:
    """Re-check every LLM action against the real plan; drop anything that doesn't resolve."""
    if raw.type not in _ALLOWED:
        return None
    day = next((d for d in req.days if d.planned_for == raw.planned_for), None)
    needs_day = raw.type in {"SET_MEAL", "CLEAR_DAY", "SET_DAY_STATUS", "SET_SERVINGS", "SET_ATTENDANCE", "LOCK_SLOT", "UNLOCK_SLOT"}
    if needs_day and not day:
        return None
    base = {"type": raw.type, "slot_id": day.slot_id if day else None, "planned_for": day.planned_for if day else None}
    name = _nice_day(day.planned_for) if day else ""
    try:
        if raw.type == "SET_MEAL":
            recipe = next((r for r in req.recipes if r.recipe_id == raw.recipe_id), None)
            if recipe:
                return PlannerAction(**base, recipe_id=recipe.recipe_id, recipe_version_id=recipe.version_id, meal_title=recipe.title, summary=f"{recipe.title} on {name}")
            if raw.meal_title and raw.meal_title.strip():
                title = raw.meal_title.strip()[:120]
                return PlannerAction(**base, meal_title=title, summary=f"{title} on {name} (no structured recipe)")
            return None
        if raw.type == "SET_DAY_STATUS" and raw.state in {"leftovers", "no_cook", "household_out"}:
            return PlannerAction(**base, state=raw.state, summary=f"{raw.state.replace('_', ' ').title()} on {name}")
        if raw.type == "SET_SERVINGS" and raw.servings and 1 <= raw.servings <= 30:
            return PlannerAction(**base, servings=raw.servings, summary=f"{raw.servings} servings on {name}")
        if raw.type == "SET_ATTENDANCE" and raw.status in {"attending", "absent"}:
            return PlannerAction(**base, status=raw.status, summary=f"{'Eating' if raw.status == 'attending' else 'Not eating'} on {name} (you)")
        if raw.type in {"CLEAR_DAY", "LOCK_SLOT", "UNLOCK_SLOT"}:
            verb = {"CLEAR_DAY": "Clear", "LOCK_SLOT": "Lock", "UNLOCK_SLOT": "Unlock"}[raw.type]
            return PlannerAction(**base, summary=f"{verb} {name}")
        if raw.type == "CREATE_RECURRING_RULE" and raw.weekday is not None and 0 <= raw.weekday <= 6 and (raw.diet in set(_DIETS.values()) or raw.exclude_ingredient):
            constraint = {"diet": raw.diet} if raw.diet in set(_DIETS.values()) else {"exclude_ingredients": [raw.exclude_ingredient.strip().lower()]}
            when = "This week, " + WEEKDAY_NAMES[raw.weekday].title() if raw.this_week_only else "Every " + WEEKDAY_NAMES[raw.weekday].title()
            return PlannerAction(type=raw.type, weekday=raw.weekday, strength="hard", category="diet" if "diet" in constraint else "ingredient", constraint=constraint,
                                 this_week_only=bool(raw.this_week_only) or None, summary=f"{when}: {raw.diet or 'no ' + raw.exclude_ingredient}")
        if raw.type == "UPDATE_RECURRING_RULE" and any(r.rule_id == raw.rule_id for r in req.rules):
            return PlannerAction(type=raw.type, rule_id=raw.rule_id, active=False, summary="Turn off a household rule")
        if raw.type == "CREATE_RECIPE" and (raw.dish or raw.meal_title):
            dish = (raw.dish or raw.meal_title or "").strip()[:80]
            if not dish:
                return None
            return PlannerAction(type=raw.type, dish=dish, slot_id=base["slot_id"], planned_for=base["planned_for"],
                                 summary=f"Write a recipe for {dish}" + (f" for {name}" if day else ""))
        if raw.type == "REQUEST_AUTOFILL":
            return PlannerAction(type=raw.type, summary="Suggest meals for the open days")
        if raw.type == "CREATE_GROCERY_SNAPSHOT":
            return PlannerAction(type=raw.type, scope="day" if day else "week", slot_id=base["slot_id"], planned_for=base["planned_for"],
                                 summary=f"Build a grocery list for {name or 'the rest of the week'}")
    except ValueError:
        return None
    return None


AGENT_NAME = "Haldi"
# "Haldi, make poha Monday" / "hey haldi: …" — the agent's name at the start, not the ingredient ("no haldi on Monday").
_ADDRESSED = re.compile(r"^\s*(?:(?:hey|hi|hello|ok|okay)\s+)?haldi\s*(?:[,:!\-–—]\s*|\s+(?=(?:can|could|please|pls|make|put|add|we|i|let'?s|plan|fill|clear|lock|unlock|what|which|set|show|cook)\b))", re.I)


def strip_address(message: str) -> str:
    """Drop a leading "Haldi," so the name is never read as a dish or ingredient."""
    rest = _ADDRESSED.sub("", message, count=1)
    return rest if rest.strip() else message


async def interpret(req: InterpretRequest, emit=None) -> InterpretResponse:
    """Agent first (the model decides and acts through tools); the rule parser only when the model is unavailable.
    ``emit(text)`` receives live progress lines while the agent works."""
    if (spoken := strip_address(req.message)) != req.message:
        req = req.model_copy(update={"message": spoken})
    result = None
    if req.allow_llm:
        from .agent import run_agent
        result = await run_agent(req, emit)
    if result is None:
        fallback = req.model_copy(update={"allow_llm": False})
        interpreter = Interpreter(fallback)
        result = interpreter.parse()
        if result is None and interpreter.unknown_title:
            result = interpreter.unknown_dish(interpreter.unknown_title)
    if result is None:
        result = InterpretResponse(reply=HELP, source="none")
    trace.emit("kitchen_circle.chat", source=result.source, actions=[a.type for a in result.actions], clarify=bool(result.clarification))
    return result
