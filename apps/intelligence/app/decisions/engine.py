"""Decision engine: shortlist → blended score → diverse order → commit confidence.

1. Deterministic score (shortlist.score_breakdown) normalised to 0-1.
2. JEV fit probability per candidate (one Noul each), blended in with weight
   ``settings.jev_weight``. No JEV answer → deterministic order alone.
3. MMR diversification so the top picks differ in cuisine, protein and feel
   (JEV alone happily returns three BBQ dishes).
4. Commit confidence: one JEV Choice over the engine's own top few — how sure
   we are about the #1 pick. Drives how many options a client should show.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from app.config import settings
from app.data.dishes import DishRecord
from app.decisions import jev
from app.decisions.questions import candidate_fit_nouls, candidate_key, ranking_state
from app.schemas.request import UserContext
from app.services import sensory
from app.services.shortlist import ScoredDish

JEV_MAX_CANDIDATES = 20
COMMIT_TOP_K = 4


@dataclass
class EngineResult:
    ranked: list[ScoredDish]
    blended: dict[str, float]           # dish_id -> final 0-1 score
    jev_fit: dict[str, float] = field(default_factory=dict)
    provider: str = "deterministic"     # "jev" when JEV answered
    model: Optional[str] = None
    latency_ms: float = 0.0
    input_tokens: int = 0


def _normalise(values: dict[str, float]) -> dict[str, float]:
    lo, hi = min(values.values()), max(values.values())
    span = hi - lo
    return {k: (v - lo) / span if span else 0.5 for k, v in values.items()}


def dish_similarity(a: DishRecord, b: DishRecord) -> float:
    """0-1: same cuisine, same protein and similar sensory feel all count."""
    same_cuisine = 1.0 if a.cuisine == b.cuisine else 0.0
    same_protein = 1.0 if a.protein and a.protein == b.protein and a.protein not in ("none", "veg") else 0.0
    same_method = 1.0 if a.cooking_method and a.cooking_method == b.cooking_method else 0.0
    return 0.3 * same_cuisine + 0.3 * same_protein + 0.15 * same_method + 0.25 * sensory.similarity(a, b)


def mmr(items: list[ScoredDish], scores: dict[str, float], lam: float) -> list[ScoredDish]:
    """Maximal marginal relevance: score minus λ·(max similarity to already-picked)."""
    remaining = list(items)
    picked: list[ScoredDish] = []
    while remaining:
        best = max(
            remaining,
            key=lambda s: scores[s.dish.id]
            - lam * max((dish_similarity(s.dish, p.dish) for p in picked), default=0.0),
        )
        picked.append(best)
        remaining.remove(best)
    return picked


async def rank(
    ctx: UserContext,
    shortlist: list[ScoredDish],
    *,
    exclude: frozenset[str] = frozenset(),
    diversity: str = "medium",
) -> EngineResult:
    candidates = [s for s in shortlist if s.dish.id not in exclude] or list(shortlist)
    det = _normalise({s.dish.id: s.total for s in candidates})

    jev_fit: dict[str, float] = {}
    result = EngineResult(ranked=[], blended={})
    client = jev.get_client()
    pool = candidates[:JEV_MAX_CANDIDATES]
    if client is not None and pool:
        decision = await client.decide("rank", ranking_state(ctx, [s.dish for s in pool]), candidate_fit_nouls([s.dish for s in pool]))
        if decision is not None:
            by_key = {candidate_key(i): s.dish.id for i, s in enumerate(pool)}
            jev_fit = {by_key[k[4:]]: p for k, p in decision.nouls.items() if k[4:] in by_key}
            result.provider, result.model = "jev", decision.model
            result.latency_ms, result.input_tokens = decision.latency_ms, decision.input_tokens

    w = settings.jev_weight if jev_fit else 0.0
    # Candidates JEV didn't see (beyond the cap) keep a neutral 0.5 fit.
    blended = {i: (1 - w) * det[i] + w * jev_fit.get(i, 0.5) for i in det}
    lam = {"low": 0.0, "medium": 0.25, "high": 0.45}.get(diversity, 0.25)
    result.ranked = mmr(sorted(candidates, key=lambda s: blended[s.dish.id], reverse=True), blended, lam)
    result.blended = blended
    result.jev_fit = jev_fit
    return result


async def commit(ctx: UserContext, ranked: list[ScoredDish], seed: str) -> Optional[dict[str, Any]]:
    """JEV's confidence in the #1 pick among the engine's top few (None if unavailable)."""
    client = jev.get_client()
    top = ranked[:COMMIT_TOP_K]
    if client is None or len(top) < 2:
        return None
    question = jev.shuffled_choice(
        "Which one of these candidates should `person` order right now?",
        {candidate_key(i): s.dish.name for i, s in enumerate(top)},
        seed,
    )
    decision = await client.decide("commit", ranking_state(ctx, [s.dish for s in top]), {"commit": question}, timeout_s=1.5)
    if decision is None or "commit" not in decision.choices:
        return None
    choice, probs, confidence = decision.choices["commit"]
    by_key = {candidate_key(i): s.dish.id for i, s in enumerate(top)}
    return {
        "dish_id": by_key.get(choice),
        "confidence": round(confidence, 4),
        "probabilities": {by_key[k]: round(p, 4) for k, p in probs.items() if k in by_key},
    }


def suggested_count(commit_result: Optional[dict[str, Any]], requested: int) -> int:
    """How many cards a client should show: 1 when sure, 2 for a duel, else as requested."""
    if not commit_result:
        return requested
    c = commit_result["confidence"]
    if c >= settings.commit_one_threshold:
        return 1
    if c >= settings.commit_two_threshold:
        return min(2, requested)
    return requested
