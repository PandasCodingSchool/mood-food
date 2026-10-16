"""Live check of the JEV decision layer with our real question builders.

    python scripts/jev_smoke.py

Lists models, ranks a real shortlist for a few personas (diet must hold),
and runs the menu-scout "same dish?" question on known match/mismatch pairs.
Makes a handful of cheap calls (Jev bills input tokens only).
"""

from __future__ import annotations

import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from app.config import settings  # noqa: E402
from app.data.dishes import DISHES_BY_ID  # noqa: E402
from app.decisions import jev, ranker  # noqa: E402
from app.decisions.questions import same_dish_noul  # noqa: E402
from app.schemas.request import (  # noqa: E402
    Budget, GameData, Mood, Preferences, Situational, UserContext,
)
from app.services import diet  # noqa: E402
from app.services.shortlist import build_shortlist  # noqa: E402

PERSONAS = {
    "tired vegetarian, rainy dinner": UserContext(
        mood=Mood(primary="tired", energy_level=2, hunger_level=8),
        preferences=Preferences(dietary_restrictions=["vegetarian"]),
        situational=Situational(time_of_day="dinner", weather="rainy", delivery_preferred=True),
    ),
    "stressed, craving spicy + crunchy, budget": UserContext(
        mood=Mood(primary="stressed", energy_level=5, stress_level=8),
        situational=Situational(time_of_day="dinner", budget=Budget(max=300), delivery_preferred=True),
        game_data=GameData(type="craving_radar", craving_tags=["spicy", "crunchy"]),
    ),
    "celebrating with friends, splurge": UserContext(
        mood=Mood(primary="celebrating", energy_level=8, social_context="friends"),
        situational=Situational(time_of_day="dinner", occasion="treat", delivery_preferred=True),
    ),
}

SCOUT_PAIRS = [
    ("in_002", "Dal Makhani (Serves 1)", "Slow-cooked black lentils with butter and cream", True),
    ("in_002", "Dal Tadka", "Yellow lentils tempered with cumin", False),
    ("in_007", "Mumbai Pav Bhaji", "Spiced mashed vegetables with buttered pav", True),
    ("in_007", "Chicken Keema Pav", "Minced chicken curry with pav", False),
]


async def main() -> int:
    client = jev.get_client()
    if client is None:
        print("JEV_API_KEY is not set")
        return 1
    print(f"base={settings.jev_base_url} model={settings.jev_model}")
    models = await client.sdk.models.list()
    print("models:", ", ".join(m.name for m in models.models))

    failures = 0
    for label, ctx in PERSONAS.items():
        shortlist = build_shortlist(ctx)
        t0 = time.perf_counter()
        out = await ranker.rank(ctx, shortlist, seed=label)
        wall = round((time.perf_counter() - t0) * 1000)
        if out is None:
            print(f"\n✗ {label}: no answer")
            failures += 1
            continue
        rules = diet.rules_for(ctx)
        top = [DISHES_BY_ID[i] for i in out["ranked"][:3]]
        safe = all(diet.allows(d, rules) for d in top)
        failures += not safe
        commit = out.get("commit") or {}
        print(f"\n{'✓' if safe else '✗'} {label}  ({len(shortlist)} candidates, {wall} ms wall, {out['input_tokens']} tok)")
        for d in top:
            print(f"    {out['scores'][d.id]:.2f}  {d.name} ({d.cuisine}, ₹{d.price_inr})")
        if commit.get("dish_id"):
            print(f"    commit → {DISHES_BY_ID[commit['dish_id']].name} @ confidence {commit['confidence']:.2f}")

    print("\nmenu scout (same dish?)")
    for dish_id, item, desc, expected in SCOUT_PAIRS:
        state, qs = same_dish_noul(DISHES_BY_ID[dish_id], item, desc)
        d = await client.decide("scout_smoke", state, qs)
        p = d.nouls["same_dish"] if d else None
        ok = p is not None and (p >= 0.9) == expected
        failures += not ok
        print(f"  {'✓' if ok else '✗'} {DISHES_BY_ID[dish_id].name!r} vs {item!r}: {p}")

    print("\nOK" if not failures else f"\n{failures} check(s) failed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
