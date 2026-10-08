"""Shared lab UI: context builder, charts and trace viewers.

Charts follow one palette (validated categorical slots, blue<->red diverging
with a gray midpoint, reserved status colours always paired with a label),
thin marks, recessive axes and hover tooltips on every mark.
"""

from __future__ import annotations

import json
from typing import Any, Optional

import altair as alt
import pandas as pd
import streamlit as st

from lab.client import LabClient, LabError

# --- palette ------------------------------------------------------------------------

_LIGHT = {"blue": "#2a78d6", "orange": "#eb6834", "red": "#e34948", "mid": "#f0efec",
          "ink2": "#52514e", "muted": "#898781", "grid": "#e1e0d9", "axis": "#c3c2b7"}
_DARK = {"blue": "#3987e5", "orange": "#d95926", "red": "#e66767", "mid": "#383835",
         "ink2": "#c3c2b7", "muted": "#898781", "grid": "#2c2c2a", "axis": "#383835"}
STATUS = {"live": ("#0ca30c", "✅", "Live"), "partial": ("#fab219", "⚠️", "Partial"),
          "offline": ("#898781", "⚪", "Offline")}


def colors() -> dict[str, str]:
    try:
        return _DARK if st.context.theme.type == "dark" else _LIGHT
    except Exception:  # noqa: BLE001 — older Streamlit / no theme info
        return _LIGHT


def _style(chart: alt.Chart, height: int) -> alt.Chart:
    c = colors()
    return (chart.properties(height=height, background="transparent")
            .configure_view(strokeWidth=0)
            .configure_axis(labelColor=c["ink2"], titleColor=c["muted"], gridColor=c["grid"], domainColor=c["axis"],
                            tickColor=c["axis"], labelFontSize=11, titleFontSize=11, titleFontWeight="normal", labelLimit=220)
            .configure_legend(labelColor=c["ink2"], titleColor=c["muted"], orient="top", labelFontSize=11, titleFontSize=11)
            .configure_text(color=c["ink2"]))


def client() -> LabClient:
    if "lab_client" not in st.session_state:
        st.session_state.lab_client = LabClient()
    return st.session_state.lab_client


def call(fn, *args, **kwargs) -> Optional[Any]:
    """Run a lab API call; show the error instead of crashing the page."""
    try:
        return fn(*args, **kwargs)
    except LabError as exc:
        st.error(str(exc))
        return None


# --- context builder (shared by every page, kept in session state) ---------------------

MOODS = ["tired", "stressed", "happy", "sad", "anxious", "celebratory", "romantic", "comfort", "relaxed",
         "energetic", "nostalgic", "lonely", "bored", "adventurous", "sick"]
CRAVINGS = ["crunchy", "creamy", "spicy", "brothy", "fresh", "cheesy", "sweet", "tangy", "smoky", "melty"]
DIETS = ["vegetarian", "vegan", "eggetarian", "jain", "gluten_free", "dairy_free"]
ALLERGIES = ["nuts", "dairy", "gluten", "shellfish", "eggs"]
CUISINES = ["north indian", "south indian", "chinese", "italian", "mughlai", "street food", "continental",
            "bengali", "punjabi", "thai", "mexican", "japanese", "korean", "hyderabadi", "goan"]


def context_sidebar() -> dict[str, Any]:
    """The person + situation every lab run uses. Returns user_context, user_id, address."""
    s = st.sidebar
    s.header("Context")
    mood = s.selectbox("Mood", MOODS, key="ctx_mood")
    energy = s.slider("Energy", 1, 10, 3, key="ctx_energy")
    meal = s.selectbox("Meal", ["dinner", "lunch", "breakfast", "late_night"], key="ctx_meal")
    weather = s.selectbox("Weather", ["rainy", "cold", "hot", "sunny", "any"], key="ctx_weather")
    social = s.selectbox("With", ["(not set)", "solo", "date", "friends", "family"], key="ctx_social")
    delivery = s.toggle("Delivery", True, key="ctx_delivery")
    budget = s.number_input("Budget max ₹ (0 = none)", 0, 5000, 0, step=50, key="ctx_budget")
    with s.expander("Diet, cuisines, cravings"):
        diet = st.multiselect("Diet", DIETS, key="ctx_diet")
        allergies = st.multiselect("Allergies", ALLERGIES, key="ctx_allergies")
        cuisines = st.multiselect("Favourite cuisines", CUISINES, key="ctx_cuisines")
        spice = st.selectbox("Spice", ["(not set)", "mild", "medium", "hot", "very_hot"], key="ctx_spice")
        cravings = st.multiselect("Cravings already known", CRAVINGS, key="ctx_cravings")
    with s.expander("User", expanded=False):
        user_id = st.text_input("User ID (blank = anonymous)", "lab-user", key="ctx_user")
    address = address_picker(s)

    situational: dict[str, Any] = {"time_of_day": meal, "weather": weather, "delivery_preferred": delivery}
    if budget:
        situational["budget"] = {"max": float(budget)}
    prefs: dict[str, Any] = {"dietary_restrictions": diet, "allergies": allergies, "cuisine_types": cuisines}
    if spice != "(not set)":
        prefs["spice_tolerance"] = spice
    ctx: dict[str, Any] = {"mood": {"primary": mood, "energy_level": energy}, "situational": situational, "preferences": prefs}
    if social != "(not set)":
        ctx["mood"]["social_context"] = social
    if cravings:
        ctx["game_data"] = {"type": "lab", "craving_tags": cravings}
    return {"user_context": ctx, "user_id": user_id.strip() or None, "address": address}


OFFLINE = "Offline (catalog placeholders)"


def load_addresses() -> None:
    res = call(client().swiggy_addresses)
    if res is not None:
        st.session_state.swiggy_addresses = res["result"]["addresses"]
        st.session_state.swiggy_read_only = res["result"]["read_only"]


def address_picker(s) -> Optional[str]:
    """Pick one of the Swiggy account's saved addresses; cards go live for it."""
    s.subheader("Swiggy")
    addresses = st.session_state.get("swiggy_addresses")
    if addresses is None:
        s.button("Load my Swiggy addresses", on_click=load_addresses, width="stretch",
                 help="Reads the saved addresses of the token on the service (get_addresses, read-only).")
        s.caption("Until an address is chosen, cards are catalog placeholders.")
        return None
    labels = {f"{a['label']} · {a['line'][:48]}": a["id"] for a in addresses}
    choice = s.selectbox("Deliver to", [OFFLINE, *labels], key="ctx_address_pick",
                         help="Games and Recommend match their picks to real Swiggy items near this address.")
    if not addresses:
        s.caption("No saved addresses on this Swiggy account.")
    if st.session_state.get("swiggy_read_only"):
        s.caption("🔒 Read-only: cart, coupon, order and payment tools are blocked.")
    s.button("Reload addresses", on_click=load_addresses)
    return labels.get(choice)


# --- charts --------------------------------------------------------------------------

def posterior_chart(rows: list[dict], thresholds: dict[str, float], top: int = 12, height: int = 300) -> None:
    """P(each dish is tonight's pick): bars now, ticks before this answer, game thresholds as rules."""
    c = colors()
    df = pd.DataFrame(rows[:top])
    order = list(df["name"])
    tip = [alt.Tooltip("name:N", title="Dish"), alt.Tooltip("p:Q", title="P now", format=".3f")]
    if "p_before" in df:
        tip += [alt.Tooltip("p_before:Q", title="P before", format=".3f"), alt.Tooltip("d_logit:Q", title="Δ logit", format="+.2f")]
    y = alt.Y("name:N", sort=order, title=None)
    bars = alt.Chart(df).mark_bar(cornerRadiusEnd=4, height=12, color=c["blue"]).encode(
        x=alt.X("p:Q", title="probability", scale=alt.Scale(domain=[0, max(0.6, float(df["p"].max()) + 0.05)])), y=y, tooltip=tip)
    layers = [bars]
    if "p_before" in df:
        layers.append(alt.Chart(df).mark_tick(color=c["muted"], thickness=2, size=14).encode(x="p_before:Q", y=y, tooltip=tip))
    rules = pd.DataFrame([{"x": thresholds["stop_prob"], "label": f"stop {thresholds['stop_prob']}"},
                          {"x": thresholds["jev_check_from"], "label": f"JEV check {thresholds['jev_check_from']}"}])
    layers.append(alt.Chart(rules).mark_rule(strokeDash=[4, 3], color=c["muted"]).encode(x="x:Q"))
    layers.append(alt.Chart(rules).mark_text(align="left", dx=3, dy=-6, fontSize=10, color=c["muted"]).encode(
        x="x:Q", y=alt.value(0), text="label:N"))
    st.altair_chart(_style(alt.layer(*layers), height), width="stretch", theme=None)
    if "p_before" in df:
        st.caption("Bars: probability now · grey tick: before this answer · dashed: game thresholds")


def movers_chart(rows: list[dict], n: int = 8, height: int = 220) -> None:
    """Which dishes this answer pushed up or down (change in logit)."""
    c = colors()
    df = pd.DataFrame(rows)
    if "d_logit" not in df:
        return
    df = df.reindex(df["d_logit"].abs().sort_values(ascending=False).index).head(n)
    df["direction"] = df["d_logit"].map(lambda v: "pushed up" if v >= 0 else "pushed down")
    chart = alt.Chart(df).mark_bar(cornerRadiusEnd=4, height=12).encode(
        x=alt.X("d_logit:Q", title="change in logit"),
        y=alt.Y("name:N", sort=list(df["name"]), title=None),
        color=alt.Color("direction:N", scale=alt.Scale(domain=["pushed up", "pushed down"], range=[c["blue"], c["red"]]),
                        legend=alt.Legend(title=None)),
        tooltip=[alt.Tooltip("name:N", title="Dish"), alt.Tooltip("d_logit:Q", title="Δ logit", format="+.2f"),
                 alt.Tooltip("p:Q", title="P now", format=".3f")])
    st.altair_chart(_style(chart, height), width="stretch", theme=None)


def question_scores_chart(rows: list[dict], chosen: Optional[str], height: int = 260) -> None:
    """Information gain of every question the engine could ask; the chosen one is highlighted."""
    if not rows:
        st.caption("No further questions (the game ended).")
        return
    c = colors()
    df = pd.DataFrame(rows)
    df["pick"] = df["key"].map(lambda k: "asked next" if k == chosen else "other")
    df["answers"] = df["answer_probs"].map(lambda d: ", ".join(f"{a} {p:.0%}" for a, p in d.items()))
    chart = alt.Chart(df).mark_bar(cornerRadiusEnd=4, height=12).encode(
        x=alt.X("info_gain:Q", title="expected information gain (nats)"),
        y=alt.Y("label:N", sort=list(df["label"]), title=None),
        color=alt.Color("pick:N", scale=alt.Scale(domain=["asked next", "other"], range=[c["orange"], c["blue"]]),
                        legend=alt.Legend(title=None)),
        tooltip=[alt.Tooltip("label:N", title="Question"), alt.Tooltip("info_gain:Q", title="Info gain", format=".4f"),
                 alt.Tooltip("expected_entropy:Q", title="Expected entropy after", format=".4f"),
                 alt.Tooltip("answers:N", title="Predicted answers")])
    st.altair_chart(_style(chart, height), width="stretch", theme=None)


def trend_charts(points: list[dict], thresholds: dict[str, float]) -> None:
    """Leader probability and uncertainty (entropy) across steps — two charts, one axis each."""
    if len(points) < 2:
        return
    c = colors()
    df = pd.DataFrame(points)
    a, b = st.columns(2)
    with a:
        line = alt.Chart(df).mark_line(strokeWidth=2, color=c["blue"], point=alt.OverlayMarkDef(size=60, color=c["blue"])).encode(
            x=alt.X("step:O", title="step"), y=alt.Y("leader_p:Q", title="leader probability", scale=alt.Scale(domain=[0, 1])),
            tooltip=[alt.Tooltip("step:O"), alt.Tooltip("leader:N", title="Leader"), alt.Tooltip("leader_p:Q", format=".3f", title="P")])
        rule = alt.Chart(pd.DataFrame([{"y": thresholds["stop_prob"]}])).mark_rule(strokeDash=[4, 3], color=c["muted"]).encode(y="y:Q")
        st.altair_chart(_style(alt.layer(line, rule), 180), width="stretch", theme=None)
    with b:
        line = alt.Chart(df).mark_line(strokeWidth=2, color=c["blue"], point=alt.OverlayMarkDef(size=60, color=c["blue"])).encode(
            x=alt.X("step:O", title="step"), y=alt.Y("entropy:Q", title="uncertainty (entropy, nats)"),
            tooltip=[alt.Tooltip("step:O"), alt.Tooltip("entropy:Q", format=".3f")])
        st.altair_chart(_style(line, 180), width="stretch", theme=None)


def parts_heatmap(rows: list[dict], height_per_row: int = 22) -> None:
    """Named score parts per dish (blue adds, red subtracts, grey ≈ 0)."""
    c = colors()
    data = [{"dish": r["name"], "part": k, "value": v} for r in rows for k, v in (r.get("parts") or {}).items()]
    if not data:
        return
    df = pd.DataFrame(data)
    lim = max(1.0, float(df["value"].abs().max()))
    base = alt.Chart(df).encode(x=alt.X("part:N", title=None, axis=alt.Axis(labelAngle=-30)),
                                y=alt.Y("dish:N", sort=[r["name"] for r in rows], title=None))
    cells = base.mark_rect(cornerRadius=2, stroke="transparent", strokeWidth=2).encode(
        color=alt.Color("value:Q", scale=alt.Scale(domain=[-lim, 0, lim], range=[c["red"], c["mid"], c["blue"]]),
                        legend=alt.Legend(title="points")),
        tooltip=[alt.Tooltip("dish:N"), alt.Tooltip("part:N"), alt.Tooltip("value:Q", format="+.2f")])
    text = base.mark_text(fontSize=10).encode(text=alt.Text("value:Q", format=".1f"))
    st.altair_chart(_style(alt.layer(cells, text), max(120, height_per_row * len(rows))), width="stretch", theme=None)


def prob_bars(probs: dict[str, float], highlight: Optional[str] = None, title: str = "probability", height: int = 160) -> None:
    c = colors()
    df = pd.DataFrame([{"option": k, "p": v} for k, v in sorted(probs.items(), key=lambda kv: -kv[1])])
    df["pick"] = df["option"].map(lambda o: "chosen" if o == highlight else "other")
    chart = alt.Chart(df).mark_bar(cornerRadiusEnd=4, height=12).encode(
        x=alt.X("p:Q", title=title, scale=alt.Scale(domain=[0, 1])), y=alt.Y("option:N", sort=list(df["option"]), title=None),
        color=alt.Color("pick:N", scale=alt.Scale(domain=["chosen", "other"], range=[c["orange"], c["blue"]]), legend=alt.Legend(title=None)),
        tooltip=[alt.Tooltip("option:N"), alt.Tooltip("p:Q", format=".3f")])
    st.altair_chart(_style(chart, max(height, 26 * len(df))), width="stretch", theme=None)


def bar_list(values: dict[str, float], title: str, height: int = 160, fmt: str = ".0f") -> None:
    c = colors()
    df = pd.DataFrame([{"label": k, "v": v} for k, v in values.items()])
    chart = alt.Chart(df).mark_bar(cornerRadiusEnd=4, height=12, color=c["blue"]).encode(
        x=alt.X("v:Q", title=title), y=alt.Y("label:N", sort=list(df["label"]), title=None),
        tooltip=[alt.Tooltip("label:N"), alt.Tooltip("v:Q", format=fmt, title=title)])
    st.altair_chart(_style(chart, max(height, 24 * len(df))), width="stretch", theme=None)


def pair_heatmap(pairs: list[dict], height_per_row: int = 24) -> None:
    """Co-purchase graph as a symmetric item × item matrix (how often bought together)."""
    c = colors()
    rows = [{"a": p["a"], "b": p["b"], "orders": p["orders"]} for p in pairs] + [{"a": p["b"], "b": p["a"], "orders": p["orders"]} for p in pairs]
    if not rows:
        return
    df = pd.DataFrame(rows)
    names = sorted(set(df["a"]))
    chart = alt.Chart(df).mark_rect(cornerRadius=2).encode(
        x=alt.X("a:N", sort=names, title=None, axis=alt.Axis(labelAngle=-35, labelLimit=140)),
        y=alt.Y("b:N", sort=names, title=None, axis=alt.Axis(labelLimit=160)),
        color=alt.Color("orders:Q", scale=alt.Scale(range=[c["mid"], c["blue"]]), legend=alt.Legend(title="orders together")),
        tooltip=[alt.Tooltip("a:N", title="Item"), alt.Tooltip("b:N", title="With"), alt.Tooltip("orders:Q", title="Orders together")])
    st.altair_chart(_style(chart, max(160, height_per_row * len(names))), width="stretch", theme=None)


# --- cards and trace viewers -------------------------------------------------------------

def status_badge(status: Optional[str]) -> None:
    _, icon, label = STATUS.get(status or "offline", STATUS["offline"])
    hint = {"live": "every card is a real Swiggy item near you",
            "partial": "some cards matched Swiggy, the rest are catalog placeholders",
            "offline": "catalog placeholders (no address, no token, or nothing matched)"}[status or "offline"]
    st.markdown(f"{icon} **{label}** · {hint}")


def rec_card(rec: dict, match: Optional[dict] = None) -> None:
    with st.container(border=True):
        if rec.get("image_url"):
            st.image(rec["image_url"], width="stretch")
        dish = rec["dish"]
        st.markdown(f"**#{rec.get('rank', '?')} {dish['name']}**  \n{dish.get('cuisine', '').title()}")
        rest = rec.get("restaurant") or {}
        price = (rec.get("practical_details") or {}).get("estimated_price")
        bits = [rest.get("name"), f"₹{price:.0f}" if price else None,
                f"{rest.get('delivery_time_min')} min" if rest.get("delivery_time_min") else None,
                f"★ {rest.get('rating')}" if rest.get("rating") else None]
        st.caption(" · ".join(b for b in bits if b))
        if match:
            item = match.get("item") or {}
            st.caption(f"🛵 Swiggy item: **{item.get('name')}**")
        r = rec.get("ai_reasoning") or {}
        for line in (r.get("mood_match"), r.get("context_fit"), r.get("psychological_hook")):
            if line:
                st.write(f"• {line}")
        if r.get("context_tags"):
            st.caption(" | ".join(r["context_tags"]))
        if rec.get("confidence") is not None:
            st.caption(f"card confidence {rec['confidence']:.2f}")


def events_of(trace: list[dict], kind: str) -> list[dict]:
    return [e for e in trace if e["kind"] == kind]


def jev_calls(trace: list[dict]) -> None:
    calls = [e for e in trace if e["kind"].startswith("jev.")]
    if not calls:
        st.caption("No JEV calls in this step.")
        return
    for e in calls:
        if e["kind"] != "jev.call":
            st.warning(f"JEV {e.get('call')}: {e['kind'].split('.')[1]} — {e.get('reason') or e.get('error')}")
            continue
        with st.expander(f"JEV · {e['call']} · {e.get('latency_ms', '?')} ms · {e.get('input_tokens', '?')} input tokens"):
            for qid, ch in (e.get("choices") or {}).items():
                st.markdown(f"**{qid}** → `{ch['choice']}` (confidence {ch['confidence']:.2f})")
                prob_bars(ch["probabilities"], highlight=ch["choice"])
            if e.get("nouls"):
                st.markdown("**Yes/no answers** (probability of yes)")
                bar_list(e["nouls"], "P(yes)", fmt=".3f")
            for qid, sc in (e.get("scores") or {}).items():
                st.markdown(f"**{qid}** → score {sc['score']} (confidence {sc['confidence']:.2f})")
            t1, t2 = st.tabs(["Questions", "State sent"])
            with t1:
                st.json(e.get("questions"), expanded=False)
            with t2:
                st.json(e.get("state"), expanded=False)


def swiggy_section(trace: list[dict]) -> None:
    """Live Swiggy matching: waves, MCP calls, menu-check verdicts."""
    result = events_of(trace, "live.result")
    if not result:
        st.caption("No live matching ran (no Swiggy address set).")
        return
    r = result[-1]
    status_badge(r["status"])
    st.caption(f"Stopped because: {r['stop_reason']} · probed from: {', '.join(r['pool'])}")
    for i, w in enumerate(events_of(trace, "live.wave"), 1):
        st.markdown(f"**Wave {i}** — probed {', '.join(w['probed'])}")
        st.dataframe(pd.DataFrame(w["results"]), hide_index=True, width="stretch",
                     column_config={"image_url": st.column_config.ImageColumn("photo")})
    calls = events_of(trace, "swiggy.call")
    if calls:
        st.markdown(f"**Swiggy MCP calls** ({len(calls)})")
        st.dataframe(pd.DataFrame([{"tool": c["tool"], "ok": c["ok"], "ms": c["latency_ms"], "chars": c.get("result_chars"),
                                    "args": json.dumps(c["args"])[:120], "error": c.get("error")} for c in calls]),
                     hide_index=True, width="stretch")
    verdicts = events_of(trace, "scout.verdict")
    if verdicts:
        st.markdown("**Menu check verdicts** (is this Swiggy item really the dish?)")
        st.dataframe(pd.DataFrame(verdicts).drop(columns=["kind", "t_ms"]), hide_index=True, width="stretch")


def raw_events(trace: list[dict]) -> None:
    with st.expander(f"All trace events ({len(trace)})"):
        for e in trace:
            st.markdown(f"`{e['t_ms']:>8.1f} ms` **{e['kind']}**")
        st.json(trace, expanded=False)
