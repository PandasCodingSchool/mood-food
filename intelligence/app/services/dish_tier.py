"""Classifies dish/menu-item names into swap-eligible tiers.

Used to keep "cheaper alternative" swaps from surfacing complimentary items
(breads, pickles, accompaniment salads) as a stand-in for a real dish — see
recommender.py's _swap_candidates and swiggy_discovery.py's
_pick_swiggy_alternatives.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config import settings

logger = logging.getLogger("dish_tier")

VALID_TIERS = {"main", "starter", "complimentary"}

# Sides / breads that nobody orders as a standalone meal.
_SIDE_WORDS = {
    "roti", "roti's", "naan", "chapati", "chapathi", "phulka", "kulcha",
    "paratha", "parantha", "pav", "puri", "poori", "bun", "buns", "papad",
    "pappad", "laccha", "rumali", "roomali", "khamiri", "kulchas", "naans",
}
# Table accompaniments. "salad" is included but only flags side salads
# (Green/Veg/Mixed Salad); named salads keep an anchor token (Greek, Caesar,
# Chicken) and stay "main".
_ACCOMPANIMENT_WORDS = {
    "pickle", "achaar", "achar", "raita", "kachumber", "salad",
}
# Condiments / dips / add-on flavourings.
_CONDIMENT_WORDS = {
    "sauce", "sauces", "dip", "dips", "dressing", "mayo", "mayonnaise",
    "chutney", "ketchup", "gravy", "toum", "syrup", "spread", "aioli",
    "salsa", "seasoning",
}
# Flavour / prep / quantity words that never form a dish on their own. An item
# is only flagged non-standalone when EVERY meaningful token is a side,
# accompaniment, condiment, or one of these modifiers — i.e. it has no real
# dish/protein "anchor". This keeps real dishes (Pav Bhaji, White Sauce Pasta,
# Greek Salad, Masala Pav) classified as mains.
_MODIFIER_WORDS = {
    "extra", "plain", "add", "addon", "add-on", "on", "of", "side", "sides",
    "with", "and", "the", "a", "an", "butter", "cheese", "cheesy", "garlic",
    "vegan", "veg", "non", "spicy", "hot", "sweet", "red", "white", "green",
    "schezwan", "peri", "tandoori", "small", "regular", "medium", "large",
    "portion", "piece", "pieces", "pcs", "pc", "set", "plate", "half", "full",
    "mini", "combo", "assorted", "mixed", "roasted", "fresh", "onion",
}

_NON_STANDALONE = _SIDE_WORDS | _ACCOMPANIMENT_WORDS | _CONDIMENT_WORDS

# Backwards-compatible export: substring keywords that always imply complimentary.
_COMPLIMENTARY_KEYWORDS = _SIDE_WORDS | _ACCOMPANIMENT_WORDS

_SYSTEM_PROMPT = """\
You classify restaurant menu items into one of three tiers:
- "main": a full dish someone would order and eat as their meal (curries, biryani, \
pasta, burgers, standalone salads like Greek Salad, noodles, etc.)
- "starter": a smaller dish/appetizer that can also work as a lighter standalone \
order (tikka, spring rolls, soup, fries, etc.)
- "complimentary": something nobody orders by itself — plain breads (naan, roti, \
chapati, paratha, kulcha, phulka, pav, puri), table accompaniments (papad, \
pickle/achaar, raita, kachumber), condiments/dips/sauces served on the side, and \
"extra"/add-on items (extra puri, extra cheese, garlic sauce, dip).

Return ONLY a JSON object mapping each given id to its tier string, e.g.:
{"id1": "main", "id2": "complimentary"}
No markdown, no extra text."""


@dataclass
class TierClassifyInput:
    id: str
    name: str
    description: str | None = None


def _tokens(name: str) -> list[str]:
    return [t for t in re.findall(r"[a-z]+", name.lower()) if len(t) > 1]


def _is_non_standalone(name: str) -> bool:
    """True when the item is a side/condiment/add-on with no real dish anchor.

    An item is non-standalone only when it contains at least one side/condiment/
    accompaniment word AND every meaningful token is such a word or a bare
    modifier (extra, plain, butter, garlic, ...). This flags "Butter Pav",
    "Extra Puri" and "Vegan Garlic Sauce" while leaving "Pav Bhaji",
    "White Sauce Pasta" and "Greek Salad" as mains.
    """
    tokens = _tokens(name)
    if not tokens:
        return False
    if not any(t in _NON_STANDALONE for t in tokens):
        return False
    return all(t in _NON_STANDALONE or t in _MODIFIER_WORDS for t in tokens)


def _keyword_fallback(items: list[TierClassifyInput]) -> dict[str, str]:
    out: dict[str, str] = {}
    for item in items:
        out[item.id] = "complimentary" if _is_non_standalone(item.name) else "main"
    return out


async def classify_tiers(items: list[TierClassifyInput]) -> dict[str, str]:
    """Batch-classify items into main/starter/complimentary via a cheap LLM call.

    Falls back to a keyword heuristic if the LLM call fails or returns
    malformed/incomplete output for any item.
    """
    if not items:
        return {}

    lines = [
        f"{item.id}: {item.name}" + (f" — {item.description}" if item.description else "")
        for item in items
    ]
    llm = ChatOpenAI(
        model=settings.openai_mini_model,
        temperature=0,
        model_kwargs={"response_format": {"type": "json_object"}},
    )
    try:
        result = await llm.ainvoke([
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content="\n".join(lines)),
        ])
        parsed = json.loads(result.content)
    except Exception as exc:
        logger.warning("classify_tiers: LLM call failed (%s), using keyword fallback", exc)
        return _keyword_fallback(items)

    fallback = _keyword_fallback(items)
    out: dict[str, str] = {}
    for item in items:
        tier = parsed.get(item.id)
        out[item.id] = tier if tier in VALID_TIERS else fallback[item.id]
    return out
