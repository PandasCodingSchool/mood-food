"""Brain backtest: predict each order from only the orders before it.

Synthetic users have context-dependent habits plus noise. For every order after
a warm-up, three predictors guess its cuisine / protein / form:
- brain:    Relations.predict(slot, daytype) on the user's earlier orders
- overall:  the same user's habits ignoring context (Relations.predict())
- popular:  the population's most common values (no personalisation)
and we report hit@1 / hit@3. The brain must beat both baselines.

    python -m evals.backtest
"""

from __future__ import annotations

import random
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.brain.relations import Relations
from app.history.normalise import IST

NOW = datetime(2026, 10, 8, 12, 0, tzinfo=IST)
WARMUP = 5
CUISINES = ["north_indian", "south_indian", "west_indian", "indo_chinese", "italian", "american", "mediterranean", "japanese"]
PROTEINS = ["chicken", "paneer", "veg", "mutton", "egg", "fish", "legumes"]
FORMS = ["curry_gravy", "rice_biryani", "bowl", "pizza", "burger_sandwich", "pasta_noodles", "breakfast", "grill_kebab_steak"]


@dataclass
class Habit:
    slot: str
    daytype: str
    cuisine: str
    protein: str
    form: str
    share: float      # how often this context follows the habit (rest is noise)


PERSONAS = [
    [Habit("lunch", "weekday", "mediterranean", "chicken", "bowl", 0.7), Habit("dinner", "weekend", "south_indian", "chicken", "rice_biryani", 0.65),
     Habit("dinner", "weekday", "north_indian", "paneer", "curry_gravy", 0.5)],
    [Habit("breakfast", "weekday", "west_indian", "veg", "breakfast", 0.7), Habit("dinner", "weekend", "italian", "veg", "pizza", 0.6),
     Habit("late_night", "weekend", "indo_chinese", "chicken", "pasta_noodles", 0.55)],
    [Habit("lunch", "weekday", "north_indian", "legumes", "curry_gravy", 0.6), Habit("dinner", "weekday", "american", "chicken", "burger_sandwich", 0.5),
     Habit("dinner", "weekend", "japanese", "fish", "bowl", 0.6)],
]


def synthetic_user(seed: int, n_orders: int = 40) -> list[dict]:
    rng = random.Random(seed)
    habits = PERSONAS[seed % len(PERSONAS)]
    orders = []
    for i in range(n_orders):
        h = rng.choice(habits)
        follow = rng.random() < h.share
        prof = {"cuisine": h.cuisine if follow else rng.choice(CUISINES), "protein": h.protein if follow else rng.choice(PROTEINS),
                "form": h.form if follow else rng.choice(FORMS), "spice": rng.random(), "heaviness": rng.random()}
        day = rng.choice(["saturday", "sunday"] if h.daytype == "weekend" else ["monday", "tuesday", "wednesday", "thursday", "friday"])
        when = NOW - timedelta(days=120 * (n_orders - i) / n_orders)
        orders.append({"order_id": f"{seed}-{i}", "ordered_at": when.isoformat(), "meal_slot": h.slot, "weekday": day,
                       "items": [{"name": f"{prof['cuisine']} {prof['form']}", "profile": prof}]})
    return orders


def run(n_users: int = 30) -> dict:
    users = [synthetic_user(s) for s in range(n_users)]
    popular = {f: [v for v, _ in Counter(o["items"][0]["profile"][f] for u in users for o in u).most_common(3)]
               for f in ("cuisine", "protein", "form")}
    hits = {m: {f: [0, 0] for f in popular} for m in ("brain", "overall", "popular")}   # [hit@1, hit@3]
    n = 0
    for orders in users:
        for t in range(WARMUP, len(orders)):
            target = orders[t]
            rel = Relations(orders[:t], datetime.fromisoformat(target["ordered_at"]))
            daytype = "weekend" if target["weekday"] in ("saturday", "sunday") else "weekday"
            preds = {"brain": rel.predict(target["meal_slot"], daytype)["distributions"], "overall": rel.predict()["distributions"]}
            n += 1
            for f in popular:
                truth = target["items"][0]["profile"][f]
                for m in ("brain", "overall"):
                    ranked = list(preds[m][f])
                    hits[m][f][0] += ranked[:1] == [truth]
                    hits[m][f][1] += truth in ranked[:3]
                hits["popular"][f][0] += popular[f][:1] == [truth]
                hits["popular"][f][1] += truth in popular[f]
    return {"predictions": n, **{m: {f: {"hit@1": round(h[0] / n, 3), "hit@3": round(h[1] / n, 3)} for f, h in per.items()}
                                for m, per in hits.items()}}


def main() -> int:
    r = run()
    print(f"{r['predictions']} predictions (each from earlier orders only)")
    for f in ("cuisine", "protein", "form"):
        print(f"  {f:8s} " + " | ".join(f"{m}: @1 {r[m][f]['hit@1']:.2f} @3 {r[m][f]['hit@3']:.2f}" for m in ("brain", "overall", "popular")))
    ok = all(r["brain"][f]["hit@1"] > r["overall"][f]["hit@1"] and r["brain"][f]["hit@1"] > r["popular"][f]["hit@1"] for f in ("cuisine", "protein", "form"))
    print("PASS: brain beats both baselines" if ok else "FAIL: brain does not beat the baselines")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
