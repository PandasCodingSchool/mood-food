"""Did suggestions work? Joins "Suggested for you" runs with the orders that followed.

For each sos_home run: an order within WINDOW of the suggestion counts as
*followed*; *exact* when an ordered item is a suggested dish, *similar* when it
shares a suggested dish's cuisine. The stretch pick is *accepted* when ordered
exactly or matched on cuisine + protein.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from app.brain import orders as brain_orders
from app.data.dishes import DISHES_BY_ID
from app.history.profile import CATALOG_CUISINE, PROTEINS
from app.learning import store

WINDOW = timedelta(minutes=90)


def _ts(value: Any) -> datetime:
    t = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)   # SQLite CURRENT_TIMESTAMP is UTC


def _item_cuisine_protein(item: dict) -> tuple:
    d = DISHES_BY_ID.get(item.get("dish_id") or "")
    if d:
        return d.cuisine, d.protein
    p = item.get("profile") or {}
    return CATALOG_CUISINE.get(p.get("cuisine")), p.get("protein")


def compute(user_id: str) -> dict[str, Any]:
    rows = store.fetchall(
        "SELECT request_id, created_at, selected_json, shadow_json FROM recommendation_runs "
        "WHERE user_id = ? AND mode = 'sos_home' ORDER BY created_at", (user_id,))
    orders = [(_ts(o["ordered_at"]), o) for o in brain_orders.load(user_id) if o.get("ordered_at")]
    out_rows = []
    for r in rows:
        at = _ts(r["created_at"])
        selected = json.loads(r["selected_json"] or "[]")
        extra = (json.loads(r["shadow_json"]) if r["shadow_json"] else {}).get("suggest", {})
        stretch = extra.get("stretch")
        after = [o for t, o in orders if at <= t <= at + WINDOW]
        items = [i for o in after for i in o.get("items") or []]
        sel_cuisines = {DISHES_BY_ID[d].cuisine for d in selected if d in DISHES_BY_ID}
        exact = any(i.get("dish_id") in selected for i in items)
        similar = exact or any(_item_cuisine_protein(i)[0] in sel_cuisines for i in items)
        stretch_ok = bool(stretch) and any(
            i.get("dish_id") == stretch or _item_cuisine_protein(i) == (DISHES_BY_ID[stretch].cuisine, DISHES_BY_ID[stretch].protein)
            for i in items if stretch in DISHES_BY_ID)
        out_rows.append({"request_id": r["request_id"], "at": at.isoformat(), "slot": extra.get("slot"), "followed": bool(after),
                         "exact": exact, "similar": similar, "stretch": stretch, "stretch_accepted": stretch_ok})
    n = len(out_rows)
    rate = lambda k: round(sum(1 for x in out_rows if x[k]) / n, 3) if n else None  # noqa: E731
    shown = [x for x in out_rows if x["stretch"]]
    return {
        "suggestions": n, "followed_rate": rate("followed"), "exact_rate": rate("exact"), "similar_rate": rate("similar"),
        "stretch_shown": len(shown),
        "stretch_accept_rate": round(sum(x["stretch_accepted"] for x in shown) / len(shown), 3) if shown else None,
        "window_minutes": int(WINDOW.total_seconds() // 60), "recent": out_rows[-20:],
    }
