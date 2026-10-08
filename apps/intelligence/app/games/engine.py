"""Adaptive games as active learning over tonight's decision.

A session holds a posterior over ~24 shortlisted dishes (softmax of logits
seeded by the deterministic score). Each possible question has, per answer,
an effect on every candidate's logit. The engine asks the question with the
lowest *expected* posterior entropy (max information gain) and stops as soon
as one dish clearly leads — or JEV's commit check is confident — so games
are only as long as they need to be.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Optional

from app.data.dishes import DISHES_BY_ID, DishRecord
from app.decisions.engine import dish_similarity
from app.services import sensory

# Tuned with simulated players (Oct 2026): consistent players finish in 3-5 answers,
# mixed ones play close to max_steps; one strong answer can't end a game on its own
# (see also GAMES[*]["min_steps"] in sessions).
BETA = 2.0             # how far one answer moves a candidate's logit
STOP_PROB = 0.70       # posterior mass on the leader that ends a game
JEV_CHECK_FROM = 0.50  # leader mass at which a JEV commit check is worth a call
JEV_STOP_CONF = 0.85   # JEV confidence that ends a game (its pick must be in the top 2)
SWIPE_SPILLOVER = 0.5  # share of a swipe's effect that reaches similar dishes


@dataclass
class Question:
    key: str
    kind: str                                   # swipe | duel | yes_no | choice
    payload: dict[str, Any]
    effects: dict[str, dict[str, float]] = field(default_factory=dict)  # answer -> dish_id -> effect


def softmax(logits: dict[str, float]) -> dict[str, float]:
    m = max(logits.values())
    exp = {k: math.exp(v - m) for k, v in logits.items()}
    z = sum(exp.values())
    return {k: v / z for k, v in exp.items()}


def entropy(p: dict[str, float]) -> float:
    return -sum(v * math.log(v) for v in p.values() if v > 0)


def apply(logits: dict[str, float], effect: dict[str, float], beta: Optional[float] = None) -> dict[str, float]:
    b = BETA if beta is None else beta
    return {k: v + b * effect.get(k, 0.0) for k, v in logits.items()}


def answer_probs(post: dict[str, float], q: Question) -> dict[str, float]:
    """P(answer) under the current posterior: candidates favouring an answer vote for it."""
    raw = {
        a: sum(post[i] * (1 / (1 + math.exp(-4 * eff.get(i, 0.0)))) for i in post)
        for a, eff in q.effects.items()
    }
    z = sum(raw.values()) or 1.0
    return {a: v / z for a, v in raw.items()}


def expected_entropy(logits: dict[str, float], q: Question) -> float:
    post = softmax(logits)
    return sum(p_a * entropy(softmax(apply(logits, q.effects[a]))) for a, p_a in answer_probs(post, q).items())


def score_questions(logits: dict[str, float], questions: list[Question]) -> list[dict[str, Any]]:
    """Every candidate question with its expected entropy, information gain and
    answer probabilities, best first (ties by key) — what `best_question` picks from."""
    post = softmax(logits)
    h = entropy(post)
    rows = []
    for q in questions:
        p_a = answer_probs(post, q)
        exp_h = sum(p * entropy(softmax(apply(logits, q.effects[a]))) for a, p in p_a.items())
        rows.append({"question": q, "key": q.key, "expected_entropy": exp_h, "info_gain": h - exp_h, "answer_probs": p_a})
    rows.sort(key=lambda r: (r["expected_entropy"], r["key"]))
    return rows


def best_question(logits: dict[str, float], questions: list[Question]) -> Optional[Question]:
    if not questions:
        return None
    return score_questions(logits, questions)[0]["question"]


def initial_logits(totals: dict[str, float]) -> dict[str, float]:
    """z-scored deterministic totals: an informed but open prior."""
    vals = list(totals.values())
    mean = sum(vals) / len(vals)
    sd = math.sqrt(sum((v - mean) ** 2 for v in vals) / len(vals)) or 1.0
    return {k: (v - mean) / sd for k, v in totals.items()}


def leader(logits: dict[str, float]) -> tuple[str, float]:
    post = softmax(logits)
    top = max(post, key=post.get)
    return top, post[top]


def ranked(logits: dict[str, float]) -> list[str]:
    post = softmax(logits)
    return sorted(post, key=post.get, reverse=True)


# --- question builders ---------------------------------------------------------

def _card(d: DishRecord) -> dict[str, Any]:
    return {
        "id": d.id,
        "name": d.name,
        "cuisine": d.cuisine,
        "image_url": d.image_url or None,
        "tags": [w for w in (sensory.describe(k, True) for k, v in sorted(d.sensory.items(), key=lambda kv: -kv[1])[:3] if v >= 0.6)],
        "veg": "non_veg" not in d.dietary_tags,
    }


def swipe_questions(ids: list[str], asked: set[str]) -> list[Question]:
    out = []
    dishes = [DISHES_BY_ID[i] for i in ids]
    for j in dishes:
        key = f"swipe:{j.id}"
        if key in asked:
            continue
        sims = {d.id: dish_similarity(d, j) for d in dishes}
        mean = sum(sims.values()) / len(sims)
        # The swiped dish takes the full effect; similar dishes only half, so a few passes on
        # neighbours can't outvote a direct like (or rescue a direct pass).
        liked = {i: 1.0 if i == j.id else SWIPE_SPILLOVER * (s - mean) for i, s in sims.items()}
        out.append(Question(key, "swipe", {"dish": _card(j)}, {"like": liked, "pass": {i: -v for i, v in liked.items()}}))
    return out


def duel_questions(logits: dict[str, float], asked: set[str], top_n: int = 8) -> list[Question]:
    top = [DISHES_BY_ID[i] for i in ranked(logits)[:top_n]]
    everyone = [DISHES_BY_ID[i] for i in logits]
    out = []
    for x in range(len(top)):
        for y in range(x + 1, len(top)):
            a, b = top[x], top[y]
            key = f"duel:{min(a.id, b.id)}|{max(a.id, b.id)}"
            if key in asked:
                continue
            eff = {d.id: dish_similarity(d, a) - dish_similarity(d, b) for d in everyone}
            out.append(Question(key, "duel", {"options": [_card(a), _card(b)]},
                                {a.id: eff, b.id: {i: -v for i, v in eff.items()}}))
    return out


CRAVING_TAGS = ("crunchy", "creamy", "spicy", "brothy", "fresh", "cheesy", "sweet", "tangy", "smoky", "melty")


def craving_questions(ids: list[str], asked: set[str]) -> list[Question]:
    out = []
    for tag in CRAVING_TAGS:
        key = f"tag:{tag}"
        if key in asked:
            continue
        pulls = sensory.CRAVING_PULLS[tag]
        aff = {i: 2 * ((sensory.fit(DISHES_BY_ID[i], pulls) or 0.5) - 0.5) for i in ids}
        out.append(Question(key, "yes_no", {"tag": tag, "prompt": f"Craving something {tag}?"},
                            {"yes": aff, "no": {i: -v for i, v in aff.items()}}))
    return out


# Story scenes: each option implies sensory pulls (dimension, target, weight).
STORY_SCENES: list[dict[str, Any]] = [
    {"id": "evening", "prompt": "It's 9pm. Where are you?", "options": [
        {"id": "couch", "label": "Couch, blanket, a show", "pulls": [("warm", 0.8, 1), ("creamy", 0.6, 0.6), ("heavy", 0.6, 0.6)]},
        {"id": "friends", "label": "Out with friends", "pulls": [("rich", 0.7, 0.8), ("spicy", 0.5, 0.5), ("crunchy", 0.6, 0.5)]},
        {"id": "desk", "label": "Still at my desk", "pulls": [("heavy", 0.3, 0.8), ("warm", 0.6, 0.4)]},
    ]},
    {"id": "sound", "prompt": "Pick tonight's soundtrack", "options": [
        {"id": "retro", "label": "Old Bollywood classics", "pulls": [("warm", 0.7, 0.6), ("rich", 0.6, 0.5), ("creamy", 0.6, 0.4)]},
        {"id": "loud", "label": "Loud and fast", "pulls": [("spicy", 0.8, 1), ("crunchy", 0.6, 0.6)]},
        {"id": "rain", "label": "Rain on the window", "pulls": [("warm", 1.0, 1), ("crunchy", 0.6, 0.4), ("spicy", 0.5, 0.3)]},
    ]},
    {"id": "hunger", "prompt": "How hungry, honestly?", "options": [
        {"id": "peckish", "label": "Just peckish", "pulls": [("heavy", 0.2, 1)]},
        {"id": "proper", "label": "Proper meal hungry", "pulls": [("heavy", 0.6, 1)]},
        {"id": "starving", "label": "Could eat the menu", "pulls": [("heavy", 0.9, 1), ("rich", 0.7, 0.5)]},
    ]},
    {"id": "vibe", "prompt": "Tonight's vibe?", "options": [
        {"id": "treat", "label": "Treat myself", "pulls": [("rich", 0.9, 1), ("sweet", 0.5, 0.3)]},
        {"id": "clean", "label": "Keep it clean", "pulls": [("heavy", 0.1, 1), ("rich", 0.2, 0.8)]},
        {"id": "surprise", "label": "Surprise me", "pulls": [("spicy", 0.6, 0.5), ("sour", 0.5, 0.5), ("umami", 0.7, 0.5)]},
    ]},
    {"id": "temperature", "prompt": "Steaming hot or cool?", "options": [
        {"id": "hot", "label": "Steaming hot", "pulls": [("warm", 1.0, 1)]},
        {"id": "cool", "label": "Cool and refreshing", "pulls": [("warm", 0.1, 1), ("sour", 0.5, 0.4)]},
    ]},
    {"id": "texture", "prompt": "Which texture is calling?", "options": [
        {"id": "crunch", "label": "Crunch", "pulls": [("crunchy", 1.0, 1)]},
        {"id": "melt", "label": "Melt-in-mouth", "pulls": [("creamy", 1.0, 1), ("rich", 0.6, 0.4)]},
        {"id": "saucy", "label": "Saucy", "pulls": [("creamy", 0.6, 0.6), ("warm", 0.8, 0.6), ("umami", 0.7, 0.5)]},
    ]},
]
_SCENES = {s["id"]: s for s in STORY_SCENES}


def scene_option(scene_id: str, option_id: str) -> Optional[dict[str, Any]]:
    scene = _SCENES.get(scene_id)
    return next((o for o in scene["options"] if o["id"] == option_id), None) if scene else None


def story_questions(ids: list[str], asked: set[str]) -> list[Question]:
    out = []
    for scene in STORY_SCENES:
        key = f"scene:{scene['id']}"
        if key in asked:
            continue
        effects = {
            o["id"]: {i: 2 * ((sensory.fit(DISHES_BY_ID[i], o["pulls"]) or 0.5) - 0.5) for i in ids}
            for o in scene["options"]
        }
        out.append(Question(key, "choice", {
            "scene": scene["id"], "prompt": scene["prompt"],
            "options": [{"id": o["id"], "label": o["label"]} for o in scene["options"]],
        }, effects))
    return out
