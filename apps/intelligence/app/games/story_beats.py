"""Story v2: a real story about the user's day, told for the time it is now.

Ported from the v1 web app (apps/frontend/src/constants/storyBeats.ts): four
beats (morning, lunch, evening, late night), each narrated in the past, present
or future depending on the time of day, with lines that react to the previous
choice. Each choice keeps v1's mood deltas (energy, valence, social) and gains
sensory pulls (dimension, target 0-1, weight) so the engine can still measure
what an answer says about tonight's food. A craving beat closes the story.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

Pull = tuple[str, float, float]

BEATS: dict[str, dict[str, Any]] = {
    "morning": {
        "segment": "Morning",
        "narratives": {
            "present": "Your alarm just went off. The calendar says back-to-back meetings till lunch.",
            "past": "This morning had back-to-back meetings the moment you opened your laptop.",
            "future": "Tomorrow morning will hit fast. Meetings stack up before you've even had coffee.",
        },
        "overrides": {},
        "choices": [
            {"id": "morning_coffee", "label": "Grab coffee and power through", "emoji": "☕",
             "deltas": {"energy": 0.12, "valence": 0.05, "social": 0.05}, "pulls": [("heavy", 0.4, 0.6), ("warm", 0.6, 0.4)]},
            {"id": "morning_snooze", "label": "Snooze once. You need the sleep.", "emoji": "😴",
             "deltas": {"energy": -0.1, "valence": 0.02, "social": -0.05},
             "pulls": [("warm", 0.8, 0.8), ("creamy", 0.6, 0.5), ("heavy", 0.6, 0.5)]},
            {"id": "morning_skip", "label": "Skip breakfast, dive into inbox", "emoji": "📧",
             "deltas": {"energy": 0.05, "valence": -0.08, "social": -0.08}, "pulls": [("heavy", 0.8, 1.0), ("rich", 0.6, 0.5)]},
        ],
    },
    "lunch": {
        "segment": "Lunch",
        "narratives": {
            "present": "It's around lunch. Your stomach reminds you the morning was intense.",
            "past": "By lunchtime, the morning had already taken its toll.",
            "future": "Lunch is coming up. How do you usually handle it?",
        },
        "overrides": {
            "morning_skip": "Lunchtime — and your stomach hasn't forgiven you for skipping breakfast.",
            "morning_snooze": "Lunch already? That extra snooze made the morning fly by.",
            "morning_coffee": "The coffee carried you this far, but by lunch it's wearing thin.",
        },
        "choices": [
            {"id": "lunch_team", "label": "Team lunch with good energy at the table", "emoji": "👥",
             "deltas": {"energy": 0.08, "valence": 0.15, "social": 0.2},
             "pulls": [("rich", 0.6, 0.6), ("spicy", 0.5, 0.4), ("crunchy", 0.5, 0.3)]},
            {"id": "lunch_desk", "label": "Eat at desk between calls", "emoji": "💻",
             "deltas": {"energy": -0.05, "valence": -0.05, "social": -0.1}, "pulls": [("warm", 0.7, 0.6), ("creamy", 0.5, 0.4)]},
            {"id": "lunch_skip", "label": "Skip lunch, too much to finish", "emoji": "⏭️",
             "deltas": {"energy": -0.12, "valence": -0.12, "social": -0.05}, "pulls": [("heavy", 0.9, 1.0), ("rich", 0.7, 0.6)]},
        ],
    },
    "evening": {
        "segment": "Evening",
        "narratives": {
            "present": "Evening is rolling in. The day is mostly behind you.",
            "past": "By evening, the day had really stacked up.",
            "future": "Tonight is still ahead. Picture how you'd want it to go.",
        },
        "overrides": {
            "lunch_skip": "Evening now — and you still haven't eaten properly today. Tonight matters.",
            "lunch_team": "Evening's here. The good lunch energy carried the afternoon.",
            "lunch_desk": "Evening at last. Eating at your desk didn't count as a break, did it?",
        },
        "choices": [
            {"id": "evening_treat", "label": "Treat yourself. You earned it.", "emoji": "🎁",
             "deltas": {"energy": 0.1, "valence": 0.2, "social": 0.1},
             "pulls": [("rich", 0.9, 1.0), ("sweet", 0.5, 0.3), ("creamy", 0.6, 0.4)]},
            {"id": "evening_couch", "label": "Couch, show, something easy", "emoji": "🛋️",
             "deltas": {"energy": -0.15, "valence": 0.1, "social": -0.1},
             "pulls": [("warm", 0.8, 0.8), ("creamy", 0.6, 0.6), ("heavy", 0.6, 0.5)]},
            {"id": "evening_still", "label": "Still finishing work, dinner can wait", "emoji": "💼",
             "deltas": {"energy": 0.05, "valence": -0.15, "social": -0.05},
             "pulls": [("heavy", 0.3, 0.6), ("warm", 0.6, 0.4), ("spicy", 0.4, 0.3)]},
        ],
    },
    "night": {
        "segment": "Late Night",
        "narratives": {
            "present": "It's late. The world's quiet and you're still up.",
            "past": "Last night ran long. You were up later than planned.",
            "future": "Late tonight, after everything winds down...",
        },
        "overrides": {
            "evening_still": "It's late and you only just closed the laptop. The night is finally yours.",
            "evening_treat": "Still up, still riding the treat-yourself high from earlier.",
            "evening_couch": "The couch session rolled straight into late night. No regrets.",
        },
        "choices": [
            {"id": "night_chill", "label": "Chill mode, screen and snacks", "emoji": "📺",
             "deltas": {"energy": -0.1, "valence": 0.15, "social": -0.05}, "pulls": [("crunchy", 0.8, 0.8), ("salty", 0.6, 0.5)]},
            {"id": "night_crave", "label": "Late-night craving hitting hard", "emoji": "🌙",
             "deltas": {"energy": 0.05, "valence": 0.1, "social": -0.02},
             "pulls": [("rich", 0.8, 0.8), ("spicy", 0.6, 0.5), ("creamy", 0.6, 0.4)]},
            {"id": "night_wired", "label": "Wired, can't sleep yet", "emoji": "👀",
             "deltas": {"energy": 0.15, "valence": -0.05, "social": -0.05},
             "pulls": [("spicy", 0.7, 0.7), ("crunchy", 0.6, 0.5), ("heavy", 0.3, 0.4)]},
        ],
    },
    "craving": {
        "segment": "Right now",
        "narratives": {
            "morning": "So, after all that — what sounds good right now?",
            "afternoon": "What's your stomach asking for?",
            "evening": "After a day like that, what sounds good?",
            "night": "Late-night craving check. What's calling you?",
        },
        "overrides": {},
        "choices": [
            {"id": "crave_spicy", "label": "Spicy", "emoji": "🌶️", "deltas": {"energy": 0.05, "valence": 0.0, "social": 0.0},
             "pulls": [("spicy", 0.9, 1.0)]},
            {"id": "crave_sweet", "label": "Sweet", "emoji": "🍯", "deltas": {"energy": 0.0, "valence": 0.05, "social": 0.0},
             "pulls": [("sweet", 0.9, 1.0)]},
            {"id": "crave_comfort", "label": "Comfort food", "emoji": "🍲", "deltas": {"energy": -0.05, "valence": 0.05, "social": 0.0},
             "pulls": [("warm", 0.8, 0.8), ("creamy", 0.7, 0.6), ("heavy", 0.6, 0.5)]},
            {"id": "crave_healthy", "label": "Healthy", "emoji": "🥗", "deltas": {"energy": 0.05, "valence": 0.0, "social": 0.0},
             "pulls": [("heavy", 0.2, 0.9), ("rich", 0.2, 0.7)]},
            {"id": "crave_light", "label": "Light", "emoji": "🌿", "deltas": {"energy": 0.0, "valence": 0.0, "social": 0.0},
             "pulls": [("heavy", 0.1, 1.0)]},
            {"id": "crave_indulgent", "label": "Indulgent", "emoji": "🍰", "deltas": {"energy": 0.0, "valence": 0.1, "social": 0.0},
             "pulls": [("rich", 0.9, 1.0), ("heavy", 0.7, 0.5)]},
        ],
    },
}

# Three beats for the time of day (v1's SEQUENCES), then the craving beat.
SEQUENCES: dict[str, list[tuple[str, str]]] = {
    "morning": [("morning", "present"), ("lunch", "future"), ("evening", "future")],
    "afternoon": [("morning", "past"), ("lunch", "present"), ("evening", "future")],
    "evening": [("morning", "past"), ("lunch", "past"), ("evening", "present")],
    "night": [("lunch", "past"), ("evening", "past"), ("night", "present")],
}
COLD_OPENS = {
    "morning": "Good morning. Let's set the scene.",
    "afternoon": "Hey, mid-day check-in.",
    "evening": "Long day? Let's wrap it right.",
    "night": "Still up? Same.",
}
# v1 mood resolution: nearest label to the accumulated (energy, valence, social) vector.
MOODS = {"happy": (0.85, 0.9, 0.6), "tired": (0.2, 0.45, 0.25), "stressed": (0.55, 0.2, 0.3),
         "celebrating": (0.95, 0.95, 0.95), "relaxed": (0.25, 0.75, 0.35), "adventurous": (0.9, 0.85, 0.7)}


def time_of_day(now: datetime) -> str:
    h = now.hour
    return "morning" if 5 <= h < 11 else "afternoon" if h < 17 else "evening" if h < 22 else "night"


def sequence(now: datetime) -> list[dict[str, str]]:
    tod = time_of_day(now)
    return [{"beat": b, "perspective": p} for b, p in SEQUENCES[tod]] + [{"beat": "craving", "perspective": tod}]


def narrative(beat: str, perspective: str, previous_choice: Optional[str]) -> str:
    b = BEATS[beat]
    return b["overrides"].get(previous_choice or "", b["narratives"][perspective])


def choice(beat: str, choice_id: str) -> Optional[dict[str, Any]]:
    return next((c for c in BEATS[beat]["choices"] if c["id"] == choice_id), None)


def mood_vector(choice_ids: list[tuple[str, str]]) -> dict[str, float]:
    v = {"energy": 0.5, "valence": 0.5, "social": 0.5}
    for beat, cid in choice_ids:
        c = choice(beat, cid)
        for k, d in (c or {}).get("deltas", {}).items():
            v[k] = min(1.0, max(0.0, v[k] + d))
    return {k: round(x, 3) for k, x in v.items()}


def nearest_mood(v: dict[str, float]) -> str:
    return min(MOODS, key=lambda m: sum((v[k] - t) ** 2 for k, t in zip(("energy", "valence", "social"), MOODS[m])))
