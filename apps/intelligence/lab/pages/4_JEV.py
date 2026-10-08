"""JEV playground: any state, any Noul / Choice / Score questions."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import streamlit as st  # noqa: E402

from lab import components as ui  # noqa: E402

st.set_page_config(page_title="JEV · Intelligence Lab", page_icon="⚖️", layout="wide")
ui.context_sidebar()
st.title("JEV playground")
st.caption("TypeSafe System One (jev-1.13.0). Keep numbers and time maths out of the state; pass named buckets. "
           "Choice options carry an order bias, so the product shuffles them.")

PRESETS = {
    "Noul — is this a good pick?": (
        {"person": {"mood": "tired", "energy": "low", "meal": "dinner", "weather": "rainy"},
         "dish": {"name": "Dal Makhani", "feel": "warm, creamy, rich"}},
        {"fit": {"type": "noul", "instructions": "Would `dish` be a great thing for `person` to eat right now?",
                 "criteria": {"true": "A natural, appealing fit.", "false": "A poor fit right now."}}}),
    "Choice — pick one": (
        {"person": {"mood": "celebratory", "with": "friends", "meal": "dinner"}},
        {"pick": {"type": "choice", "instructions": "Which should `person` order?",
                  "criteria": {"c1": "Chicken Biryani", "c2": "Khichdi", "c3": "Pizza Margherita"}}}),
    "Score — how spicy is it?": (
        {"dish": {"name": "Chicken Chettinad"}},
        {"spice": {"type": "score", "instructions": "How spicy is `dish` usually?",
                   "criteria": ["not spicy", "a little", "medium", "hot", "very hot"]}}),
}

preset = st.selectbox("Preset", list(PRESETS))
state0, questions0 = PRESETS[preset]
a, b = st.columns(2)
state_txt = a.text_area("State (JSON)", json.dumps(state0, indent=2), height=260, key=f"state_{preset}")
q_txt = b.text_area("Questions (JSON: id → {type, instructions, criteria})", json.dumps(questions0, indent=2), height=260, key=f"q_{preset}")
if st.button("Ask JEV", type="primary"):
    try:
        st.session_state.jev_res = ui.call(ui.client().jev, json.loads(state_txt), json.loads(q_txt))
    except json.JSONDecodeError as exc:
        st.error(f"Invalid JSON: {exc}")

res = st.session_state.get("jev_res")
if res:
    out = res["result"]
    if out is None:
        st.warning("JEV returned nothing (breaker open, timeout or error) — see events.")
    else:
        st.caption(f"{out['model']} · {out['latency_ms']} ms · {out['input_tokens']} input tokens")
        for qid, p in out["nouls"].items():
            st.metric(f"{qid}: P(yes)", f"{p:.3f}")
        for qid, ch in out["choices"].items():
            st.markdown(f"**{qid}** → `{ch['choice']}` · confidence {ch['confidence']:.2f}")
            ui.prob_bars(ch["probabilities"], highlight=ch["choice"])
        for qid, sc in out["scores"].items():
            st.markdown(f"**{qid}** → score **{sc['score']}** · confidence {sc['confidence']:.2f}")
            ui.prob_bars({str(k): v for k, v in sc["probabilities"].items()}, title="P(level)")
    ui.raw_events(res["trace"])
