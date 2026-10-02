"""Passive-context pattern miner (3.2): day x time -> archetype priors.

Mines the recent-picks log for recurring context->choice patterns ("Friday
night = festive treat", "Monday = fresh reset") and surfaces high-confidence
ones as priors + the next-meal prediction insight.
"""

from __future__ import annotations

from typing import Optional

from app.learning import store

MIN_OBSERVATIONS = 3
MIN_SHARE = 0.5


def record_context(user_id: str, context: dict, archetype: Optional[str]) -> None:
    if not archetype:
        return
    day = str(context.get("day_of_week", "unknown"))
    tod = str(context.get("time_of_day", "unknown"))
    key = f"{day}:{tod}"
    patterns = store.get_usage(user_id, "context_patterns", {})
    slot = patterns.setdefault(key, {})
    slot[archetype] = slot.get(archetype, 0) + 1
    store.set_usage(user_id, "context_patterns", patterns)


def strong_patterns(user_id: str) -> list[dict]:
    """Slots where one archetype dominates with enough observations."""
    patterns = store.get_usage(user_id, "context_patterns", {}) or {}
    result = []
    for key, counts in patterns.items():
        total = sum(counts.values())
        if total < MIN_OBSERVATIONS:
            continue
        top_archetype, top_count = max(counts.items(), key=lambda pair: pair[1])
        if top_count / total >= MIN_SHARE:
            day, tod = key.split(":", 1)
            result.append(
                {
                    "day_of_week": day,
                    "time_of_day": tod,
                    "archetype": top_archetype,
                    "share": round(top_count / total, 2),
                    "n": total,
                }
            )
    return result


def next_meal_prediction(user_id: str, context: Optional[dict]) -> Optional[str]:
    """Human-readable prediction for the CURRENT slot, if we have one."""
    if not context:
        return None
    day = str(context.get("day_of_week", "unknown"))
    tod = str(context.get("time_of_day", "unknown"))
    for pattern in strong_patterns(user_id):
        if pattern["day_of_week"] == day and pattern["time_of_day"] == tod:
            label = pattern["archetype"].replace("_", " ")
            return f"On {day} {tod}s you usually go for {label} ({int(pattern['share'] * 100)}% of the time)."
    return None


def prior_archetype(user_id: str, context: Optional[dict]) -> Optional[str]:
    if not context:
        return None
    day = str(context.get("day_of_week", "unknown"))
    tod = str(context.get("time_of_day", "unknown"))
    for pattern in strong_patterns(user_id):
        if pattern["day_of_week"] == day and pattern["time_of_day"] == tod:
            return pattern["archetype"]
    return None
