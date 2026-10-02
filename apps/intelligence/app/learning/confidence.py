"""Model confidence: how sure are we that we can read this user's mind.

confidence = w1*sigmoid(n_signals/40) + w2*rolling_accuracy
           + w3*context_familiarity + w4*(1 - recent_drift), clamped [0,1].
"""

from __future__ import annotations

import json
import math
from typing import Optional

from app.learning import calibration, store, tradeoffs, user_model

W_SIGNALS = 0.35
W_ACCURACY = 0.35
W_CONTEXT = 0.15
W_STABILITY = 0.15


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _signal_volume_term(user_id: str) -> float:
    n = store.get_usage(user_id, "n_signals", 0) or 0
    # sigmoid centred so ~40 signals => ~0.73, saturating near 1.
    return _sigmoid((n - 20) / 15.0)


def _accuracy_term(user_id: str) -> float:
    stats = calibration.rolling_accuracy(user_id)
    if not stats or stats.get("n", 0) < 3:
        return 0.4  # weak prior until the loop has real resolutions
    return float(stats["accuracy"])


def _context_familiarity(user_id: str, context: Optional[dict]) -> float:
    """Fraction of past signals seen in the current context bucket."""
    bucket = tradeoffs.context_bucket(context)
    by_bucket = store.get_usage(user_id, "signals_by_bucket", {}) or {}
    total = sum(by_bucket.values())
    if total == 0:
        return 0.3
    return by_bucket.get(bucket, 0) / total


def _stability_term(user_id: str) -> float:
    """1 - recent vector drift (cosine distance between snapshots)."""
    drift = store.get_usage(user_id, "recent_drift", None)
    if drift is None:
        return 0.5
    return max(0.0, 1.0 - float(drift))


def track_drift(user_id: str) -> None:
    """Snapshot the taste vector every N events and record drift between snapshots."""
    pos, _, n_events = user_model.load_vectors(user_id)
    if pos is None or n_events == 0 or n_events % 10 != 0:
        return
    last = store.get_usage(user_id, "vector_snapshot")
    if last:
        import numpy as np

        prev = np.array(last, dtype=np.float32)
        cos = float(prev @ pos)
        store.set_usage(user_id, "recent_drift", round(max(0.0, 1.0 - cos), 4))
    store.set_usage(user_id, "vector_snapshot", [round(float(x), 6) for x in pos])


def compute(user_id: str, context: Optional[dict] = None) -> float:
    score = (
        W_SIGNALS * _signal_volume_term(user_id)
        + W_ACCURACY * _accuracy_term(user_id)
        + W_CONTEXT * _context_familiarity(user_id, context)
        + W_STABILITY * _stability_term(user_id)
    )
    return round(min(1.0, max(0.0, score)), 3)
