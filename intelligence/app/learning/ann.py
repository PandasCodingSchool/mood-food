"""ANN retrieval over dish and user vectors.

Uses FAISS ``IndexFlatIP`` (exact inner product over L2-normalized vectors =
cosine) when available; falls back to a numpy brute-force search otherwise —
identical results at this catalogue size, so dev environments without faiss
still work.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import numpy as np

from app.learning import embeddings, store

logger = logging.getLogger("learning")

try:
    import faiss  # type: ignore

    _HAS_FAISS = True
except ImportError:
    faiss = None
    _HAS_FAISS = False
    logger.info("faiss not installed — using numpy brute-force ANN fallback")

_dish_index = None
_dish_ids: list[str] = []


def _build_dish_index() -> bool:
    global _dish_index, _dish_ids
    if _dish_index is not None:
        return True
    matrix, ids = embeddings.load_dish_matrix()
    if matrix is None:
        return False
    _dish_ids = ids
    if _HAS_FAISS:
        index = faiss.IndexFlatIP(matrix.shape[1])
        index.add(matrix)
        _dish_index = index
    else:
        _dish_index = matrix  # brute force
    return True


def search_dishes(query: np.ndarray, top_k: int = 50) -> list[tuple[str, float]]:
    """Top-k dishes by cosine similarity to the query vector."""
    if not _build_dish_index():
        return []
    q = query.astype(np.float32).reshape(1, -1)
    top_k = min(top_k, len(_dish_ids))
    if _HAS_FAISS:
        scores, indices = _dish_index.search(q, top_k)
        return [
            (_dish_ids[i], float(s))
            for i, s in zip(indices[0], scores[0])
            if i >= 0
        ]
    scores = (_dish_index @ q.T).ravel()
    order = np.argsort(-scores)[:top_k]
    return [(_dish_ids[i], float(scores[i])) for i in order]


def nearest_users(user_id: str, top_k: int = 10) -> list[tuple[str, float]]:
    """Taste twins: nearest neighbours over all learned user vectors.

    Rebuilt per call from the model store — user counts are small; revisit
    with a persistent index if that changes.
    """
    rows = store.fetchall("SELECT user_id, positive_json FROM user_vectors")
    vectors, ids = [], []
    target: Optional[np.ndarray] = None
    for row in rows:
        vec = np.array(json.loads(row["positive_json"]), dtype=np.float32)
        if row["user_id"] == user_id:
            target = vec
        else:
            ids.append(row["user_id"])
            vectors.append(vec)
    if target is None or not vectors:
        return []
    matrix = np.stack(vectors)
    scores = matrix @ target
    order = np.argsort(-scores)[:top_k]
    return [(ids[i], float(scores[i])) for i in order]
