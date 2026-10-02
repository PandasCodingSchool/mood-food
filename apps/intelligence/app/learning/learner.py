"""Central signal dispatcher: folds ordered signals into every learner.

Every game is just another ``signal.type`` — this registry is the single
place a new game plugs into the model. All handlers must be pure folds so
replaying the Node log reproduces identical state.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from app.learning import (
    calibration,
    confidence,
    embeddings,
    entropy,
    mood_map,
    patterns,
    persona,
    store,
    tradeoffs,
    user_model,
)

logger = logging.getLogger("learning")

VETO_REASON_ROUTES = {"too_heavy", "had_recently", "too_pricey", "not_feeling_it"}


def _dish_vector(payload: dict) -> Optional[Any]:
    vec = embeddings.get_dish_vector(str(payload.get("dish_id", "")))
    if vec is None:
        vec = embeddings.get_dish_vector_by_name(
            str(payload.get("dish_name") or payload.get("item") or "")
        )
    return vec


def _handle_mood_checkin(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    day = str(context.get("server_ts", datetime.now(timezone.utc).isoformat()))[:10]
    store.execute(
        """INSERT OR IGNORE INTO mood_checkins (user_id, signal_id, energy, stress, hunger, social, day)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            user_id,
            signal_id,
            payload.get("energy"),
            payload.get("stress"),
            payload.get("hunger"),
            payload.get("social"),
            day,
        ),
    )


def _handle_swipe(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    swipes = payload.get("swipes") or [payload]
    for swipe in swipes:
        vec = _dish_vector(swipe)
        if vec is None:
            continue
        direction = 1.0 if swipe.get("liked") else -1.0
        weight = user_model.swipe_weight(swipe.get("reaction_time"))
        user_model.update(user_id, vec, direction, weight)
        if swipe.get("liked"):
            entropy.record_pick(user_id, signal_id, swipe.get("dish_id"), "like")


def _handle_this_or_that(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    for duel in payload.get("duels", []):
        tradeoffs.observe_duel(
            user_id,
            str(duel.get("dimension_a", duel.get("dimension", ""))),
            str(duel.get("dimension_b", "comfort")),
            str(duel.get("winner", "")),
            context,
        )


def _handle_post_meal(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    actual = float(payload.get("actual_score", 3))
    dish_id = payload.get("dish_id")

    # 1) Calibration stats (the backbone).
    calibration.resolve(
        user_id,
        str(payload.get("rec_id", "")),
        dish_id,
        payload.get("predicted_score"),
        actual,
    )
    calibration.grade_blind_bet(user_id, dish_id, actual)

    # 2) Taste vector: signed pull/push scaled by outcome.
    vec = _dish_vector(payload)
    if vec is not None:
        weight = user_model.post_meal_weight(actual)
        if abs(weight) > 1e-6:
            user_model.update(user_id, vec, 1.0 if weight > 0 else -1.0, abs(weight))

    # 3) Mood map: correlate against the mood at recommendation time.
    archetype = mood_map.archetype_of_dish_id(dish_id)
    if archetype:
        key = mood_map.mood_key(
            context.get("energy") or payload.get("energy"),
            context.get("stress") or payload.get("stress"),
        )
        mood_map.observe(user_id, key, archetype, actual)
        patterns.record_context(user_id, context, archetype)
    entropy.record_pick(user_id, signal_id, dish_id, "post_meal")


def _handle_veto(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    reason = str(payload.get("reason", "not_feeling_it"))
    vec = _dish_vector(payload)
    if reason == "too_heavy" and vec is not None:
        user_model.update(user_id, vec, -1.0, user_model.VETO_RICHNESS_WEIGHT)
        tradeoffs.adjust_theta(user_id, "health", 0.15, context)
    elif reason == "had_recently":
        # Session recency penalty ONLY — never a permanent vector update.
        recent = store.get_usage(user_id, "recency_penalties", {})
        if payload.get("dish_id"):
            recent[str(payload["dish_id"])] = str(context.get("server_ts", ""))[:10]
            store.set_usage(user_id, "recency_penalties", recent)
    elif reason == "too_pricey":
        tradeoffs.adjust_theta(user_id, "price", 0.25, context)
    else:  # not_feeling_it -> mood mismatch, tiny negative mood-map obs
        archetype = mood_map.archetype_of_dish_id(payload.get("dish_id"))
        if archetype:
            key = mood_map.mood_key(context.get("energy"), context.get("stress"))
            mood_map.observe(user_id, key, archetype, 2.0)


def _handle_craving(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    day = str(context.get("server_ts", ""))[:10]
    store.set_usage(user_id, "last_craving_day", day)
    store.set_usage(user_id, "last_craving_tags", payload.get("tags", []))


def _handle_occasion(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    occasion = str(payload.get("occasion", ""))
    if occasion not in ("treat", "fuel", "reward"):
        return
    spend = payload.get("chosen_price")
    bands = store.get_usage(user_id, "occasion_spend", {})
    slot = bands.setdefault(occasion, {"n": 0, "sum": 0})
    if spend:
        slot["n"] += 1
        slot["sum"] += float(spend)
    store.set_usage(user_id, "occasion_spend", bands)
    store.set_usage(user_id, "last_occasion", occasion)


def _handle_order(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    vec = _dish_vector(payload)
    if vec is not None:
        user_model.update(user_id, vec, 1.0, user_model.ORDER_WEIGHT)
    archetype = mood_map.archetype_of_dish_id(payload.get("dish_id"))
    patterns.record_context(user_id, context, archetype)
    entropy.record_pick(user_id, signal_id, payload.get("dish_id"), "order")


def _handle_mind_reader(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    stats = store.get_usage(user_id, "mind_reader_stats", {"n": 0, "accepted": 0})
    stats["n"] += 1
    stats["accepted"] += 1 if payload.get("accepted") else 0
    store.set_usage(user_id, "mind_reader_stats", stats)


def _handle_wildcard(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    entropy.record_wildcard_verdict(user_id, bool(payload.get("accepted")))


def _handle_sos(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    store.set_usage(user_id, "sos_count", (store.get_usage(user_id, "sos_count", 0) or 0) + 1)


def _handle_day_story(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    # The story resolves to a mood vector; store as a soft state estimate.
    store.set_usage(user_id, "last_story_mood", payload.get("mood_vector"))


def _handle_nostalgia(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    anchors = store.get_usage(user_id, "comfort_anchors", [])
    anchors.append({"food": payload.get("food"), "trigger": payload.get("trigger")})
    store.set_usage(user_id, "comfort_anchors", anchors[-20:])


def _handle_hunger(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    observations = store.get_usage(user_id, "hunger_obs", [])
    observations.append(
        {
            "hunger": payload.get("level"),
            "hours_since_last_meal": context.get("hours_since_last_meal"),
            "portion": payload.get("portion_chosen"),
        }
    )
    store.set_usage(user_id, "hunger_obs", observations[-50:])


def _handle_pantry(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    stats = store.get_usage(user_id, "pantry_stats", {"cook": 0, "order": 0})
    choice = str(payload.get("chose", ""))
    if choice in stats:
        stats[choice] += 1
    store.set_usage(user_id, "pantry_stats", stats)


def _handle_blind_bet(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    if payload.get("user_predicted_score") is not None:
        calibration.record_blind_bet(
            user_id, payload.get("dish_id"), float(payload["user_predicted_score"])
        )


def _handle_bracket(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    # Seasonal picks: light recency-decayed taste updates (drift detection).
    for pick in payload.get("picks", []):
        vec = _dish_vector(pick if isinstance(pick, dict) else {"dish_id": pick})
        if vec is not None:
            user_model.update(user_id, vec, 1.0, 0.5)


def _handle_group_swipe(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    _handle_swipe(user_id, signal_id, payload, context)


def _handle_game_signals(user_id: str, signal_id: int, payload: dict, context: dict) -> None:
    """A full GameSignals blob from any existing game: mine what's usable."""
    for name in payload.get("liked", []):
        vec = embeddings.get_dish_vector_by_name(str(name))
        if vec is not None:
            user_model.update(user_id, vec, 1.0, user_model.LIKE_WEIGHT)
    for name in payload.get("disliked", []):
        vec = embeddings.get_dish_vector_by_name(str(name))
        if vec is not None:
            user_model.update(user_id, vec, -1.0, user_model.LIKE_WEIGHT)
    if payload.get("swipes"):
        _handle_swipe(user_id, signal_id, {"swipes": payload["swipes"]}, context)


_HANDLERS: dict[str, Callable[[str, int, dict, dict], None]] = {
    "mood_checkin": _handle_mood_checkin,
    "swipe": _handle_swipe,
    "this_or_that": _handle_this_or_that,
    "post_meal": _handle_post_meal,
    "veto": _handle_veto,
    "craving": _handle_craving,
    "occasion": _handle_occasion,
    "order": _handle_order,
    "mind_reader_verdict": _handle_mind_reader,
    "wildcard_verdict": _handle_wildcard,
    "sos": _handle_sos,
    "day_story": _handle_day_story,
    "nostalgia": _handle_nostalgia,
    "hunger": _handle_hunger,
    "pantry": _handle_pantry,
    "blind_bet": _handle_blind_bet,
    "bracket": _handle_bracket,
    "group_swipe": _handle_group_swipe,
    "game_signals": _handle_game_signals,
    "quest_event": lambda *args: None,  # progress lives in Node; nothing to learn yet
}


def apply_signal(user_id: str, signal: dict) -> None:
    """Fold one signal into the model. Unknown types are counted, not fatal.

    Idempotent by signal id: a signal at or below the stored cursor has
    already been folded in (e.g. by a replay that raced a live batch) and is
    skipped so replays are safe to re-run.
    """
    signal_id = int(signal.get("id", 0))
    if signal_id and signal_id <= store.get_cursor(user_id):
        return
    signal_type = str(signal.get("type", ""))
    payload = signal.get("payload") or {}
    context = signal.get("context") or {}

    handler = _HANDLERS.get(signal_type)
    if handler:
        try:
            handler(user_id, signal_id, payload, context)
        except Exception:  # noqa: BLE001 — one bad signal must not poison the fold
            logger.exception("Handler failed for signal type %s", signal_type)

    # Bookkeeping folds (always run, order-independent).
    store.set_usage(user_id, "n_signals", (store.get_usage(user_id, "n_signals", 0) or 0) + 1)
    from app.learning.tradeoffs import context_bucket

    by_bucket = store.get_usage(user_id, "signals_by_bucket", {}) or {}
    bucket = context_bucket(context)
    by_bucket[bucket] = by_bucket.get(bucket, 0) + 1
    store.set_usage(user_id, "signals_by_bucket", by_bucket)

    if signal_id:
        store.set_cursor(user_id, signal_id)


def apply_batch(user_id: str, signals: list[dict]) -> dict:
    """Fold a batch, then refresh derived state and return the sync payload."""
    for signal in sorted(signals, key=lambda s: s.get("id", 0)):
        apply_signal(user_id, signal)

    confidence.track_drift(user_id)
    persona_info = persona.recompute(user_id)

    from app.learning.orchestrator import question_budget

    budget, conf = question_budget(user_id)
    return {
        "taste_vector": user_model.taste_vector_payload(user_id),
        "profile_summary": {
            "confidence": conf,
            "question_budget": budget,
            "n_signals": store.get_usage(user_id, "n_signals", 0),
            **(
                {"persona_archetype": persona_info["archetype"]}
                if persona_info
                else {}
            ),
        },
    }
