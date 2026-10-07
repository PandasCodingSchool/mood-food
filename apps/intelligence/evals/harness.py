"""Golden evals for the recommendation pipeline.

Deterministic checks (always on, also in CI via ``pytest -m eval``) cover the
shortlist that every ranker sees: safety, budget, pool size, mood fit,
diversity, latency. ``python -m evals.harness --live`` additionally ranks
each scenario with JEV and prints a scorecard.
"""

from __future__ import annotations

import argparse
import asyncio
import itertools
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from app.data.dishes import DishRecord
from app.schemas.request import UserContext
from app.services import diet
from app.services.shortlist import _budget_max, build_shortlist, mood_tags_for

SCENARIOS = Path(__file__).with_name("scenarios.json")

PERSONAS = {
    "omnivore": {},
    "vegetarian": {"dietary_restrictions": ["vegetarian"]},
    "vegan": {"dietary_restrictions": ["vegan"]},
    "nut+gluten free": {"dietary_restrictions": ["gluten_free"], "allergies": ["nuts"]},
    "non_veg": {"dietary_restrictions": ["non_veg"]},
}
SLOTS = ["breakfast", "lunch", "dinner", "late_night"]
MOODS = ["happy", "tired", "stressed", "adventurous", "celebrating"]
BUDGETS = [300, 800, None]

SHORTLIST_BUDGET_MS = 50.0


@dataclass
class Scenario:
    name: str
    ctx: UserContext
    expect: dict[str, Any] = field(default_factory=dict)


@dataclass
class Result:
    scenario: Scenario
    pool: list[DishRecord]
    ms: float
    failures: list[str]


def _resolve(value: Any) -> Any:
    if value == "__NOW_MINUS_2H__":
        return (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    if isinstance(value, dict):
        return {k: _resolve(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_resolve(v) for v in value]
    return value


def named_scenarios() -> list[Scenario]:
    data = json.loads(SCENARIOS.read_text())
    return [
        Scenario(s["name"], UserContext.model_validate(_resolve(s["user_context"])), s.get("expect", {}))
        for s in data["scenarios"]
    ]


def grid_scenarios() -> list[Scenario]:
    out = []
    for (persona, prefs), slot, mood, budget in itertools.product(PERSONAS.items(), SLOTS, MOODS, BUDGETS):
        sit: dict[str, Any] = {"time_of_day": slot, "delivery_preferred": True}
        if budget:
            sit["budget"] = {"max": budget}
        ctx = UserContext.model_validate({"mood": {"primary": mood}, "preferences": prefs, "situational": sit})
        out.append(Scenario(f"{persona} | {slot} | {mood} | ₹{budget or 'any'}", ctx))
    return out


def warm_up() -> None:
    """Pay import/cache costs once so per-scenario timings are steady-state."""
    build_shortlist(UserContext.model_validate({"mood": {"primary": "happy"}}))


def evaluate(s: Scenario) -> Result:
    t0 = time.perf_counter()
    pool = build_shortlist(s.ctx)
    ms = (time.perf_counter() - t0) * 1000
    failures: list[str] = []
    rules = diet.rules_for(s.ctx)

    unsafe = [d.name for d in pool if not diet.allows(d, rules)]
    if unsafe:
        failures.append(f"diet/allergen violation: {unsafe}")
    budget = _budget_max(s.ctx)
    # The diet-only last-resort pool may exceed budget, but never when budget-fitting dishes exist.
    if budget is not None and any(d.price_inr > budget for d in pool) and len(pool) >= 3:
        over = [d.name for d in pool if d.price_inr > budget]
        if len(over) < len(pool):
            failures.append(f"over budget: {over}")
    if ms > SHORTLIST_BUDGET_MS:
        failures.append(f"slow shortlist: {ms:.0f} ms")

    e = s.expect
    names = [d.name for d in pool]
    if len(pool) < e.get("min_pool", 1):
        failures.append(f"pool {len(pool)} < {e['min_pool']}")
    if e.get("any_of_top") and not set(e["any_of_top"]) & set(names[:6]):
        failures.append(f"none of {e['any_of_top']} in top 6: {names[:6]}")
    for n in e.get("excluded", []):
        if n in names:
            failures.append(f"{n} should be excluded")
    for n in e.get("not_in_top", []):
        if n in names[:5]:
            failures.append(f"{n} should not be in top 5")
    if e.get("min_cuisines_top5") and len({d.cuisine for d in pool[:5]}) < e["min_cuisines_top5"]:
        failures.append(f"top 5 spans < {e['min_cuisines_top5']} cuisines")
    return Result(s, pool, ms, failures)


def mood_fit(r: Result, k: int = 5) -> Optional[float]:
    tags = mood_tags_for(r.scenario.ctx.mood.primary)
    top = r.pool[:k]
    return None if not top else sum(bool(tags & set(d.mood_tags)) for d in top) / len(top)


async def _live(results: list[Result]) -> None:
    from app.decisions import ranker

    safe, agree, fits, lat = 0, [], [], []
    for r in results:
        out = await ranker.rank(r.scenario.ctx, r.pool, seed=r.scenario.name)
        if out is None:
            print(f"  ✗ {r.scenario.name}: no JEV answer")
            continue
        rules = diet.rules_for(r.scenario.ctx)
        by_id = {d.id: d for d in r.pool}
        top = [by_id[i] for i in out["ranked"][:3]]
        safe += all(diet.allows(d, rules) for d in top)
        tags = mood_tags_for(r.scenario.ctx.mood.primary)
        fits.append(sum(bool(tags & set(d.mood_tags)) for d in top) / max(1, len(top)))
        agree.append(ranker.agreement(out["ranked"], [d.id for d in r.pool]) or 0)
        lat.append(out["latency_ms"])
        print(f"  {r.scenario.name}: {[d.name for d in top]} commit={out.get('commit', {}).get('confidence')}")
    n = len(lat)
    if n:
        print(
            f"\nJEV scorecard ({n} scenarios): top-3 diet-safe {safe}/{n} | mood fit {sum(fits) / n:.2f} "
            f"| agreement with shortlist top-3 {sum(agree) / n:.2f} | p50 latency {sorted(lat)[n // 2]:.0f} ms"
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="also rank named scenarios with JEV")
    args = parser.parse_args()
    warm_up()
    named = [evaluate(s) for s in named_scenarios()]
    grid = [evaluate(s) for s in grid_scenarios()]
    failed = [r for r in named + grid if r.failures]
    for r in failed[:40]:
        print(f"✗ {r.scenario.name}: {'; '.join(r.failures)}")
    fits = [f for f in (mood_fit(r) for r in grid) if f is not None]
    print(
        f"\n{len(named)} named + {len(grid)} grid scenarios | failures {len(failed)} | "
        f"mean mood fit (top 5) {sum(fits) / len(fits):.2f} | "
        f"p95 shortlist {sorted(r.ms for r in grid)[int(len(grid) * 0.95)]:.1f} ms"
    )
    if args.live:
        from dotenv import load_dotenv

        load_dotenv()
        asyncio.run(_live(named))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
