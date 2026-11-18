"""KitchenCircle Planner Lab: synthetic households through the real planner, chat, cart, translation and notification code.

Fixtures by default. Lab mode keeps Swiggy read-only, and nothing here writes a cart, order, invitation or push.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from lab import components as ui  # noqa: E402
from lab import kitchen_circle_fixtures as fx  # noqa: E402
from lab.client import LabError  # noqa: E402

st.set_page_config(page_title="KitchenCircle · Intelligence Lab", page_icon="🍲", layout="wide")
st.title("KitchenCircle Planner Lab")
st.caption("Synthetic households only. Every result comes from the same code the app uses, with its decision trace. "
           "Lab mode forces Swiggy read-only; no cart, order, invitation or push is ever written from here.")


def node(method: str, path: str, body=None):
    """Node-only pieces (aggregation, chat policy, notification copy) need the API running locally."""
    try:
        return ui.client().node(method, path, json=body)
    except (LabError, AttributeError) as exc:
        st.info(f"Needs the MoodFood API (dev): {exc}")
        return None


def autofill_body(members, rules, blank=7, feedback=None, seed=0):
    return {"members": members, "rules": rules, "slots": fx.week(blank=blank), "recipes": fx.RECIPES, "feedback": feedback or [], "seed": seed}


tabs = st.tabs(["Household & proposal", "Conflicts", "Chat actions", "Scaling & aggregation", "Pack optimizer",
                "Cook preview", "Notifications", "Feedback"])

with tabs[0]:
    a, b, c = st.columns([2, 1, 1])
    household = a.selectbox("Synthetic household", list(fx.HOUSEHOLDS))
    open_days = b.slider("Open days", 1, 7, 7)
    seed = c.number_input("Seed (regenerate)", 0, 10_000, 0)
    with st.expander("Members, preferences and rules (editable JSON)"):
        members = json.loads(st.text_area("Members", json.dumps(fx.HOUSEHOLDS[household], indent=1), height=200, key=f"m-{household}"))
        rules = json.loads(st.text_area("Rules", json.dumps(fx.RULES[household], indent=1), height=120, key=f"r-{household}"))
    if st.button("Propose the week", type="primary"):
        st.session_state.kc_proposal = ui.call(ui.client().kc_autofill, autofill_body(members, rules, open_days, seed=int(seed)))
    res = st.session_state.get("kc_proposal")
    if res:
        r = res["result"]
        st.success(r["summary"])
        rows = [{"day": p["planned_for"], "pick": p["pick"]["title"], "score": p["pick"]["score"], "servings": p["servings"],
                 "reasons": " · ".join(p["pick"]["reasons"]), "alternatives": ", ".join(x["title"] for x in p["alternatives"])} for p in r["proposals"]]
        st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)
        if r["proposals"]:
            st.caption("Score parts per pick")
            st.dataframe(pd.DataFrame([{"day": p["planned_for"], **p["pick"]["breakdown"]} for p in r["proposals"]]), width="stretch", hide_index=True)
        for u in r["unfilled"]:
            st.warning(f"{u['planned_for']}: {u['reason']}")
        if r["ignored_rules"]:
            st.info("Ignored rule keys: " + "; ".join(r["ignored_rules"]))
        with st.expander(f"Trace ({len(res['trace'])} events · {res['elapsed_ms']} ms)"):
            st.json(res["trace"])

with tabs[1]:
    scenario = st.selectbox("Conflict scenario", list(fx.CONFLICTS))
    if st.button("Simulate"):
        cfg = fx.CONFLICTS[scenario]
        st.session_state.kc_conflict = ui.call(ui.client().kc_autofill, autofill_body(cfg["members"], cfg["rules"]))
    res = st.session_state.get("kc_conflict")
    if res:
        r = res["result"]
        st.write(r["summary"])
        st.dataframe(pd.DataFrame([{"day": u["planned_for"], "reason": u["reason"]} for u in r["unfilled"]] or [{"day": "—", "reason": "Every day filled"}]), hide_index=True)
        blocked = [e for e in res["trace"] if e.get("kind") == "kitchen_circle.autofill.unfilled"]
        if blocked:
            st.caption("Why candidates were blocked (hard constraints)")
            st.json(blocked)

with tabs[2]:
    a, b = st.columns([3, 1])
    message = a.text_input("Message", "We are going out Friday")
    members_n = b.number_input("Members", 1, 8, 3)
    if st.button("Interpret"):
        body = {"message": message, "today": fx.week()[0]["planned_for"], "member_count": int(members_n), "allow_llm": False,
                "days": [{"slot_id": s["slot_id"], "planned_for": s["planned_for"], "weekday": s["weekday"], "state": "blank"} for s in fx.week()],
                "recipes": [{"recipe_id": r["recipe_id"], "version_id": r["version_id"], "title": r["title"]} for r in fx.RECIPES]}
        st.session_state.kc_chat = ui.call(ui.client().kc_chat, body)
    res = st.session_state.get("kc_chat")
    if res:
        r = res["result"]
        st.write(f"**Reply** ({r['source']}): {r['reply']}")
        if r["actions"]:
            st.dataframe(pd.DataFrame(r["actions"]).dropna(axis=1, how="all"), hide_index=True)
            policy = node("POST", "/kitchen-circle/lab/chat-policy", {"actions": [{"type": a["type"], "slotLocked": False} for a in r["actions"]]})
            if policy:
                st.caption("API policy (chat-policy.ts) for these actions")
                st.dataframe(pd.DataFrame(policy["decisions"]), hide_index=True)
        if r.get("clarification"):
            st.warning(r["clarification"]["question"])
            for option in r["clarification"]["options"]:
                st.write(f"- {option['label']}: {', '.join(a['summary'] for a in option['actions']) or 'no change'}")

with tabs[3]:
    st.caption("Recipe scaling and the deduplicated, source-traced grocery requirement (the API's grocery engine).")
    if st.button("Aggregate sample week"):
        today = fx.week()[0]["planned_for"]
        slots = [
            {"slotId": "mon", "plannedFor": today, "servings": 4, "recipeId": "curry", "recipeTitle": "Chicken Curry", "recipeVersionId": "v1", "defaultServings": 2,
             "ingredients": [{"name": "chicken", "quantity": 500, "unit": "g"}, {"name": "onions", "quantity": 2, "unit": "piece"}, {"name": "salt", "quantity": 1, "unit": "tsp"}]},
            {"slotId": "tue", "plannedFor": fx.week()[1]["planned_for"], "servings": 2, "recipeId": "pulao", "recipeTitle": "Pulao", "recipeVersionId": "v2", "defaultServings": 2,
             "ingredients": [{"name": "chicken", "quantity": 0.65, "unit": "kg"}, {"name": "basmati rice", "quantity": 1.5, "unit": "cup"}, {"name": "spring onion", "quantity": 1, "unit": "bunch"}]},
        ]
        st.session_state.kc_agg = node("POST", "/kitchen-circle/lab/aggregate", {"referenceDate": today, "slots": slots})
    res = st.session_state.get("kc_agg")
    if res:
        for line in res["lines"]:
            st.write(f"**{line['displayName']}** — {line['quantity'] or 'as needed'} {line['unit'] or ''} · {line['kind']} · {line['status']}")
            st.dataframe(pd.DataFrame(line["sources"]), hide_index=True)

with tabs[4]:
    scenario = st.selectbox("Pack scenario", list(fx.CART_SCENARIOS))
    st.caption("Sample catalogue (fixture provider). Live Instamart search is read-only in lab mode and needs an owner token, so it isn't offered here.")
    if st.button("Optimize packs"):
        st.session_state.kc_cart = ui.call(ui.client().kc_cart, {"provider": "fixture", "lines": fx.CART_SCENARIOS[scenario]})
    res = st.session_state.get("kc_cart")
    if res:
        r = res["result"]
        st.metric("Estimated total (sample prices)", f"₹{r['totals']['estimated_cost']:,.0f}")
        st.dataframe(pd.DataFrame([{"item": l["name"], "status": l["status"], "need": l["required"],
                                    "packs": " + ".join(f"{p['count']} × {p['label']}" for p in (l["product"] or {}).get("packs", [])),
                                    "buying": (l["product"] or {}).get("purchased"), "extra": (l["product"] or {}).get("surplus"),
                                    "cost": (l["product"] or {}).get("cost"), "why": l["explanation"]} for l in r["lines"]]), width="stretch", hide_index=True)
        for w in r["warnings"]:
            st.info(w)

with tabs[5]:
    a, b, c = st.columns(3)
    language = a.selectbox("Language", ["hi", "hinglish", "mr", "ta", "te", "bn", "kn", "en"])
    translit = b.toggle("Show in English letters", False)
    use_llm = c.toggle("Use the model (costs a call)", False)
    if st.button("Preview cook view"):
        st.session_state.kc_cook = ui.call(ui.client().kc_translate, {"language": language, "transliterate": translit, "meals": [fx.COOK_MEAL], "allow_llm": use_llm})
    res = st.session_state.get("kc_cook")
    if res:
        r = res["result"]
        st.write(f"Status: **{r['status']}** (fallback keeps English; numbers are never changed)")
        for meal in r["meals"]:
            st.subheader(meal["title"])
            st.write(" · ".join(f"{i['name']} ({i['unit']})" for i in meal["ingredients"]))
            for n, step in enumerate(meal["steps"], 1):
                st.write(f"{n}. {step}")

with tabs[6]:
    if st.button("Load notification copy"):
        st.session_state.kc_notes = node("GET", "/kitchen-circle/lab/notification-previews")
    res = st.session_state.get("kc_notes")
    if res:
        st.dataframe(pd.DataFrame(res["previews"]), width="stretch", hide_index=True)
        st.caption("Preview only — the lab never sends a push.")

with tabs[7]:
    st.caption("How post-meal check-ins shape the next proposal (loved → up, skipped → down; repeated weeknight skips of slow recipes → slower dishes avoided on weeknights).")
    outcome = st.selectbox("Last week's check-in for Paneer Bhurji", ["loved", "skipped", "change", "moved"])
    if st.button("Compare proposals"):
        before = ui.call(ui.client().kc_autofill, autofill_body(fx.HOUSEHOLDS["Solo, no restrictions"], [], blank=3))
        after = ui.call(ui.client().kc_autofill, autofill_body(fx.HOUSEHOLDS["Solo, no restrictions"], [], blank=3,
                                                            feedback=[{"recipe_id": "paneer", "outcome": outcome, "weekday": 2}] * 2))
        st.session_state.kc_fb = (before, after)
    pair = st.session_state.get("kc_fb")
    if pair and all(pair):
        left, right = st.columns(2)
        for col, label, res in ((left, "Without feedback", pair[0]), (right, "With feedback", pair[1])):
            col.write(f"**{label}**")
            col.dataframe(pd.DataFrame([{"day": p["planned_for"], "pick": p["pick"]["title"], "feedback": p["pick"]["breakdown"].get("feedback", 0)}
                                        for p in res["result"]["proposals"]]), hide_index=True)
