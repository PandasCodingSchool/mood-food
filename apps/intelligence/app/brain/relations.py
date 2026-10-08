"""Context → choice relations with shrinkage: what this user picks at lunch, on weekends, ...

P_user(f)      = (count(f) + β / |V|) / (n + β)                 — the user overall (β=2)
P_ctx(f)       = (count_ctx(f) + α · P_user(f)) / (n_ctx + α)   — the user in a context (α=3)
lift(ctx, f)   = P_ctx(f) / P_user(f)
Counts are time-decayed item weights (see facts.item_rows). Sparse contexts
shrink to the user's overall habits; confidence = n_ctx / (n_ctx + α).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Optional

from app.brain.facts import item_rows
from app.history.normalise import IST

ALPHA, BETA = 3.0, 2.0
CONTEXTS = ("slot", "daytype")
FEATURES = ("cuisine", "protein", "form", "spice", "heaviness")
MIN_LIFT, MIN_P, MIN_N = 1.3, 0.3, 1.0


class Relations:
    def __init__(self, orders: list[dict], now: Optional[datetime] = None):
        self.rows = item_rows(orders, now or datetime.now(IST))
        self.n = sum(r["w"] for r in self.rows)
        self.user: dict[str, dict[str, float]] = {}
        self.ctx: dict[tuple[str, str], dict[str, dict[str, float]]] = {}
        self.ctx_n: dict[tuple[str, str], float] = defaultdict(float)
        for f in FEATURES:
            counts: dict[str, float] = defaultdict(float)
            for r in self.rows:
                if r.get(f):
                    counts[r[f]] += r["w"]
            vocab = max(1, len(counts))
            n_f = sum(counts.values())
            self.user[f] = {v: (c + BETA / vocab) / (n_f + BETA) for v, c in counts.items()}
        for c in CONTEXTS:
            for r in self.rows:
                if r.get(c):
                    self.ctx_n[(c, r[c])] += r["w"]
        for (c, cv), n_ctx in self.ctx_n.items():
            per: dict[str, dict[str, float]] = {}
            for f in FEATURES:
                counts: dict[str, float] = defaultdict(float)
                for r in self.rows:
                    if r.get(c) == cv and r.get(f):
                        counts[r[f]] += r["w"]
                per[f] = {v: (counts.get(v, 0.0) + ALPHA * p) / (sum(counts.values()) + ALPHA) for v, p in self.user[f].items()}
            self.ctx[(c, cv)] = per

    def confidence(self, context: str, value: Optional[str]) -> float:
        n = self.ctx_n.get((context, value or ""), 0.0)
        return round(n / (n + ALPHA), 3)

    def predict(self, slot: Optional[str] = None, daytype: Optional[str] = None) -> dict[str, Any]:
        """Distributions over each feature for this context (evidence-weighted blend of the matching contexts)."""
        parts = [((c, v), self.ctx_n[(c, v)]) for c, v in (("slot", slot), ("daytype", daytype)) if v and (c, v) in self.ctx]
        out: dict[str, dict[str, float]] = {}
        for f in FEATURES:
            if not parts:
                dist = dict(self.user[f])
            else:
                total = sum(n for _, n in parts)
                dist = {v: sum(self.ctx[k][f].get(v, 0.0) * n for k, n in parts) / total for v in self.user[f]}
            z = sum(dist.values()) or 1.0
            out[f] = {v: round(p / z, 4) for v, p in sorted(dist.items(), key=lambda kv: -kv[1])}
        conf = max((self.confidence(c, v) for (c, v), _ in parts), default=round(self.n / (self.n + ALPHA), 3) if self.n else 0.0)
        return {"distributions": out, "confidence": conf, "evidence": round(self.n, 2),
                "contexts": [{"context": c, "value": v, "n": round(n, 2)} for (c, v), n in parts]}

    def highlights(self, limit: int = 8) -> list[dict]:
        """Strongest context → choice links (e.g. weekday lunch → mediterranean, 2.1× usual)."""
        out = []
        for (c, cv), per in self.ctx.items():
            if self.ctx_n[(c, cv)] < MIN_N:
                continue
            for f, dist in per.items():
                for v, p in dist.items():
                    base = self.user[f].get(v) or 1e-9
                    lift = p / base
                    if lift >= MIN_LIFT and p >= MIN_P:
                        out.append({"context": c, "when": cv, "feature": f, "value": v, "p": round(p, 3), "lift": round(lift, 2),
                                    "n": round(self.ctx_n[(c, cv)], 2),
                                    "text": f"{cv.replace('_', ' ').capitalize()} → {v.replace('_', ' ')} ({lift:.1f}× usual)"})
        return sorted(out, key=lambda h: (h["lift"] * h["p"]), reverse=True)[:limit]
