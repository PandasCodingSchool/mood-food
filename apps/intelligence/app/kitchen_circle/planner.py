"""KitchenCircle week auto-fill: deterministic, explainable, constraint-first.

Pipeline (per open day, in date order):
  household context → hard constraints (attending members' diets/allergies/cannot-eat,
  household never-plan, hard rules) → candidate recipes → household-fit score with named
  parts (favourites, dislikes, soft rules, effort, repeats, cuisine/protein diversity,
  light ingredient overlap, fairness) → greedy pick + ranked alternatives → reasons.

Proposals are suggestions only; the API stores them for review and never applies them
on its own. No LLM/JEV call happens here, so the result is reproducible for a given seed.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Iterable, Optional

from app.lab import trace
from app.services.diet import make_rules

from .schemas import (
    AutofillRequest, AutofillResponse, FitBreakdown, PlannerMember, PlannerRecipe, PlannerRule, PlannerSlot,
    ProposedRecipe, SlotProposal, UnfilledSlot,
)

PLANNER_VERSION = "kc-autofill-1"
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

MEAT = {"chicken", "mutton", "lamb", "goat", "pork", "beef", "fish", "prawn", "shrimp", "crab", "keema"}
JAIN_EXCLUDED = {"onion", "garlic", "potato", "carrot", "ginger", "beetroot", "radish", "spring onion"}
# Seasonings and staples are not "shared groceries" worth optimising for.
STAPLES = {"salt", "sugar", "water", "oil", "ghee", "butter", "turmeric powder", "red chilli powder", "coriander powder",
           "garam masala", "cumin seeds", "cumin seed", "mustard seeds", "mustard seed", "asafoetida", "curry leaves"}
PROTEINS = [
    ("chicken", {"chicken"}), ("mutton", {"mutton", "lamb", "goat", "keema"}), ("seafood", {"fish", "prawn", "shrimp", "crab"}),
    ("egg", {"egg", "eggs"}), ("paneer", {"paneer"}), ("tofu", {"tofu"}),
    ("legume", {"dal", "lentil", "lentils", "chana", "rajma", "chickpea", "chickpeas", "moong", "masoor", "toor", "urad"}),
]

W_FAVOURITE = 0.30
W_DISLIKE = 0.30
W_RULE = {"preference": 0.15, "contextual": 0.08}
W_REPEAT_RECENT = 0.25  # cooked in the previous 14 days
W_REPEAT_MONTH = 0.10   # cooked 15–28 days ago
W_SAME_WEEK = 0.40      # only when nothing else fits
W_SAME_CUISINE = 0.08
W_SAME_PROTEIN = 0.10
W_OVERLAP_EACH, W_OVERLAP_CAP = 0.02, 0.08
W_FAIRNESS = 0.10
W_LOVED, W_SKIPPED, W_CHANGE = 0.12, 0.10, 0.05
W_SLOW_WEEKNIGHT = 0.10  # learned: the household skips slow recipes on weeknights
JITTER = 0.03


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower()))


def _mentions(ingredients: Iterable[str], needle: str) -> bool:
    """Word-level match, so an "onion" rule also covers "spring onion" (safety first for hard rules)."""
    target = _words(needle)
    return bool(target) and any(target <= _words(item) for item in ingredients)


@dataclass
class Candidate:
    recipe: PlannerRecipe
    ingredients: list[str]
    allergens: frozenset[str]
    non_veg: bool
    has_egg: bool
    vegan: bool
    protein: str
    total_minutes: Optional[int]

    @property
    def cuisine(self) -> str:
        return (self.recipe.cuisine or "").strip().lower()


def _candidate(recipe: PlannerRecipe) -> Candidate:
    tags = {t.lower().replace("-", "_") for t in recipe.dietary_tags}
    ingredients = [i.lower() for i in recipe.ingredients]
    allergens = make_rules(allergies=recipe.allergens).excluded_allergens
    # Infer from ingredients too: a household recipe may be missing tags, and hard rules must not rely on them.
    non_veg = bool(tags & {"non_veg", "non_vegetarian", "nonveg"}) or any(_mentions(ingredients, m) for m in MEAT)
    has_egg = "eggetarian" in tags or "eggs" in allergens or _mentions(ingredients, "egg")
    protein = next((name for name, words in PROTEINS if any(_words(i) & words for i in ingredients)), "vegetable")
    minutes = None if recipe.prep_minutes is None and recipe.cook_minutes is None else (recipe.prep_minutes or 0) + (recipe.cook_minutes or 0)
    return Candidate(recipe, ingredients, allergens, non_veg, has_egg, "vegan" in tags and not non_veg and not has_egg, protein, minutes)


def _diet_allows(candidate: Candidate, diet: str) -> bool:
    diet = diet.strip().lower().replace("-", "_").replace(" ", "_")
    if diet in {"vegan", "plant_based"}:
        return candidate.vegan and not (candidate.allergens & {"dairy", "eggs", "shellfish"})
    if diet in {"vegetarian", "veg", "veggie"}:
        return not candidate.non_veg and not candidate.has_egg
    if diet in {"eggetarian", "ovo_vegetarian"}:
        return not candidate.non_veg
    if diet == "jain":
        return not candidate.non_veg and not candidate.has_egg and not any(_mentions(candidate.ingredients, x) for x in JAIN_EXCLUDED)
    if diet in {"non_veg", "non_vegetarian"}:
        return True
    return True


def _pref_matches(candidate: Candidate, category: str, value: str) -> bool:
    category, value = category.strip().lower(), value.strip().lower()
    if category == "ingredient":
        return _mentions(candidate.ingredients, value)
    if category == "cuisine":
        return candidate.cuisine == value
    if category == "dish":
        return value == candidate.recipe.title.lower() or value == candidate.recipe.recipe_id
    if category == "protein":
        return candidate.protein == value or _mentions(candidate.ingredients, value)
    if category in {"allergen", "allergy"}:
        return bool(make_rules(allergies=[value]).excluded_allergens & candidate.allergens)
    if category == "diet":
        return not _diet_allows(candidate, value)  # "cannot eat" a diet means the dish violates it
    return False


@dataclass
class DayContext:
    slot: PlannerSlot
    eaters: list[PlannerMember]
    absent: int
    rules: list[PlannerRule]


@dataclass
class WeekState:
    used_recipe_ids: set[str] = field(default_factory=set)
    by_date: dict[str, Candidate] = field(default_factory=dict)
    satisfied: dict[str, int] = field(default_factory=dict)


class Planner:
    def __init__(self, request: AutofillRequest):
        self.req = request
        self.candidates = [_candidate(r) for r in request.recipes if r.source != "ai_draft"]
        self.by_id = {c.recipe.recipe_id: c for c in self.candidates}
        self.ignored_rules: list[str] = []
        self._check_rules()
        self.history = [(h.recipe_id, date.fromisoformat(h.planned_for)) for h in request.history]
        self.feedback: dict[str, dict[str, int]] = {}
        slow_skips = 0
        for f in request.feedback:
            counts = self.feedback.setdefault(f.recipe_id, {})
            counts[f.outcome] = counts.get(f.outcome, 0) + 1
            recipe = self.by_id.get(f.recipe_id)
            if f.outcome == "skipped" and f.weekday < 5 and recipe and ((recipe.recipe.effort or "") == "involved" or (recipe.total_minutes or 0) > 45):
                slow_skips += 1
        self.slow_weeknights_skipped = slow_skips >= 2
        self.reactions: dict[str, dict[str, str]] = {}
        for r in request.reactions:
            self.reactions.setdefault(r.user_id, {})[r.recipe_id] = r.reaction

    _RULE_KEYS = {"diet", "exclude_ingredients", "exclude_cuisines", "cuisine", "effort", "max_total_minutes", "cook_unavailable"}
    # Stored and shown to the household, but not scorable until recipes carry prices (Instamart, Phase 7).
    _NOT_YET_SCORED = {"budget_per_serving_rupees": "budget is saved; recipes don't have prices yet"}

    def _check_rules(self) -> None:
        for rule in self.req.rules:
            for key in rule.constraint:
                if key in self._NOT_YET_SCORED:
                    self.ignored_rules.append(f"{rule.category}: {self._NOT_YET_SCORED[key]}")
                elif key not in self._RULE_KEYS:
                    self.ignored_rules.append(f"{rule.category}: '{key}' is not understood by the planner yet")

    # ── context ────────────────────────────────────────────────────────────
    def day_context(self, slot: PlannerSlot) -> DayContext:
        status = {a.user_id: a.status for a in slot.attendance}
        eaters, absent = [], 0
        for member in self.req.members:
            mark = status.get(member.user_id)
            # Cooks prepare the meal; they count as eaters only when they say they are eating.
            eating = mark == "attending" if member.role == "cook" else mark != "absent"
            if eating:
                eaters.append(member)
            elif member.role != "cook":
                absent += 1
        rules = [r for r in self.req.rules if r.weekday is None or r.weekday == slot.weekday]
        return DayContext(slot, eaters, absent, rules)

    # ── hard constraints ───────────────────────────────────────────────────
    def hard_block(self, c: Candidate, day: DayContext) -> Optional[str]:
        for member in self.req.members:  # household-wide: never plan this
            for p in member.preferences:
                if p.strength == "never_plan" and _pref_matches(c, p.category, p.value):
                    return "never_plan"
        for member in day.eaters:  # only people at the table that day
            for p in member.preferences:
                if p.strength == "cannot_eat" and _pref_matches(c, p.category, p.value):
                    return "cannot_eat"
        for rule in day.rules:
            if rule.strength == "hard" and not self._rule_ok(c, rule):
                return "hard_rule"
        return None

    def _rule_ok(self, c: Candidate, rule: PlannerRule) -> bool:
        k = rule.constraint
        if isinstance(k.get("diet"), str) and not _diet_allows(c, k["diet"]):
            return False
        if any(_mentions(c.ingredients, str(x)) for x in k.get("exclude_ingredients") or []):
            return False
        if c.cuisine and c.cuisine in {str(x).lower() for x in k.get("exclude_cuisines") or []}:
            return False
        if isinstance(k.get("cuisine"), str) and c.cuisine != k["cuisine"].lower():
            return False
        if k.get("effort") and (c.recipe.effort or "").lower() not in {str(x).lower() for x in k["effort"]}:
            return False
        limit = k.get("max_total_minutes")
        if isinstance(limit, (int, float)) and c.total_minutes is not None and c.total_minutes > limit:
            return False
        # The usual cook is away: whoever cooks wants something simple.
        if k.get("cook_unavailable") and not ((c.recipe.effort or "").lower() == "easy" and (c.total_minutes or 0) <= 35):
            return False
        return True

    # ── scoring ────────────────────────────────────────────────────────────
    def score(self, c: Candidate, day: DayContext, week: WeekState) -> tuple[float, FitBreakdown, list[tuple[float, str]]]:
        slot = day.slot
        n = max(len(day.eaters), 1)
        reasons: list[tuple[float, str]] = []

        fav_members = [m for m in day.eaters if self._favours(m, c)]
        favourites = W_FAVOURITE * len(fav_members) / n
        if fav_members:
            reasons.append((favourites, "A household favourite" if len(day.eaters) <= 1 else f"A favourite for {len(fav_members)} of {len(day.eaters)} eating"))

        dislikers = [m for m in day.eaters if self._dislikes(m, c)]
        dislikes = -W_DISLIKE * len(dislikers) / n

        rules = 0.0
        for rule in day.rules:
            if rule.strength == "hard":
                if rule.weekday is not None:
                    reasons.append((0.05, f"Follows the {WEEKDAYS[rule.weekday]} {rule.category} rule"))
                continue
            delta = W_RULE[rule.strength] * (1 if self._rule_ok(c, rule) else -1)
            rules += delta
            if delta > 0:
                reasons.append((delta, f"Matches your {rule.category} preference"))

        effort = 0.0
        weeknight = slot.weekday < 5
        level = (c.recipe.effort or "").lower()
        if weeknight and level == "involved":
            effort -= 0.10
        if weeknight and c.total_minutes and c.total_minutes > 50:
            effort -= 0.05
        if not weeknight and level == "involved":
            effort += 0.03
        if weeknight and c.total_minutes and c.total_minutes <= 35:
            reasons.append((0.04, f"Quick weeknight cook ({c.total_minutes} min)"))

        repeat = 0.0
        when = date.fromisoformat(slot.planned_for)
        gaps = [(when - d).days for rid, d in self.history if rid == c.recipe.recipe_id and d < when]
        if gaps and min(gaps) <= 14:
            repeat -= W_REPEAT_RECENT
        elif gaps and min(gaps) <= 28:
            repeat -= W_REPEAT_MONTH
        elif self.history:
            reasons.append((0.02, "Not cooked in the last two weeks"))
        if c.recipe.recipe_id in week.used_recipe_ids:
            repeat -= W_SAME_WEEK

        diversity = 0.0
        for neighbour in self._neighbours(slot.planned_for, week):
            if c.cuisine and neighbour.cuisine == c.cuisine:
                diversity -= W_SAME_CUISINE
            if neighbour.protein == c.protein:
                diversity -= W_SAME_PROTEIN
        if diversity == 0 and week.by_date:
            reasons.append((0.03, f"Adds variety ({c.protein}{', ' + c.recipe.cuisine if c.recipe.cuisine else ''})"))

        shared = sorted({i for i in c.ingredients if i not in STAPLES}
                        & {i for other in week.by_date.values() if other.recipe.recipe_id != c.recipe.recipe_id for i in other.ingredients})
        overlap = min(W_OVERLAP_EACH * len(shared), W_OVERLAP_CAP)
        if shared:
            reasons.append((overlap, f"Reuses {', '.join(shared[:2])} from other days, so less waste"))

        # Fairness: favourites of members whose tastes the week has served least count extra.
        fairness = 0.0
        if fav_members and len(day.eaters) > 1:
            top = max(week.satisfied.get(m.user_id, 0) for m in day.eaters)
            deficit = sum(top - week.satisfied.get(m.user_id, 0) for m in fav_members)
            fairness = W_FAIRNESS * min(deficit, 2) / 2
            if fairness > 0:
                reasons.append((fairness, "Balances whose favourites get cooked this week"))

        feedback = 0.0
        counts = self.feedback.get(c.recipe.recipe_id, {})
        if counts:
            feedback += min(W_LOVED * counts.get("loved", 0), 2 * W_LOVED)
            feedback -= min(W_SKIPPED * counts.get("skipped", 0), 2 * W_SKIPPED)
            feedback -= min(W_CHANGE * counts.get("change", 0), 2 * W_CHANGE)
            if counts.get("loved"):
                reasons.append((feedback, "Your household loved it last time"))
        if weeknight and self.slow_weeknights_skipped and (level == "involved" or (c.total_minutes or 0) > 45):
            feedback -= W_SLOW_WEEKNIGHT

        variety = self._jitter(slot.slot_id, c.recipe.recipe_id)
        parts = FitBreakdown(base=0.5, favourites=favourites, dislikes=dislikes, rules=rules, effort=effort, repeat=repeat,
                             diversity=diversity, overlap=overlap, fairness=fairness, feedback=feedback, variety=variety)
        total = sum(parts.model_dump().values())
        return total, FitBreakdown(**{k: trace.r(v) for k, v in parts.model_dump().items()}), reasons

    def _favours(self, member: PlannerMember, c: Candidate) -> bool:
        if self.reactions.get(member.user_id, {}).get(c.recipe.recipe_id) == "looks_good":
            return True
        return any(p.strength == "favourite" and _pref_matches(c, p.category, p.value) for p in member.preferences)

    def _dislikes(self, member: PlannerMember, c: Candidate) -> bool:
        if self.reactions.get(member.user_id, {}).get(c.recipe.recipe_id) == "not_for_me":
            return True
        return any(p.strength == "prefer_less" and _pref_matches(c, p.category, p.value) for p in member.preferences)

    def _neighbours(self, planned_for: str, week: WeekState) -> list[Candidate]:
        day = date.fromisoformat(planned_for)
        return [c for d, c in week.by_date.items() if abs((date.fromisoformat(d) - day).days) == 1]

    def _jitter(self, slot_id: str, recipe_id: str) -> float:
        if not self.req.seed:
            return 0.0
        digest = hashlib.sha256(f"{self.req.seed}:{slot_id}:{recipe_id}".encode()).digest()
        return (digest[0] / 255 * 2 - 1) * JITTER

    # ── plan ───────────────────────────────────────────────────────────────
    def run(self) -> AutofillResponse:
        week = WeekState()
        for slot in self.req.slots:  # existing meals shape variety and repeat handling
            if slot.recipe_id and slot.recipe_id in self.by_id:
                week.used_recipe_ids.add(slot.recipe_id)
                week.by_date[slot.planned_for] = self.by_id[slot.recipe_id]

        targets = set(self.req.target_slot_ids or [s.slot_id for s in self.req.slots if s.state == "blank"])
        proposals: list[SlotProposal] = []
        unfilled: list[UnfilledSlot] = []
        for slot in sorted(self.req.slots, key=lambda s: s.planned_for):
            if slot.slot_id not in targets:
                continue
            if slot.state != "blank":
                unfilled.append(UnfilledSlot(slot_id=slot.slot_id, planned_for=slot.planned_for, reason="This day already has a meal, is locked, or is not a cooking day."))
                continue
            day = self.day_context(slot)
            excluded = set(self.req.exclude.get(slot.slot_id, []))
            allowed, blocked = [], {}
            for c in self.candidates:
                why = "excluded" if c.recipe.recipe_id in excluded else self.hard_block(c, day)
                if why:
                    blocked[why] = blocked.get(why, 0) + 1
                else:
                    allowed.append(c)
            fresh = [c for c in allowed if c.recipe.recipe_id not in week.used_recipe_ids]
            pool = fresh or allowed
            if not pool:
                unfilled.append(UnfilledSlot(slot_id=slot.slot_id, planned_for=slot.planned_for, reason="No recipe fits everyone eating and the household rules. Add a recipe or relax a rule."))
                trace.emit("kitchen_circle.autofill.unfilled", slot=slot.planned_for, blocked=blocked)
                continue
            ranked = sorted(((self.score(c, day, week), c) for c in pool), key=lambda item: (-item[0][0], item[1].recipe.title))
            picked = [self._proposed(c, total, parts, reasons, day) for (total, parts, reasons), c in ranked[: 1 + self.req.alternatives]]
            best = ranked[0][1]
            week.used_recipe_ids.add(best.recipe.recipe_id)
            week.by_date[slot.planned_for] = best
            for member in day.eaters:
                if self._favours(member, best):
                    week.satisfied[member.user_id] = week.satisfied.get(member.user_id, 0) + 1
            servings = max(1, slot.servings - day.absent) if day.absent and len(self.req.members) > 1 else slot.servings
            proposals.append(SlotProposal(slot_id=slot.slot_id, planned_for=slot.planned_for, servings=servings, pick=picked[0], alternatives=picked[1:]))
            trace.emit("kitchen_circle.autofill.pick", slot=slot.planned_for, pick=best.recipe.title, score=picked[0].score,
                       breakdown=picked[0].breakdown.model_dump(), blocked=blocked, pool=len(pool))

        open_days = len([s for s in self.req.slots if s.slot_id in targets])
        summary = f"Proposed {len(proposals)} of {open_days} open {'day' if open_days == 1 else 'days'}."
        if unfilled:
            summary += f" {len(unfilled)} couldn't be filled."
        return AutofillResponse(proposals=proposals, unfilled=unfilled, ignored_rules=self.ignored_rules, summary=summary, planner_version=PLANNER_VERSION)

    def _proposed(self, c: Candidate, total: float, parts: FitBreakdown, reasons: list[tuple[float, str]], day: DayContext) -> ProposedRecipe:
        ordered = [text for _, text in sorted(reasons, key=lambda r: -r[0])]
        if day.eaters and any(p.strength == "cannot_eat" for m in day.eaters for p in m.preferences):
            ordered.insert(0, "Safe for every diet and allergy at the table")
        if day.absent and len(self.req.members) > 1:
            ordered.append(f"{day.absent} away that day, so fewer servings")
        if len(ordered) < 2:  # every pick explains itself, even with no tastes or history yet
            timed = any(" min" in text for text in ordered)
            facts = [x for x in ((c.recipe.effort or "").capitalize(), c.recipe.cuisine, f"{c.total_minutes} min" if c.total_minutes and not timed else "") if x]
            ordered.append(f"{' · '.join(facts) or 'Grocery-ready recipe'} — fits everyone eating")
        return ProposedRecipe(recipe_id=c.recipe.recipe_id, version_id=c.recipe.version_id, title=c.recipe.title, source=c.recipe.source,
                              score=trace.r(total, 3), reasons=list(dict.fromkeys(ordered))[:4], breakdown=parts)


def autofill(request: AutofillRequest) -> AutofillResponse:
    return Planner(request).run()
