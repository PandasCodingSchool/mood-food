"""Swiggy menu item → canonical dish, with a persistent, growing cache.

Pipeline per item name:
  1. cache (menu_item_map) — instant, includes cached "no match" verdicts
  2. exact: normalised name equals a dish name or alias
  3. candidates: up to 4 dishes sharing significant words, after protein and
     veg/non-veg guards (a chicken item never maps to a paneer dish)
  4. JEV: one Choice per item over its candidates + "none of these",
     accepted at MAP_THRESHOLD; everything is cached either way.

Without JEV, step 4 is skipped and unresolved items stay unmapped (and are
not cached, so they're retried once JEV is available).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

from typesafe_sdk import Choice

from app.data.dishes import DISHES, DISHES_BY_ID, DishRecord
from app.learning import store

logger = logging.getLogger("food_graph")

MAP_THRESHOLD = 0.8
MAX_CANDIDATES = 4
_NONE = "none_of_these"

_PORTION = re.compile(
    r"\((?:[^)]*)\)|\[(?:[^\]]*)\]|\b(?:serves?\s*\d+|\d+\s*(?:pcs?|pieces?|ml|gm?s?|kg|ltr|l)|half|full|"
    r"regular|small|medium|large|mini|jumbo|combo|meal|single|double|portion|plate|bowl of|special|"
    r"new|best ?seller|chef'?s?|house|signature)\b",
    re.I,
)
_STOP = {"with", "and", "the", "of", "in", "a", "style", "fresh", "hot", "spicy", "classic", "veg", "non"}
# "keema" is minced meat of any kind, so it is not a protein signal.
_PROTEINS = {
    "chicken": "chicken", "murgh": "chicken", "mutton": "mutton", "lamb": "mutton", "goat": "mutton",
    "gosht": "mutton", "fish": "fish", "prawn": "prawn", "prawns": "prawn", "shrimp": "prawn",
    "egg": "egg", "anda": "egg", "paneer": "paneer", "tofu": "tofu",
}
# Menu spellings / names that mean the same thing.
_SYNONYMS = {
    "makhani": "butter", "makhanwala": "butter", "murgh": "chicken", "gosht": "mutton", "kheema": "keema",
    "biriyani": "biryani", "briyani": "biryani", "manchuria": "manchurian", "schezwan": "schezwan",
    "szechuan": "schezwan", "chowmein": "noodles", "chilly": "chilli", "chili": "chilli",
}
# The vehicle/form of a dish: an item and a dish with different forms are different dishes
# (keema pav is not keema paratha; a chicken roll is not chicken curry).
_FORMS = {
    "pav", "paratha", "roll", "wrap", "frankie", "rice", "biryani", "pulao", "noodles", "sandwich", "burger",
    "pizza", "soup", "salad", "dosa", "idli", "momos", "naan", "kulcha", "bhature", "thali", "pasta", "bowl",
    "curry", "tikka", "kebab", "fry", "shake", "lassi", "cake", "pastry", "fries",
}


@dataclass
class Mapping:
    item_name: str
    dish_id: Optional[str]
    confidence: float
    method: str


def normalise(name: str) -> str:
    text = _PORTION.sub(" ", name.lower())
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _words(name: str) -> set[str]:
    return {_SYNONYMS.get(w, w) for w in normalise(name).split() if len(w) > 2 and w not in _STOP}


def _forms(words: set[str]) -> set[str]:
    return words & _FORMS


def _protein(words: set[str]) -> Optional[str]:
    found = {_PROTEINS[w] for w in words if w in _PROTEINS}
    return found.pop() if len(found) == 1 else None


_EXACT: dict[str, str] = {}
for _d in DISHES:
    for _n in (_d.name, *_d.swiggy_aliases):
        _EXACT.setdefault(normalise(_n), _d.id)


def candidates(item_name: str, is_veg: Optional[bool] = None) -> list[DishRecord]:
    words = _words(item_name)
    if not words:
        return []
    item_protein = _protein(words)
    item_forms = _forms(words)
    scored = []
    for d in DISHES:
        if is_veg is True and "non_veg" in d.dietary_tags:
            continue
        if is_veg is False and "non_veg" not in d.dietary_tags:
            continue
        dish_words = _words(d.name) | {w for a in d.swiggy_aliases for w in _words(a)}
        overlap = len(words & dish_words)
        if not overlap:
            continue
        if item_protein and d.protein and d.protein in _PROTEINS.values() and d.protein != item_protein:
            continue
        dish_forms = _forms(_words(d.name))
        if item_forms and dish_forms and not item_forms & dish_forms:
            continue
        scored.append((overlap / max(len(words), 1), d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [d for _, d in scored[:MAX_CANDIDATES]]


def _cached(keys: list[str]) -> dict[str, Mapping]:
    out: dict[str, Mapping] = {}
    for key in set(keys):
        row = store.fetchone("SELECT item_name, dish_id, confidence, method FROM menu_item_map WHERE item_key = ?", (key,))
        if row:
            out[key] = Mapping(row["item_name"], row["dish_id"], float(row["confidence"]), row["method"])
    return out


def remember(item_name: str, dish_id: Optional[str], confidence: float, method: str) -> None:
    key = normalise(item_name)
    if not key:
        return
    store.execute(
        """INSERT INTO menu_item_map (item_key, item_name, dish_id, confidence, method, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT (item_key) DO UPDATE SET
             dish_id = excluded.dish_id, confidence = excluded.confidence,
             method = excluded.method, updated_at = CURRENT_TIMESTAMP""",
        (key, item_name, dish_id, confidence, method),
    )


def lookup(item_name: str) -> Optional[Mapping]:
    return _cached([normalise(item_name)]).get(normalise(item_name))


async def map_items(items: list[tuple[str, Optional[bool]]]) -> dict[str, Mapping]:
    """Map (item_name, is_veg) pairs; returns name -> Mapping (dish_id may be None)."""
    from app.decisions import jev

    out: dict[str, Mapping] = {}
    keys = {name: normalise(name) for name, _ in items}
    cache = _cached([k for k in keys.values() if k])
    pending: list[tuple[str, list[DishRecord]]] = []
    for name, is_veg in items:
        key = keys[name]
        if not key or name in out:
            continue
        if key in cache:
            out[name] = cache[key]
        elif key in _EXACT:
            out[name] = Mapping(name, _EXACT[key], 1.0, "exact")
            remember(name, _EXACT[key], 1.0, "exact")
        else:
            cands = candidates(name, is_veg)
            if not cands:
                out[name] = Mapping(name, None, 0.0, "no_candidates")
            else:
                pending.append((name, cands))

    client = jev.get_client()
    if pending and client is not None:
        state = {
            f"i{i + 1}": {
                "menu_item": name,
                "catalog_dishes": {f"d{j + 1}": c.name for j, c in enumerate(cands)},
            }
            for i, (name, cands) in enumerate(pending)
        }
        questions = {
            f"i{i + 1}": jev.shuffled_choice(
                f"Which of `i{i + 1}.catalog_dishes` is the same dish as `i{i + 1}.menu_item`? "
                "Naming, spelling, portion or regional-style differences are fine. A different main "
                "ingredient or a different dish form (pav vs paratha, roll vs curry, rice vs noodles) "
                "is a different dish. Pick none_of_these if none is the same dish.",
                {**{f"d{j + 1}": c.name for j, c in enumerate(cands)}, _NONE: "A different dish from all of them."},
                seed=name,
            )
            for i, (name, cands) in enumerate(pending)
        }
        decision = await client.decide("food_graph_map", state, questions)
        if decision is not None:
            for i, (name, cands) in enumerate(pending):
                answer = decision.choices.get(f"i{i + 1}")
                if not answer:
                    continue
                choice, probs, _ = answer
                p = probs.get(choice, 0.0)
                if choice != _NONE and p >= MAP_THRESHOLD:
                    dish = cands[int(choice[1:]) - 1]
                    out[name] = Mapping(name, dish.id, p, "jev")
                    remember(name, dish.id, p, "jev")
                elif choice == _NONE and p >= MAP_THRESHOLD:
                    out[name] = Mapping(name, None, p, "jev")
                    remember(name, None, p, "jev")
    for name, _ in pending:
        out.setdefault(name, Mapping(name, None, 0.0, "unresolved"))
    logger.info(
        "food_graph: mapped %d/%d item(s) (%d via JEV)",
        sum(1 for m in out.values() if m.dish_id), len(out), sum(1 for m in out.values() if m.method == "jev"),
    )
    return out


def dish(dish_id: Optional[str]) -> Optional[DishRecord]:
    return DISHES_BY_ID.get(dish_id or "")
