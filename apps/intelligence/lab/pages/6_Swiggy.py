"""Swiggy connection: token status, saved addresses, read-only mode."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from lab import components as ui  # noqa: E402

st.set_page_config(page_title="Swiggy · Intelligence Lab", page_icon="🛵", layout="wide")
ctx = ui.context_sidebar()
st.title("Swiggy")

health = ui.call(ui.client().health)
if health:
    sw = health["swiggy"]
    if sw["has_token"] and not sw["expired"]:
        st.success(f"✅ Token present · about {(sw['seconds_left'] or 0) / 3600:.0f} hours left")
    elif sw["has_token"]:
        st.error("⛔ Token expired — mint a new one: `.venv/bin/python -m scripts.swiggy_auth --save`")
    else:
        st.info("⚪ No Swiggy token on the service. Mint one: `.venv/bin/python -m scripts.swiggy_auth --save`")

st.markdown(f"**Delivering to:** `{ctx['address'] or 'nowhere — cards stay offline'}` (choose in the sidebar)")
addresses = st.session_state.get("swiggy_addresses")
if addresses:
    st.dataframe(pd.DataFrame(addresses), hide_index=True, width="stretch")
st.markdown("""
**How live cards work.** When a game ends, or Recommend runs, with an address chosen, the service walks
the ranking in order. For each dish it searches Swiggy near that address and accepts an item only if it
really is that dish: exact names first, then a JEV check for borderline matches. It stops once it has
enough live cards. The *Swiggy matching* tab on the decision shows every search, call and verdict.

**Read-only.** While the lab is on, the service refuses every Swiggy tool except `get_addresses`,
`search_restaurants`, `search_menu` and `get_restaurant_menu`. Nothing can touch your cart or place an order.
""")
