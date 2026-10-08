"""Golden scenario suite: safety, budget, pool size, mood fit, latency."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from lab import components as ui  # noqa: E402

st.set_page_config(page_title="Evals · Intelligence Lab", page_icon="✅", layout="wide")
ui.context_sidebar()
st.title("Evals")
st.caption("Named scenarios plus the persona × meal × mood × budget grid, run against the shortlist the "
           "service uses. Any diet/allergen violation is a failure.")

if st.button("Run evals", type="primary"):
    st.session_state.evals = ui.call(ui.client().evals)

res = st.session_state.get("evals")
if res:
    r = res["result"]
    a, b, c, d = st.columns(4)
    a.metric("Scenarios", r["named"] + r["grid"])
    b.metric("Failures", len(r["failures"]), delta=None)
    c.metric("Mood fit (top 5)", f"{r['mean_mood_fit_top5']:.2f}")
    d.metric("p95 shortlist", f"{r['p95_shortlist_ms']} ms")
    if r["failures"]:
        st.error(f"{len(r['failures'])} scenario(s) failed")
        st.dataframe(pd.DataFrame(r["failures"]), hide_index=True, width="stretch")
    else:
        st.success("✅ All scenarios pass")
    st.subheader("Named scenarios")
    df = pd.DataFrame(r["named_results"])
    df["top"] = df["top"].map(", ".join)
    df["failures"] = df["failures"].map(lambda f: "; ".join(f) or "✓")
    st.dataframe(df, hide_index=True, width="stretch")

    bt = r.get("backtest")
    if bt:
        st.subheader("Brain backtest")
        st.caption(f"{bt['predictions']} synthetic orders, each predicted only from the orders before it. "
                   "brain = context-aware (slot, weekday/weekend); overall = same user ignoring context; popular = no personalisation.")
        st.dataframe(pd.DataFrame([{"predictor": m, "feature": f, "hit@1": bt[m][f]["hit@1"], "hit@3": bt[m][f]["hit@3"]}
                                   for m in ("brain", "overall", "popular") for f in ("cuisine", "protein", "form")]),
                     hide_index=True, width="stretch",
                     column_config={"hit@1": st.column_config.ProgressColumn("hit@1", min_value=0, max_value=1, format="%.2f"),
                                    "hit@3": st.column_config.ProgressColumn("hit@3", min_value=0, max_value=1, format="%.2f")})
