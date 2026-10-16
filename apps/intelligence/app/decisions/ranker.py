"""JEV ranking over a shortlist (Phase 0: shadow only — never user-visible).

One Noul per candidate (TypeSafe's re-ranking pattern) gives a calibrated
"great fit right now" probability to sort by; one Choice over the top few
gives the commit confidence that will later decide whether to show 1, 2 or 3
cards.
"""

from __future__ import annotations

from typing import Any, Optional

from app.data.dishes import DishRecord
from app.decisions import jev
from app.decisions.questions import candidate_fit_nouls, candidate_key, ranking_state
from app.schemas.request import UserContext

COMMIT_TOP_K = 5


async def rank(ctx: UserContext, candidates: list[DishRecord], seed: str) -> Optional[dict[str, Any]]:
    client = jev.get_client()
    if client is None or not candidates:
        return None
    questions: dict[str, Any] = dict(candidate_fit_nouls(candidates))
    top = candidates[:COMMIT_TOP_K]
    questions["commit"] = jev.shuffled_choice(
        "Which one of these candidates should `person` order right now?",
        {candidate_key(i): d.name for i, d in enumerate(top)},
        seed,
    )
    decision = await client.decide("rank_shadow", ranking_state(ctx, candidates), questions)
    if decision is None:
        return None

    by_key = {candidate_key(i): d.id for i, d in enumerate(candidates)}
    scores = {by_key[k[len("fit_"):]]: round(p, 4) for k, p in decision.nouls.items() if k[len("fit_"):] in by_key}
    ranked = sorted(scores, key=lambda dish_id: scores[dish_id], reverse=True)
    out: dict[str, Any] = {
        "provider": "jev",
        "model": decision.model,
        "ranked": ranked,
        "scores": scores,
        "latency_ms": decision.latency_ms,
        "input_tokens": decision.input_tokens,
    }
    if "commit" in decision.choices:
        choice, probs, confidence = decision.choices["commit"]
        out["commit"] = {
            "dish_id": by_key.get(choice),
            "confidence": round(confidence, 4),
            "probabilities": {by_key[k]: round(p, 4) for k, p in probs.items() if k in by_key},
        }
    return out


def agreement(a: list[str], b: list[str], k: int = 3) -> Optional[float]:
    """Share of the top-k that two rankings agree on (order-insensitive)."""
    if not a or not b:
        return None
    k = min(k, len(a), len(b))
    return round(len(set(a[:k]) & set(b[:k])) / k, 3)
