"""The food graph: the dish catalog the intelligence reasons over, and how Swiggy items map onto it."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from lab import components as ui  # noqa: E402

st.set_page_config(page_title="Food graph · Intelligence Lab", page_icon="🗺️", layout="wide")
ui.context_sidebar()
st.title("Food graph")
st.caption("Every dish the intelligence can recommend, described the way it reasons: cuisine, diet, meals, price, "
           "protein, cooking method, region and a 10-dimension taste profile. Built from `scripts/catalog/*` by "
           "`scripts/build_catalog.py`. Live Swiggy menu items are mapped onto it and cached.")

summary = ui.call(ui.client().food_graph_summary)
if not summary:
    st.stop()
cov, n = summary["coverage"], summary["dishes"]
cache = summary["mapping_cache"]
a, b, c, d, e = st.columns(5)
a.metric("Dishes", n)
b.metric("Taste profiles", f"{cov['sensory_profile']}/{n}")
c.metric("Swiggy aliases", f"{cov['swiggy_aliases']}/{n}")
d.metric("Photos", f"{cov['image']}/{n}")
e.metric("Swiggy items mapped", f"{cache['mapped']}/{cache['items']}")

tab_cat, tab_map, tab_test = st.tabs(["Catalog", "Swiggy mapping cache", "Map menu items"])

with tab_cat:
    x, y, z = st.columns(3)
    with x:
        ui.bar_list(summary["by"]["cuisine"], "dishes")
    with y:
        ui.bar_list({k: v for k, v in summary["by"]["protein"].items()}, "dishes")
    with z:
        ui.bar_list(summary["by"]["meal"], "dishes")
        st.caption(f"Diet: {summary['by']['diet']}")

    @st.cache_data(ttl=600)
    def all_dishes() -> pd.DataFrame:
        return pd.DataFrame(ui.client().catalog(limit=1000, full=True)["dishes"])

    df = all_dishes()
    f1, f2, f3, f4 = st.columns([2, 2, 2, 2])
    q = f1.text_input("Search", "")
    cuisines = f2.multiselect("Cuisine", sorted(df["cuisine"].unique()))
    meal = f3.multiselect("Meal", ["breakfast", "lunch", "dinner", "late_night"])
    veg = f4.radio("Diet", ["all", "veg", "non-veg"], horizontal=True)
    view = df
    if q:
        view = view[view["name"].str.contains(q, case=False)]
    if cuisines:
        view = view[view["cuisine"].isin(cuisines)]
    if meal:
        view = view[view["meal_time"].map(lambda m: bool(set(m) & set(meal)))]
    if veg != "all":
        view = view[view["veg"] == (veg == "veg")]
    st.caption(f"{len(view)} of {len(df)} dishes · select a row for its full profile")
    table = view[["id", "name", "cuisine", "category", "price", "veg", "protein", "cooking_method", "region", "spice_level",
                  "meal_time", "mood_tags", "swiggy_aliases"]].copy()
    table["meal_time"] = table["meal_time"].map(", ".join)
    table["mood_tags"] = table["mood_tags"].map(", ".join)
    table["swiggy_aliases"] = table["swiggy_aliases"].map(lambda a: ", ".join(a) or "—")
    picked = st.dataframe(table, hide_index=True, width="stretch", height=380, on_select="rerun", selection_mode="single-row")
    rows = picked.selection.rows if picked and picked.selection else []
    if rows:
        dish = view.iloc[rows[0]]
        st.subheader(dish["name"])
        p1, p2 = st.columns([2, 3])
        with p1:
            if dish["image_url"]:
                st.image(dish["image_url"], width="stretch")
            st.markdown(f"**{dish['cuisine'].title()}** · {dish['category'].replace('_', ' ')} · ₹{dish['price']} · "
                        f"{'veg' if dish['veg'] else 'non-veg'} · spice {dish['spice_level']}")
            st.markdown(f"Moods: {', '.join(dish['mood_tags'])}  \nWeather: {', '.join(dish['weather_tags'])}  \n"
                        f"With: {', '.join(dish['social_context_tags']) or '—'}  \nMeals: {', '.join(dish['meal_time'])}")
            st.markdown(f"Swiggy aliases: {', '.join(dish['swiggy_aliases']) or '—'}"
                        + (f"  \nSwiggy search category: {dish['swiggy_search_category']}" if dish["swiggy_search_category"] else ""))
            st.caption(f"Allergens: {', '.join(dish['allergens']) or 'none'} · health {dish['health_score']}/10 · "
                       f"adventurousness {dish['adventurousness_score']}/10 · {dish['calories']} kcal")
        with p2:
            st.markdown("**Taste profile** (0–1)")
            ui.bar_list(dish["sensory"], "intensity", fmt=".2f")

with tab_map:
    st.caption("Swiggy menu item names the service has already resolved, so the next lookup is instant. Written by "
               "the Swiggy order-history import, the 'Map menu items' tab, and live matches the menu check had to verify "
               "(borderline items — exact matches aren't cached). Items with no dish are deliberate 'none of these' answers.")
    st.markdown(f"**{cache['items']} items cached** · {cache['mapped']} mapped to a dish · covering "
                f"{cache['dishes_covered']} dishes · by method: {cache['by_method'] or '—'}")
    if cache["recent"]:
        st.dataframe(pd.DataFrame(cache["recent"]), hide_index=True, width="stretch",
                     column_config={"confidence": st.column_config.ProgressColumn("confidence", min_value=0, max_value=1, format="%.2f")})
    else:
        st.info("Empty so far — it fills from order-history imports, borderline live matches, or the 'Map menu items' tab.")

with tab_test:
    st.caption("Paste Swiggy menu item names (one per line). Each is matched exactly, then against guarded "
               "candidates (same form, same protein), then by a JEV Choice with a 'none of these' option.")
    items = st.text_area("Menu items", "Dal Makhani (Half)\nChicken Keema Pav\nPaneer Butter Masala [Serves 1]\nHakka Noodles Veg\nDouble Ka Meetha",
                         height=160)
    veg_items = st.radio("Items are", ["unknown", "veg", "non-veg"], horizontal=True)
    if st.button("Map", type="primary"):
        names = [x.strip() for x in items.splitlines() if x.strip()]
        st.session_state.fg = ui.call(ui.client().map_items, names, {"unknown": None, "veg": True, "non-veg": False}[veg_items])
    res = st.session_state.get("fg")
    if res:
        st.dataframe(pd.DataFrame(res["result"]), hide_index=True, width="stretch",
                     column_config={"confidence": st.column_config.ProgressColumn("confidence", min_value=0, max_value=1, format="%.2f")})
        ev = (ui.events_of(res["trace"], "food_graph.map") or [None])[0]
        if ev:
            st.caption(f"Accepted at JEV probability ≥ {ev['threshold']} · JEV {'available' if ev['jev_available'] else 'not configured'}")
            for it in ev["items"]:
                with st.expander(f"{it['item']} → {it['dish'] or '—'} ({it['method']})"):
                    st.caption(f"normalised: `{it['normalised']}`")
                    if it["candidates"]:
                        st.markdown("Candidates that passed the guards: " + ", ".join(it["candidates"]))
                    if it["jev_probabilities"]:
                        ui.prob_bars(it["jev_probabilities"], highlight=it["dish"] or "none_of_these", title="JEV: P(same dish)")
        ui.jev_calls(res["trace"])
