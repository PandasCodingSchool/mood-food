"""Intelligence Lab — control centre for the MoodFood intelligence service.

Run: scripts/lab.sh   (service on :8010 with LAB_ENABLED=true, this UI on :8510)
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # so `lab.*` imports work under `streamlit run`

import streamlit as st  # noqa: E402

from lab.components import call, client, context_sidebar  # noqa: E402

st.set_page_config(page_title="Intelligence Lab", page_icon="🧪", layout="wide")
context_sidebar()

st.title("Intelligence Lab")
st.write("Play the games and run every part of the intelligence against the real service, "
         "with each decision traced: probabilities, questions, JEV calls, scores and Swiggy matching.")

health = call(client().health)
if health:
    jev, oa, sw = health["jev"], health["openai"], health["swiggy"]
    a, b, c, d = st.columns(4)
    with a:
        st.metric("JEV", "✅ live" if jev["configured"] and not jev["breaker_open"] else ("⛔ breaker open" if jev["breaker_open"] else "⚪ no key"))
        st.caption(f"{jev['model']} · ranker={jev['ranker_provider']} · weight {jev['jev_weight']}")
    with b:
        st.metric("OpenAI", "✅ key set" if oa["configured"] else "⚪ no key")
        st.caption(f"{oa['model']} · hero polish {'on' if oa['polish_hero_copy'] else 'off'}")
    with c:
        if sw["has_token"] and not sw["expired"]:
            hours = (sw["seconds_left"] or 0) / 3600
            st.metric("Swiggy", "✅ token", f"{hours:.0f} h left" if sw["seconds_left"] else None, delta_color="off")
        else:
            st.metric("Swiggy", "⛔ token expired" if sw["has_token"] else "⚪ no token")
        st.caption("Live cards need a token + an address ID (sidebar)")
    with d:
        st.metric("Store", health["store"]["backend"])
        st.caption(f"{health['catalog']['dishes']} catalog dishes · env {health['environment']}")
    with st.expander("Raw health"):
        st.json(health)

st.subheader("Pages")
st.markdown("""
- **Games** — play swipe, this-or-that, craving radar or story; see the probability over candidates,
  the information gain of every possible question, each answer's effect, the JEV commit check and why the game stopped.
- **Recommend** — the full recommendation pipeline: hard filters, score parts, the JEV-vs-rules blend,
  diversity reordering, commit confidence, cards and stage timings.
- **Food graph** — map Swiggy menu item names onto catalog dishes and see JEV's choice probabilities.
- **JEV** — playground for any state and Noul / Choice / Score questions.
- **Evals** — run the golden scenario suite.
- **Swiggy** — token and address status (live results arrive in Phase 2).

The **Context** in the sidebar is shared by every page.
""")
