"""Item tower: frozen OpenAI embeddings over dish attribute sentences.

The dish matrix is built offline (``intelligence/scripts/build_dish_embeddings.py``)
and cached to an ``.npz`` keyed by a hash of dishes.json. At request time
everything is a local numpy lookup — no API calls on the hot path.

Craving tags and mood-archetype anchors are embedded lazily and cached in a
small JSON sidecar so repeat sessions stay free.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np

from app.config import settings
from app.data.dishes import DISHES, DishRecord

logger = logging.getLogger("learning")

MODEL_VERSION = f"{settings.embedding_model}-{settings.embedding_dim}"

_DISHES_JSON = Path(__file__).parent.parent / "data" / "dishes.json"
_ANCHOR_CACHE = Path(settings.model_store_path).with_suffix(".anchors.json")

_matrix: Optional[np.ndarray] = None
_dish_ids: list[str] = []
_anchor_cache: Optional[dict[str, list[float]]] = None


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


def build_dish_matrix(force: bool = False) -> bool:
    """Build and cache the dish embedding matrix. Returns True on success."""
    path = Path(settings.dish_embeddings_path)
    current_hash = dishes_hash()
    if path.exists() and not force:
        cached = np.load(path, allow_pickle=True)
        if str(cached.get("dishes_hash")) == current_hash and str(cached.get("model_version")) == MODEL_VERSION:
            return True
    vectors = _embed_remote([dish_sentence(d) for d in DISHES])
    if vectors is None:
        return False
    np.savez(
        path,
        matrix=vectors,
        dish_ids=np.array([d.id for d in DISHES]),
        dishes_hash=current_hash,
        model_version=MODEL_VERSION,
    )
    logger.info("Built dish embedding matrix: %s dishes, dim %s", len(DISHES), vectors.shape[1])
    return True


def load_dish_matrix() -> tuple[Optional[np.ndarray], list[str]]:
    """Load the cached matrix (stale-hash tolerant: warns but still serves)."""
    global _matrix, _dish_ids
    if _matrix is not None:
        return _matrix, _dish_ids
    path = Path(settings.dish_embeddings_path)
    if not path.exists():
        return None, []
    cached = np.load(path, allow_pickle=True)
    if str(cached.get("dishes_hash")) != dishes_hash():
        logger.warning("dish_embeddings.npz is stale vs dishes.json — run build_dish_embeddings.py")
    _matrix = np.asarray(cached["matrix"], dtype=np.float32)
    _dish_ids = [str(i) for i in cached["dish_ids"]]
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
        try:
            _anchor_cache = json.loads(_ANCHOR_CACHE.read_text())
        except (OSError, json.JSONDecodeError):
            _anchor_cache = {}
    return _anchor_cache


def embed_text(text: str) -> Optional[np.ndarray]:
    """Embed a short text (craving tag, archetype anchor) with disk cache."""
    cache = _load_anchor_cache()
    key = f"{MODEL_VERSION}:{text.strip().lower()}"
    if key in cache:
        return np.array(cache[key], dtype=np.float32)
    vectors = _embed_remote([text])
    if vectors is None:
        return None
    cache[key] = vectors[0].tolist()
    try:
        _ANCHOR_CACHE.write_text(json.dumps(cache))
    except OSError:
        pass
    return vectors[0]


def embed_tags(tags: list[str]) -> Optional[np.ndarray]:
    """Mean vector of a set of sensory/craving tags."""
    vectors = [v for v in (embed_text(f"food craving: {t}") for t in tags) if v is not None]
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
