"""Preference brain: the Swiggy order history it learns from (Phase 1), and what it knows (Phase 2+)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from lab import components as ui  # noqa: E402

st.set_page_config(page_title="Brain · Intelligence Lab", page_icon="🧠", layout="wide")
ui.context_sidebar()
st.title("Preference brain")
st.caption("Built from what you actually order on Swiggy, plus games and check-ins. Swiggy shows only your most "
           "recent orders, so history is collected a little at a time; each import fetches only orders not seen before.")



def _food(res):
    stats, orders = res["result"]["stats"], res["result"]["orders"]
    a, b, c, d, e = st.columns(5)
    a.metric("Orders Swiggy shows", f"{stats['returned']}" + (f" of {stats['reported_total']}" if stats["reported_total"] else ""))
    b.metric("New this import", stats["new"])
    c.metric("Items", stats["items"])
    d.metric("Mapped to catalog", f"{stats['items_mapped']}/{stats['items']}")
    e.metric("Span", f"{stats['oldest'][5:10]} → {stats['newest'][5:10]}" if stats["oldest"] else "—",
             stats["oldest"][:4] if stats["oldest"] else None, delta_color="off")

    rows = [{
        "when": (o["ordered_at"] or "")[:16].replace("T", " "), "slot": o["meal_slot"], "day": o["weekday"],
        "restaurant": o["restaurant_name"], "item": i["name"], "qty": i["quantity"], "₹": i["price"],
        "veg": i["veg"], "catalog dish": i["dish_name"] or "—",
        "cuisine": (i["profile"] or {}).get("cuisine"), "protein": (i["profile"] or {}).get("protein"),
        "form": (i["profile"] or {}).get("form"), "spice": (i["profile"] or {}).get("spice"),
        "heaviness": (i["profile"] or {}).get("heaviness"), "profile by": (i["profile"] or {}).get("method"),
        "photo": i["image_url"],
    } for o in orders for i in o["items"]]
    st.subheader("Orders, parsed and profiled")
    st.caption("Profiles say what an item *is* — even when it isn't a catalog dish (most real orders aren't). "
               "Cuisine, protein and form are JEV choices; spice and heaviness are JEV scores (0–1).")
    if rows:
        st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch",
                     column_config={"photo": st.column_config.ImageColumn("photo"),
                                    "spice": st.column_config.ProgressColumn("spice", min_value=0, max_value=1, format="%.2f"),
                                    "heaviness": st.column_config.ProgressColumn("heaviness", min_value=0, max_value=1, format="%.2f")})
        df = pd.DataFrame(rows)
        x, y, z = st.columns(3)
        with x:
            ui.bar_list(df["slot"].value_counts().to_dict(), "items")
        with y:
            ui.bar_list(df["cuisine"].value_counts().to_dict(), "items")
        with z:
            ui.bar_list(df["protein"].value_counts().to_dict(), "items")
    else:
        st.success("No new orders since the last import.")
    ui.jev_calls(res["trace"])
    ui.raw_events(res["trace"])


def _groceries(res):
    r = res["result"]
    stats, facts = r["stats"], r["facts"]
    a, b, c, d = st.columns(4)
    a.metric("Instamart orders", stats["orders_returned"])
    b.metric("Go-to items", stats["go_to_items"])
    c.metric("Kitchen", facts["cooking_label"] or "too early",
             f"index {facts['cooking_index']:.2f}" if facts["cooking_index"] is not None else
             f"{facts['evidence']['food_units']:.0f}/{facts['evidence']['cooking_index_needs']:.0f} food units", delta_color="off")
    d.metric("Household", ", ".join(facts["household"]) or "—")
    if facts["facts"]:
        st.markdown("**What we can say**  \n" + "  \n".join(f"• {f['text']} `{f['id']}`" for f in facts["facts"]))
    items = [{"source": "order", **i} for o in r["orders"] for i in o["items"]] + [{"source": "go-to", **i} for i in r["go_to"]]
    if items:
        st.subheader("Items, profiled")
        st.caption("Category, cooking role and cuisine are JEV choices; healthiness is a JEV score. "
                   "Cooking role drives the kitchen index (scratch ingredients vs ready-to-eat).")
        st.dataframe(pd.DataFrame([{
            "source": i["source"], "item": i["name"], "brand": i.get("brand"), "pack": i.get("pack"), "qty": i.get("quantity"),
            "₹": i.get("price"), "category": (i.get("profile") or {}).get("category"), "cooking role": (i.get("profile") or {}).get("cooking_role"),
            "cuisine": (i.get("profile") or {}).get("cuisine_hint"), "healthiness": (i.get("profile") or {}).get("healthiness"),
            "photo": i.get("image_url")} for i in items]), hide_index=True, width="stretch",
            column_config={"photo": st.column_config.ImageColumn("photo"),
                           "healthiness": st.column_config.ProgressColumn("healthiness", min_value=0, max_value=1, format="%.2f")})
    x, y = st.columns(2)
    with x:
        st.markdown("**Category mix** (share of what's bought)")
        if facts["category_mix"]:
            ui.bar_list(facts["category_mix"], "share", fmt=".0%")
    with y:
        st.markdown("**Most consumed**")
        if facts["top_items"]:
            ui.bar_list({t["name"][:40]: t["score"] for t in facts["top_items"]}, "score (purchases, units, go-to rank)", fmt=".1f")
    t1, t2, t3 = st.tabs(["Restock rhythm", "Likely in the kitchen", "Bought together"])
    with t1:
        if facts["restock"]:
            st.dataframe(pd.DataFrame(facts["restock"]), hide_index=True, width="stretch")
        else:
            st.caption("Needs the same item in at least two orders.")
    with t2:
        if facts["likely_pantry"]:
            st.dataframe(pd.DataFrame(facts["likely_pantry"]), hide_index=True, width="stretch",
                         column_config={"likely_left": st.column_config.ProgressColumn("likely left", min_value=0, max_value=1, format="%.2f")})
        else:
            st.caption("Estimated from purchase dates and typical shelf life; needs dated orders.")
    with t3:
        if facts["co_purchase"]:
            ui.pair_heatmap(facts["co_purchase"])
        else:
            st.caption("Needs orders with several food items.")
    ui.jev_calls(res["trace"])


def _house(h: dict):
    if not h:
        return
    info = h.get("house_info")
    if h["status"] == "sorted" and info:
        st.success(f"{info['crest']} **{info['name']}** — {info['motto']} {info['about']}" + (f"  \n_since {h['since'][:10]}_" if h.get("since") else ""))
    else:
        g = h["gate"]
        st.info(f"Not sorted yet — leaning **{h['leaning']}** (lead {h['membership'][h['leaning']]:.0%}, margin {h['margin']:.0%}). "
                f"Evidence: {g['orders']} orders, {g['games']} games · gate {'met' if g['ok'] else 'not met'} ({g['rule']}); "
                "sorting also needs a leader ≥ 40% that's 10 points clear.")
    x, y = st.columns(2)
    with x:
        st.markdown("**House membership**")
        ui.prob_bars(h["membership"], highlight=h.get("house") or h["leaning"], title="P(house)")
    with y:
        st.markdown("**Traits** (rules vs JEV → blended)")
        t = h["traits"]
        st.dataframe(pd.DataFrame([{"house": k, "rules": t["deterministic"][k], "JEV": (t["jev"] or {}).get(k), "blended": t["blended"][k]}
                                   for k in t["blended"]]), hide_index=True, width="stretch",
                     column_config={c: st.column_config.ProgressColumn(c, min_value=0, max_value=1, format="%.2f") for c in ("rules", "JEV", "blended")})
    if h.get("challenger"):
        st.caption(f"Challenger: {h['challenger']['house']} leading on {h['challenger']['count']} evidence update(s) — 2 needed to shift.")
    if h.get("journey"):
        st.markdown("**House journey**")
        st.dataframe(pd.DataFrame([{"when": e["at"][:16], "event": e["type"], "house": e["house"], "from": e.get("from"),
                                    "because": "; ".join(e.get("because", []))} for e in h["journey"]]), hide_index=True, width="stretch")


def _brain(data: dict, ctx_user: str):
    food, groc = data["food"], data["groceries"]
    _house(data.get("house"))
    cards = (data.get("insights") or {}).get("cards", [])
    if cards:
        cols = st.columns(len(cards))
        for col, c in zip(cols, cards):
            with col, st.container(border=True):
                st.markdown(f"**{c['title']}**")
                st.write(c["body"])
                if c.get("fact_ids"):
                    st.caption(" ".join(f"`{i}`" for i in c["fact_ids"]))
        st.caption(f"Insight cards: {data['insights']['method']}" + (f" · {len(data['insights']['rejected'])} rejected by the validator" if data["insights"].get("rejected") else ""))
    st.markdown(f"**Brain for `{ctx_user}`** — {food.get('orders', 0)} food orders, {groc.get('orders', 0)} grocery orders, "
                f"{len(groc.get('top_items', []))} grocery items tracked")
    if data["facts"]:
        st.markdown("**What it knows**  \n" + "  \n".join(f"• {f['text']} `{f['id']}`" for f in data["facts"]))
    if not food.get("orders"):
        st.info("No food orders yet for this user.")
        return
    a, b, c, d = st.columns(4)
    a.metric("Evidence (time-decayed)", f"{food['evidence']:.1f}", f"{food['orders']} orders", delta_color="off")
    b.metric("Orders / week", food["orders_per_week"])
    c.metric("Reorder rate", f"{food['reorder_rate']:.0%}" if food["reorder_rate"] is not None else "—")
    d.metric("New-dish rate", f"{food['exploration_rate']:.0%}" if food["exploration_rate"] is not None else "—")
    x, y, z = st.columns(3)
    with x:
        st.markdown("**Cuisines**")
        ui.bar_list(food["cuisine_mix"], "share", fmt=".0%")
    with y:
        st.markdown("**Proteins**")
        ui.bar_list(food["protein_mix"], "share", fmt=".0%")
    with z:
        st.markdown("**When**")
        ui.bar_list({**food["slot_mix"], **{f"({k})": v for k, v in food["daytype_mix"].items()}}, "share", fmt=".0%")
    if food.get("occasion_mix"):
        st.markdown("**Occasions** (why they order — JEV, rules as fallback)")
        ui.bar_list(food["occasion_mix"], "share", fmt=".0%")
    st.markdown("**Favourites**")
    st.dataframe(pd.DataFrame(food["favourites"]), hide_index=True, width="stretch")
    st.markdown("**Context → choice links** (where a context differs from the user's usual)")
    if data["relations"]:
        st.dataframe(pd.DataFrame(data["relations"])[["text", "context", "when", "feature", "value", "p", "lift", "n"]],
                     hide_index=True, width="stretch")
    else:
        st.caption("None yet: the user's orders don't differ by context enough (or come from one context only).")
    now = data.get("now")
    if now:
        st.markdown(f"**Prediction for {now['daytype']} {now['slot'].replace('_', ' ')}** · confidence {now['confidence']:.2f}")
        cols = st.columns(3)
        for col, feat in zip(cols, ("cuisine", "protein", "form")):
            with col:
                ui.prob_bars(dict(list(now["distributions"][feat].items())[:6]), title=f"P({feat})")


tab_brain, tab_food, tab_groc = st.tabs(["Brain", "Food orders (Swiggy)", "Groceries (Instamart)"])
with tab_brain:
    user = st.session_state.get("ctx_user") or "lab-user"
    st.caption("Builds the brain for the sidebar's user from the Swiggy + Instamart history (the same fold the API runs), "
               "then shows what it knows. Recommend and Games use it for that user.")
    b1, b2, b3 = st.columns([2, 1, 1])
    slot = b2.selectbox("Slot", ["lunch", "dinner", "breakfast", "late_night"], key="brain_slot")
    daytype = b3.selectbox("Day", ["weekday", "weekend"], key="brain_daytype")
    if b1.button("Build my brain from Swiggy + Instamart", type="primary"):
        st.session_state.brain = ui.call(ui.client().brain_build, user, slot, daytype)
    elif "brain" in st.session_state and st.session_state.brain:
        fresh = ui.call(ui.client().brain, user, slot, daytype)
        if fresh:
            st.session_state.brain = {**st.session_state.brain, "result": {**st.session_state.brain["result"], **fresh["result"]}}
    br = st.session_state.get("brain")
    if br:
        _brain(br["result"], user)
    else:
        st.info("Press Build to fold your history into the brain.")
with tab_food:
    if st.button("Import my Swiggy history", type="primary",
                 help="Read-only: get_addresses, get_food_orders and get_food_order_details. No address, phone or payment data is kept."):
        st.session_state.history = ui.call(ui.client().history_import)

    res = st.session_state.get("history")
    if not res:
        st.info("Press Import to pull, parse, map and profile your recent orders.")
    else:
        _food(res)

with tab_groc:
    st.caption("Instamart is a separate stream: what the household buys and how it cooks — the base for cook-at-home help, "
               "Pantry mode and restock nudges. Read-only: get_orders and your_go_to_items.")
    if st.button("Import my Instamart groceries", type="primary"):
        st.session_state.groceries = ui.call(ui.client().groceries_import)
    g = st.session_state.get("groceries")
    if g:
        _groceries(g)
    else:
        st.info("Press Import to pull and profile Instamart orders and your go-to items.")
