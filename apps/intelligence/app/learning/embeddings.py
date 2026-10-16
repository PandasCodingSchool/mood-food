"""Item tower: frozen OpenAI embeddings over dish attribute sentences.

The dish matrix lives in the model store (``dish_embeddings``; pgvector on
Postgres) keyed by model version and a hash of dishes.json. It is built at
service startup when missing (or via ``scripts/build_dish_embeddings.py``).
At request time everything is a local numpy lookup — no API calls on the hot
path.

Craving tags and mood-archetype anchors are cached in ``text_embeddings`` and
warmed at startup, so repeat sessions stay free.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Optional

import numpy as np

from app.config import settings
from app.data.dishes import DISHES, DishRecord
from app.learning import store

logger = logging.getLogger("learning")

MODEL_VERSION = f"{settings.embedding_model}-{settings.embedding_dim}"

_DISHES_JSON = Path(__file__).parent.parent / "data" / "dishes.json"
_matrix: Optional[np.ndarray] = None
_dish_ids: list[str] = []
_anchor_cache: Optional[dict[str, list[float]]] = None
# When the store had no matrix, don't re-query it on every request.
_EMPTY_RECHECK_S = 60.0
_empty_checked_at: float = 0.0


def dish_sentence(d: DishRecord) -> str:
    """Structured attribute sentence for the item tower."""
    return (
        f"{d.name}. Cuisine: {d.cuisine}. Category: {d.category}. "
        f"Mood tags: {', '.join(d.mood_tags) or 'none'}. "
        f"Diet: {', '.join(d.dietary_tags) or 'none'}. "
        f"Spice: {d.spice_level}. "
        f"Best for: {', '.join(d.social_context_tags) or 'any company'}. "
        f"Weather: {', '.join(d.weather_tags) or 'any'}. "
        f"Meal time: {', '.join(d.meal_time) or 'any'}. "
        f"Adventurousness: {d.adventurousness_score}/10. "
        f"Health score: {d.health_score}/10. Calories: {d.calories}. "
        f"Price band: {'budget' if d.price_inr <= 250 else 'mid' if d.price_inr <= 500 else 'premium'}."
    )


def dishes_hash() -> str:
    return hashlib.sha256(_DISHES_JSON.read_bytes()).hexdigest()[:16]


def _embed_remote(texts: list[str]) -> Optional[np.ndarray]:
    """Call OpenAI embeddings. Returns None when unavailable (no key/offline)."""
    if not settings.openai_api_key:
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.embeddings.create(
            model=settings.embedding_model,
            input=texts,
            dimensions=settings.embedding_dim,
        )
        vectors = np.array([item.embedding for item in response.data], dtype=np.float32)
        norms = np.linalg.norm(vectors, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vectors / norms
    except Exception as exc:  # noqa: BLE001 — degrade, never crash the pipeline
        logger.warning("Embedding call failed: %s", exc)
        return None


def _vec_text(vec) -> str:
    return json.dumps([round(float(x), 7) for x in vec])


def _stored_matrix_info() -> tuple[int, Optional[str]]:
    row = store.fetchone(
        "SELECT COUNT(*) AS n, MAX(dishes_hash) AS h FROM dish_embeddings WHERE model_version = ?",
        (MODEL_VERSION,),
    )
    return (int(row["n"]), row["h"]) if row else (0, None)


def build_dish_matrix(force: bool = False) -> bool:
    """Embed every dish into the store unless it is already current. True on success."""
    global _matrix, _dish_ids
    current_hash = dishes_hash()
    n, stored_hash = _stored_matrix_info()
    if not force and n == len(DISHES) and stored_hash == current_hash:
        return True
    vectors = _embed_remote([dish_sentence(d) for d in DISHES])
    if vectors is None:
        return False
    store.execute("DELETE FROM dish_embeddings WHERE model_version = ?", (MODEL_VERSION,))
    store.executemany(
        "INSERT INTO dish_embeddings (dish_id, model_version, dishes_hash, embedding) VALUES (?, ?, ?, ?)",
        [(d.id, MODEL_VERSION, current_hash, _vec_text(v)) for d, v in zip(DISHES, vectors)],
    )
    _matrix, _dish_ids = None, []
    logger.info("Built dish embedding matrix: %s dishes, dim %s", len(DISHES), vectors.shape[1])
    return True


def load_dish_matrix() -> tuple[Optional[np.ndarray], list[str]]:
    """Load the matrix from the store (stale-hash tolerant: warns but still serves)."""
    global _matrix, _dish_ids, _empty_checked_at
    if _matrix is not None:
        return _matrix, _dish_ids
    if time.monotonic() - _empty_checked_at < _EMPTY_RECHECK_S:
        return None, []
    rows = store.fetchall(
        "SELECT dish_id, dishes_hash, embedding FROM dish_embeddings WHERE model_version = ? ORDER BY dish_id",
        (MODEL_VERSION,),
    )
    if not rows:
        _empty_checked_at = time.monotonic()
        return None, []
    if rows[0]["dishes_hash"] != dishes_hash():
        logger.warning("dish embeddings are stale vs dishes.json — they rebuild on next startup")
    _dish_ids = [r["dish_id"] for r in rows]
    _matrix = np.asarray([json.loads(r["embedding"]) for r in rows], dtype=np.float32)
    return _matrix, _dish_ids


def get_dish_vector(dish_id: str) -> Optional[np.ndarray]:
    matrix, ids = load_dish_matrix()
    if matrix is None:
        return None
    try:
        return matrix[ids.index(dish_id)]
    except ValueError:
        return None


def get_dish_vector_by_name(name: str) -> Optional[np.ndarray]:
    """Fuzzy-ish lookup for signals that carry dish names, not ids."""
    lowered = (name or "").strip().lower()
    if not lowered:
        return None
    for d in DISHES:
        if d.name.lower() == lowered or lowered in d.name.lower():
            return get_dish_vector(d.id)
    return None


def _load_anchor_cache() -> dict[str, list[float]]:
    global _anchor_cache
    if _anchor_cache is None:
        _anchor_cache = {
            r["key"]: json.loads(r["embedding"])
            for r in store.fetchall("SELECT key, embedding FROM text_embeddings")
        }
    return _anchor_cache


def _save_anchors(items: dict[str, list[float]]) -> None:
    store.executemany(
        "INSERT INTO text_embeddings (key, embedding) VALUES (?, ?) "
        "ON CONFLICT (key) DO UPDATE SET embedding = excluded.embedding",
        [(k, _vec_text(v)) for k, v in items.items()],
    )


# Sensory craving tags the mobile Craving Radar sends (src/constants/cravingTags.ts).
SENSORY_TAGS = (
    "crunchy", "melty", "spicy", "brothy", "fresh", "cheesy",
    "crispy", "creamy", "sweet", "tangy", "smoky", "juicy",
)


def _text_key(text: str) -> str:
    return f"{MODEL_VERSION}:{text.strip().lower()}"


def craving_text(tag: str) -> str:
    return f"food craving: {tag}"


def warm_text_cache(texts: list[str]) -> int:
    """Embed any uncached texts in one batch so request paths never call out."""
    cache = _load_anchor_cache()
    missing = list(dict.fromkeys(t for t in texts if _text_key(t) not in cache))
    if not missing:
        return 0
    vectors = _embed_remote(missing)
    if vectors is None:
        return 0
    fresh = {_text_key(text): vec.tolist() for text, vec in zip(missing, vectors)}
    cache.update(fresh)
    _save_anchors(fresh)
    return len(missing)


def embed_text(text: str, allow_remote: bool = True) -> Optional[np.ndarray]:
    """Embed a short text (craving tag, archetype anchor) with disk cache.

    Request paths pass ``allow_remote=False``: an uncached text degrades to
    None instead of blocking a recommendation on an embeddings call.
    """
    cache = _load_anchor_cache()
    key = _text_key(text)
    if key in cache:
        return np.array(cache[key], dtype=np.float32)
    if not allow_remote:
        return None
    vectors = _embed_remote([text])
    if vectors is None:
        return None
    cache[key] = vectors[0].tolist()
    _save_anchors({key: cache[key]})
    return vectors[0]


def embed_tags(tags: list[str], allow_remote: bool = True) -> Optional[np.ndarray]:
    """Mean vector of a set of sensory/craving tags."""
    vectors = [
        v for v in (embed_text(craving_text(t), allow_remote=allow_remote) for t in tags)
        if v is not None
    ]
    if not vectors:
        return None
    mean = np.mean(vectors, axis=0)
    norm = np.linalg.norm(mean)
    return mean / norm if norm else mean


def population_mean_vector() -> Optional[np.ndarray]:
    """Cold-start prior: the mean dish vector (roughly 'generic taste')."""
    matrix, _ = load_dish_matrix()
    if matrix is None:
        return None
    mean = matrix.mean(axis=0)
    norm = np.linalg.norm(mean)
    return (mean / norm if norm else mean).astype(np.float32)
