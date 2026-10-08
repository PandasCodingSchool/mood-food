"""Suggested for you: what the home screen would show right now, and why."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from lab import components as ui  # noqa: E402

st.set_page_config(page_title="Suggested · Intelligence Lab", page_icon="✨", layout="wide")
ctx = ui.context_sidebar()
st.title("Suggested for you")
st.caption("The home-screen suggestion before the user asks: the brain predicts what they want now (meal slot, weekday/weekend, "
           "their usual occasion and today's state), ranks with JEV, and adds exactly one stretch pick. Cached per evidence "
           "for 30 minutes. Build the brain first (Brain page) for the sidebar user.")

user = ctx["user_id"] or "lab-user"
with st.container(border=True):
    a, b, c, d, e = st.columns([1, 1, 1, 1, 1])
    slot = a.selectbox("Slot", ["now", "breakfast", "lunch", "dinner", "late_night"])
    day = b.selectbox("Day", ["today", "weekday", "weekend"])
    weather = c.selectbox("Weather", ["(unknown)", "rainy", "hot", "cold", "sunny"])
    refresh = d.toggle("Bypass cache", False)
    e.write("")
    if e.button("✨ Suggest", type="primary", width="stretch"):
        st.session_state.sos = ui.call(ui.client().suggest, user, slot=None if slot == "now" else slot,
                                       daytype=None if day == "today" else day,
                                       weather=None if weather == "(unknown)" else weather,
                                       swiggy_address_id=ctx["address"], refresh=refresh)

res = st.session_state.get("sos")
if not res:
    st.info(f"Press Suggest to see what `{user}` would get on the home screen.")
    st.stop()

r = res["result"]
m1, m2, m3, m4, m5 = st.columns(5)
m1.markdown(f"**When**  \n{r['daytype']} {r['slot'].replace('_', ' ')}")
m2.markdown(f"**Usual occasion**  \n{(r['occasion'] or '—').replace('_', ' ')}  \n"
            f"`mood: {r['mood_used'] or 'none (no check-in)'} · situation: {r.get('situation') or '—'}`")
m3.markdown(f"**Brain confidence**  \n{(r['prediction']['confidence'] or 0):.2f}  \n`{r['evidence']['orders']} orders`")
m4.markdown(f"**JEV commit**  \n{r['commit']['confidence']:.2f}" if r.get("commit") else "**JEV commit**  \n—")
with m5:
    st.markdown("**Cache**  \n" + ("♻️ reused (no JEV calls)" if r["cached"] else "fresh"))
ui.status_badge(r["live_status"])

matches = r.get("swiggy_matches") or {}
for col, rec in zip(st.columns(len(r["recommendations"])), r["recommendations"]):
    why = r["reasons"].get(rec["dish"]["id"], {})
    with col:
        if why.get("kind") == "stretch":
            st.markdown("🧭 **Something new**")
        else:
            st.markdown({"favourite": "❤️ **Favourite**", "usual": "🔁 **Your usual**"}.get(why.get("kind"), "✨ **For now**"))
        st.caption(why.get("text", ""))
        ui.rec_card(rec, matches.get(rec["dish"]["id"]))

st.subheader("What the brain predicted for this moment")
top = r["prediction"]["top"]
if top:
    st.markdown("  \n".join(f"**{f}**: {', '.join(v.replace('_', ' ') for v in vals)}" for f, vals in top.items()))
else:
    st.caption("No order history for this user — suggestions fall back to context and rules.")

sm = r.get("success_metrics") or {}
st.subheader("Did suggestions work?")
st.caption(f"Each suggestion is logged; an order within {sm.get('window_minutes', 90)} minutes counts as followed "
           "(exact = a suggested dish, similar = same cuisine); the stretch is accepted when ordered or matched on cuisine + protein.")
k1, k2, k3, k4 = st.columns(4)
fmt = lambda v: f"{v:.0%}" if v is not None else "—"  # noqa: E731
k1.metric("Suggestions logged", sm.get("suggestions", 0))
k2.metric("Followed by an order", fmt(sm.get("followed_rate")))
k3.metric("Exact dish ordered", fmt(sm.get("exact_rate")))
k4.metric("Stretch accepted", fmt(sm.get("stretch_accept_rate")), f"of {sm.get('stretch_shown', 0)} shown", delta_color="off")
if sm.get("recent"):
    st.dataframe(pd.DataFrame(sm["recent"]), hide_index=True, width="stretch")

t1, t2, t3 = st.tabs(["Ranking", "Swiggy matching", "Events"])
with t1:
    ranks = ui.events_of(res["trace"], "engine.rank")
    if ranks:
        df = pd.DataFrame(ranks[0]["rows"])
        st.dataframe(df[["final_rank", "name", "cuisine", "rule_norm", "jev_fit", "blended"]].sort_values("final_rank").head(15),
                     hide_index=True, width="stretch")
    ui.jev_calls(res["trace"])
with t2:
    ui.swiggy_section(res["trace"])
with t3:
    ui.raw_events(res["trace"])
