"""Server-side "what we know right now" for modes that skip the questions.

Mind-reader and SOS exist to decide *without* asking, but clients send a
placeholder mood (mobile hardcodes happy/comfort/medium). For those modes the
user's own state from the signals log — today's mood check-in, today's craving
tags, last occasion — replaces the placeholder.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.learning import store
from app.schemas.request import GameData, Mood, RecommendationRequest, Situational

STATE_MODES = {"mind_reader", "sos"}


def mood_from_checkin(energy: Optional[int], stress: Optional[int], social: Optional[int],
                      occasion: Optional[str] = None) -> str:
    """Mirror of mobile ``moodFromCheckin`` so both tiers agree on the label."""
    e, s, so = energy or 5, stress or 5, social or 5
    if s >= 7:
        return "stressed"
    if e <= 4:
        return "tired"
    if e >= 7 and (so >= 7 or occasion == "treat"):
        return "adventurous"
    return "happy"


def _todays_checkin(user_id: str, today: str) -> Optional[dict]:
    row = store.fetchone(
        "SELECT energy, stress, hunger, social FROM mood_checkins "
        "WHERE user_id = ? AND day = ? ORDER BY signal_id DESC LIMIT 1",
        (user_id, today),
    )
    if not row:
        return None
    return {k: row[k] for k in ("energy", "stress", "hunger", "social")}


def apply_learned_state(body: RecommendationRequest, today: Optional[str] = None) -> RecommendationRequest:
    """Return ``body`` with server-known state for mind-reader/SOS; else unchanged."""
    if not body.user_id or body.recommendation_config.mode not in STATE_MODES:
        return body
    # Check-in days are keyed by the UTC date of the API's server_ts.
    today = today or datetime.now(timezone.utc).date().isoformat()
    ctx = body.user_context
    updates: dict = {}

    occasion = store.get_usage(body.user_id, "last_occasion", None)
    checkin = _todays_checkin(body.user_id, today)
    if checkin:
        social = checkin["social"]
        updates["mood"] = Mood(
            primary=mood_from_checkin(checkin["energy"], checkin["stress"], social, occasion),
            energy_level=checkin["energy"] or ctx.mood.energy_level,
            social_context=("friends" if (social or 0) >= 6 else "solo") if social else ctx.mood.social_context,
            hunger_level=checkin["hunger"],
            stress_level=checkin["stress"],
        )

    if occasion in ("treat", "fuel", "reward"):
        sit = ctx.situational or Situational()
        if sit.occasion is None:
            updates["situational"] = sit.model_copy(update={"occasion": occasion})

    if store.get_usage(body.user_id, "last_craving_day", "") == today:
        tags = store.get_usage(body.user_id, "last_craving_tags", []) or []
        game = ctx.game_data or GameData()
        if tags and not game.craving_tags:
            updates["game_data"] = game.model_copy(update={"craving_tags": list(tags)})

    if not updates:
        return body
    return body.model_copy(update={"user_context": ctx.model_copy(update=updates)})
