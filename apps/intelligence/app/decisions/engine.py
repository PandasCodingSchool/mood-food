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
from app.lab import trace
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
    by_blend = sorted(candidates, key=lambda s: blended[s.dish.id], reverse=True)
    result.ranked = mmr(by_blend, blended, lam)
    result.blended = blended
    result.jev_fit = jev_fit
    if trace.enabled():
        final_pos = {s.dish.id: i for i, s in enumerate(result.ranked)}
        trace.emit("engine.rank", provider=result.provider, jev_weight=w, mmr_lambda=lam, excluded=sorted(exclude),
                   rows=[{"id": s.dish.id, "name": s.dish.name, "cuisine": s.dish.cuisine, "rule_total": trace.r(s.total, 2),
                          "rule_norm": trace.r(det[s.dish.id]), "jev_fit": trace.r(jev_fit[s.dish.id]) if s.dish.id in jev_fit else None,
                          "blended": trace.r(blended[s.dish.id]), "blend_rank": i + 1, "final_rank": final_pos[s.dish.id] + 1,
                          "parts": {k: trace.r(v, 2) for k, v in s.parts.items()}}
                         for i, s in enumerate(by_blend)])
    return result


async def commit(ctx: UserContext, ranked: list[ScoredDish], seed: str) -> Optional[dict[str, Any]]:
    """JEV's confidence in the #1 pick among the engine's top few (None if unavailable)."""
    client = jev.get_client()
    top = ranked[:COMMIT_TOP_K]
    if client is None or len(top) < 2:
        trace.emit("engine.commit", ran=False, reason="JEV off (no key, or switched off for this run)" if client is None else "fewer than 2 candidates")
        return None
    question = jev.shuffled_choice(
        "Which one of these candidates should `person` order right now?",
        {candidate_key(i): s.dish.name for i, s in enumerate(top)},
        seed,
    )
    decision = await client.decide("commit", ranking_state(ctx, [s.dish for s in top]), {"commit": question}, timeout_s=1.5)
    if decision is None or "commit" not in decision.choices:
        trace.emit("engine.commit", ran=False, reason="JEV gave no answer (see jev events)")
        return None
    choice, probs, confidence = decision.choices["commit"]
    by_key = {candidate_key(i): s.dish.id for i, s in enumerate(top)}
    out = {
        "dish_id": by_key.get(choice),
        "confidence": round(confidence, 4),
        "probabilities": {by_key[k]: round(p, 4) for k, p in probs.items() if k in by_key},
    }
    if trace.enabled():
        names = {s.dish.id: s.dish.name for s in top}
        trace.emit("engine.commit", ran=True, option_order=[by_key[k] for k in question.criteria if k in by_key],
                   pick=out["dish_id"], pick_name=names.get(out["dish_id"]), confidence=out["confidence"],
                   probabilities={names[i]: p for i, p in out["probabilities"].items()},
                   suggested_count=suggested_count(out, 3))
    return out


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
