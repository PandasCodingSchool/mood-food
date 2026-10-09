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
# Time-aware decks: which cravings make sense to ask about at each meal (breakfast isn't smoky).
SLOT_CRAVINGS = {
    "breakfast": ("fresh", "sweet", "crunchy", "creamy", "tangy", "cheesy"),
    "lunch": ("spicy", "fresh", "tangy", "crunchy", "creamy", "brothy", "cheesy", "smoky"),
    "dinner": CRAVING_TAGS,
    "late_night": ("cheesy", "melty", "crunchy", "spicy", "sweet", "smoky", "creamy"),
}


def craving_questions(ids: list[str], asked: set[str], slot: Optional[str] = None) -> list[Question]:
    out = []
    for tag in SLOT_CRAVINGS.get(slot or "", CRAVING_TAGS):
        key = f"tag:{tag}"
        if key in asked:
            continue
        pulls = sensory.CRAVING_PULLS[tag]
        aff = {i: 2 * ((sensory.fit(DISHES_BY_ID[i], pulls) or 0.5) - 0.5) for i in ids}
        out.append(Question(key, "yes_no", {"tag": tag, "prompt": f"Craving something {tag}?"},
                            {"yes": aff, "no": {i: -v for i, v in aff.items()}}))
    return out


# --- story v2 (see story_beats) ------------------------------------------------------

def story_question(ids: list[str], step: dict, previous_choice: Optional[str], index: int, total: int,
                   cold_open: Optional[str] = None) -> Question:
    """One beat of the day's story; each choice's effect = how well a dish fits its taste pulls."""
    from app.games import story_beats as sb

    beat = sb.BEATS[step["beat"]]
    text = sb.narrative(step["beat"], step["perspective"], previous_choice)
    effects = {c["id"]: {i: 2 * ((sensory.fit(DISHES_BY_ID[i], c["pulls"]) or 0.5) - 0.5) for i in ids} for c in beat["choices"]}
    return Question(f"story:{step['beat']}", "choice", {
        "scene": step["beat"], "segment": beat["segment"], "prompt": text, "base_prompt": text,
        "options": [{"id": c["id"], "label": c["label"], "emoji": c["emoji"]} for c in beat["choices"]],
        "step": index + 1, "of": total, **({"cold_open": cold_open} if cold_open else {}),
    }, effects)


# --- bracket ----------------------------------------------------------------------------

SEED_ORDER = ((0, 7), (3, 4), (1, 6), (2, 5))   # 1v8, 4v5, 2v7, 3v6


def bracket_seeds(logits: dict[str, float], n: int = 8, lam: float = 0.5) -> list[str]:
    """The n strongest candidates, spread out (MMR) so the bracket isn't eight versions of one dish."""
    post = softmax(logits)
    remaining = ranked(logits)
    picked: list[str] = []
    while remaining and len(picked) < n:
        best = max(remaining[:24], key=lambda i: post[i] - lam * max(
            (dish_similarity(DISHES_BY_ID[i], DISHES_BY_ID[p]) for p in picked), default=0.0))
        picked.append(best)
        remaining.remove(best)
    return picked


def duel_question(key: str, a_id: str, b_id: str, everyone: list[str], extra: Optional[dict] = None) -> Question:
    a, b = DISHES_BY_ID[a_id], DISHES_BY_ID[b_id]
    eff = {i: dish_similarity(DISHES_BY_ID[i], a) - dish_similarity(DISHES_BY_ID[i], b) for i in everyone}
    return Question(key, "duel", {"options": [_card(a), _card(b)], **(extra or {})},
                    {a.id: eff, b.id: {i: -v for i, v in eff.items()}})


# --- meal roulette ----------------------------------------------------------------------

def spin_question(n: int, landed: str, segments: list[str], stretch: set[str], everyone: list[str], spins_left: int) -> Question:
    """A spin landed on ``landed``: accepting pulls toward it and its neighbours, a re-spin pushes away."""
    target = DISHES_BY_ID[landed]
    sims = {i: dish_similarity(DISHES_BY_ID[i], target) for i in everyone}
    mean = sum(sims.values()) / len(sims)
    accept = {i: 1.0 if i == landed else 0.5 * (s - mean) for i, s in sims.items()}
    respin = {i: -1.0 if i == landed else -0.3 * (s - mean) for i, s in sims.items()}
    return Question(f"roulette:spin{n}", "spin", {
        "segments": [{**_card(DISHES_BY_ID[i]), "stretch": i in stretch} for i in segments],
        "landed": {**_card(target), "stretch": landed in stretch}, "spin": n, "spins_left": spins_left,
        "prompt": "Something new? Give it a go or spin again." if landed in stretch else "Fancy this? Lock it in or spin again.",
    }, {"accept": accept, "respin": respin})
