"""The full recommendation pipeline for the sidebar context, traced stage by stage."""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from lab import components as ui  # noqa: E402

st.set_page_config(page_title="Recommend · Intelligence Lab", page_icon="🍽️", layout="wide")
ctx = ui.context_sidebar()
st.title("Recommend")
S = st.session_state


def run(temperature: float):
    req = {"user_context": ctx["user_context"], "request_id": f"lab-{uuid.uuid4().hex[:12]}",
           "recommendation_config": {"count": S.rec_count, "diversity": S.rec_diversity, "temperature": temperature,
                                     **({"mode": S.rec_mode} if S.rec_mode != "standard" else {})}}
    if ctx["user_id"]:
        req["user_id"] = ctx["user_id"]
    if ctx["address"]:
        req["swiggy_address_id"] = ctx["address"]
    res = ui.call(ui.client().recommend, req, jev=S.rec_jev)
    if res:
        S.rec = res
        S.rec_temp = temperature


with st.container(border=True):
    a, b, c, d, e, f = st.columns([1, 1, 1, 1, 1, 1])
    a.number_input("Cards", 1, 5, 3, key="rec_count")
    b.selectbox("Diversity", ["low", "medium", "high"], index=1, key="rec_diversity")
    c.selectbox("Mode", ["standard", "mind_reader", "sos"], key="rec_mode")
    d.toggle("JEV on", True, key="rec_jev")
    e.button("▶ Run", type="primary", width="stretch", on_click=run, args=(0.6,))
    f.button("↻ Get new picks", width="stretch", disabled="rec" not in S, on_click=lambda: run(min(1.0, S.get("rec_temp", 0.6) + 0.1)),
             help="Same context again — the next page of the ranking (needs a user ID).")

res = S.get("rec")
if not res:
    st.info("Press Run to send the sidebar context through the full pipeline.")
    st.stop()

trace, result = res["trace"], res["result"]
summary = (ui.events_of(trace, "pipeline.summary") or [{}])[-1]
meta = result.get("meta") or {}
k1, k2, k3, k4, k5 = st.columns(5)
k1.metric("Ranker", summary.get("ranker", "?"))
k2.metric("Commit confidence", f"{meta['commit_confidence']:.2f}" if meta.get("commit_confidence") is not None else "—")
k3.metric("Suggested cards", meta.get("suggested_count") or "—")
k4.metric("Total", f"{res['elapsed_ms']:.0f} ms")
with k5:
    ui.status_badge(result.get("live_status"))

recs = result["recommendations"]
matches = result.get("swiggy_matches") or {}
for col, rec in zip(st.columns(max(1, len(recs))), recs):
    with col:
        ui.rec_card(rec, matches.get(rec["dish"]["id"]))

tabs = st.tabs(["Shortlist", "JEV × rules blend", "Commit", "Timings", "JEV calls", "Explanations", "Swiggy", "Events"])
with tabs[0]:
    sl = ui.events_of(trace, "pipeline.shortlist")[0]
    f = sl["filters"]
    st.caption(f"Hard filters kept {f['kept']} of {f['catalog']} dishes · " +
               ", ".join(f"{k.replace('_', ' ')} −{v}" for k, v in f.items() if k not in ("catalog", "kept")) +
               (f" · wildcards added: {', '.join(sl['wildcards'])}" if sl["wildcards"] else ""))
    st.markdown(f"**Shortlist ({sl['size']})** — score parts")
    ui.parts_heatmap(sl["candidates"][:25])
    with st.expander("Context the pipeline actually used (after learned state)"):
        st.json(sl["context_used"])
with tabs[1]:
    ranks = ui.events_of(trace, "engine.rank")
    if not ranks:
        rk = ui.events_of(trace, "pipeline.rank")[0]
        st.info(f"The decision engine didn't serve this request ({rk['fallback']}).")
    else:
        r = ranks[0]
        st.caption(f"blended = (1 − {r['jev_weight']}) × rule score (normalised) + {r['jev_weight']} × JEV fit · "
                   f"diversity λ = {r['mmr_lambda']} reorders the blend")
        df = pd.DataFrame(r["rows"])
        df["moved"] = df["blend_rank"] - df["final_rank"]
        st.dataframe(df[["final_rank", "blend_rank", "moved", "name", "cuisine", "rule_norm", "jev_fit", "blended", "rule_total"]]
                     .sort_values("final_rank"), hide_index=True, width="stretch",
                     column_config={"rule_norm": st.column_config.ProgressColumn("rule (0-1)", min_value=0, max_value=1, format="%.2f"),
                                    "jev_fit": st.column_config.ProgressColumn("JEV fit", min_value=0, max_value=1, format="%.2f"),
                                    "blended": st.column_config.ProgressColumn("blended", min_value=0, max_value=1, format="%.2f")})
with tabs[2]:
    commits = ui.events_of(trace, "engine.commit")
    if commits and commits[0]["ran"]:
        c = commits[0]
        st.caption(f"One JEV Choice over the engine's top 4 (options shuffled to counter order bias). "
                   f"Confidence {c['confidence']:.2f} → suggest {c['suggested_count']} card(s).")
        ui.prob_bars(c["probabilities"], highlight=c["pick_name"], title="JEV: P(order this one)")
    else:
        st.caption(f"No commit check: {commits[0]['reason'] if commits else 'ranker was not JEV'}")
with tabs[3]:
    ui.bar_list(summary.get("latency_ms", {}), "milliseconds")
    rk = ui.events_of(trace, "pipeline.rank")[0]
    st.caption(f"Ranker requested {rk['ranker_requested']}, used {rk['ranker_used']}" + (f" ({rk['fallback']})" if rk["fallback"] else "") +
               (f" · paging excluded {len(rk['paging_excluded'])} already-shown dishes" if rk["paging_excluded"] else ""))
with tabs[4]:
    ui.jev_calls(trace)
with tabs[5]:
    for ev in ui.events_of(trace, "explain"):
        if ev["dish_id"] in {r["dish"]["id"] for r in recs}:
            st.markdown(f"**{ev['dish']}**")
            st.dataframe(pd.DataFrame([{"line": k, "source": v} for k, v in ev["sources"].items() if k != "candidate_hooks"]),
                         hide_index=True, width="stretch")
with tabs[6]:
    ui.swiggy_section(trace)
with tabs[7]:
    ui.raw_events(trace)
