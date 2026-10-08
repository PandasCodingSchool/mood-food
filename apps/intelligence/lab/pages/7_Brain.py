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


tab_food, tab_groc = st.tabs(["Food orders (Swiggy)", "Groceries (Instamart)"])
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
