"""Games control centre: play an adaptive game and watch every decision it makes."""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402

from lab import components as ui  # noqa: E402

st.set_page_config(page_title="Games · Intelligence Lab", page_icon="🎮", layout="wide")
ctx = ui.context_sidebar()
st.title("Games")

GAMES = {"(let the orchestrator pick)": None, "Swipe": "swipe", "This or that": "this_or_that",
         "Craving radar": "craving_radar", "Story": "story", "Bracket": "bracket", "Meal roulette": "roulette"}
S = st.session_state


# --- actions --------------------------------------------------------------------------

def start_game(game, count, max_steps, jev_on):
    res = ui.call(ui.client().game_start, ctx["user_context"], game, user_id=ctx["user_id"], count=count,
                  max_steps=max_steps or None, swiggy_address_id=ctx["address"])
    if res:
        S.run = {"start": res, "steps": [], "answers": [], "jev": jev_on, "game": res["result"]["game"],
                 "count": count, "max_steps": max_steps, "ctx": ctx, "question": res["result"]["question"],
                 "done": False, "shown_at": time.time()}
        S.pop("replay", None)


def answer(ans):
    run = S.run
    reaction = int((time.time() - run["shown_at"]) * 1000)
    res = ui.call(ui.client().game_answer, run["start"]["result"]["session_id"], ans, reaction_ms=reaction, jev=run["jev"])
    if res:
        run["steps"].append(res)
        run["answers"].append(ans)
        run["done"] = res["result"]["done"]
        run["question"] = res["result"].get("question")
        run["shown_at"] = time.time()


def replay(jev_on):
    """Same game, context and answers; JEV switched the other way. Stops if the questions diverge."""
    run = S.run
    c = run["ctx"]
    start = ui.call(ui.client().game_start, c["user_context"], run["game"], user_id=c["user_id"], count=run["count"],
                    max_steps=run["max_steps"] or None, swiggy_address_id=c["address"])
    if not start:
        return
    sid, q, steps, note = start["result"]["session_id"], start["result"]["question"], [], None
    for i, ans in enumerate(run["answers"]):
        if not valid_for(q, ans):
            note = f"Diverged at step {i + 1}: a different question was asked, so the recorded answer doesn't apply."
            break
        res = ui.call(ui.client().game_answer, sid, ans, jev=jev_on)
        if not res:
            return
        steps.append(res)
        if res["result"]["done"]:
            break
        q = res["result"]["question"]
    S.replay = {"jev": jev_on, "steps": steps, "note": note}


def valid_for(q, ans):
    if q["kind"] == "duel":
        return ans.get("winner_id") in {o["id"] for o in q["options"]}
    if q["kind"] == "choice":
        return ans.get("option_id") in {o["id"] for o in q["options"]}
    return True


# --- controls ---------------------------------------------------------------------------

with st.container(border=True):
    a, b, c, d, e = st.columns([2, 1, 1, 1, 1])
    game_label = a.selectbox("Game", list(GAMES), index=1)
    count = b.number_input("Picks", 1, 5, 3)
    max_steps = c.number_input("Max steps (0 = game default)", 0, 10, 0)
    jev_on = d.toggle("JEV on", True, help="Off = the request runs with JEV switched off (commit checks skipped).")
    e.write("")
    if e.button("▶ Start", type="primary", width="stretch"):
        start_game(GAMES[game_label], count, max_steps, jev_on)

run = S.get("run")
if not run:
    st.info("Pick a game and press Start. Set the person and situation in the sidebar.")
    st.stop()

start_ev = ui.events_of(run["start"]["trace"], "game.start")[0]
thresholds = start_ev["thresholds"]
steps_ev = [ui.events_of(s["trace"], "game.step")[0] for s in run["steps"]]

points = [{"step": 0, "leader": start_ev["posterior"][0]["name"], "leader_p": start_ev["posterior"][0]["p"], "entropy": start_ev["entropy"]}]
points += [{"step": e["step"], "leader": e["leader"]["name"], "leader_p": e["leader"]["p"], "entropy": e["entropy_after"]} for e in steps_ev]

st.caption(f"Game **{run['game']}** · session `{run['start']['result']['session_id'][:10]}` · JEV {'on' if run['jev'] else 'off'} · "
           f"{len(run['steps'])}/{start_ev['max_steps']} steps · thresholds: stop at leader ≥ {thresholds['stop_prob']}, "
           f"JEV check from {thresholds['jev_check_from']}, JEV stop at confidence ≥ {thresholds['jev_stop_conf']}")

# --- player + live state -----------------------------------------------------------------

left, right = st.columns([2, 3], gap="large")

with left:
    st.subheader("Player view")
    q = run["question"]
    if run["done"]:
        st.success("Game over — decision below.")
    elif q:
        kind = q["kind"]
        if kind == "swipe":
            dish = q["dish"]
            with st.container(border=True):
                if dish.get("image_url"):
                    st.image(dish["image_url"], width="stretch")
                st.markdown(f"### {dish['name']}")
                st.caption(f"{dish['cuisine'].title()} · {'veg' if dish['veg'] else 'non-veg'}" + (f" · {', '.join(dish['tags'])}" if dish["tags"] else ""))
            x, y = st.columns(2)
            x.button("👎 Pass", width="stretch", on_click=answer, args=({"liked": False},))
            y.button("👍 Like", width="stretch", type="primary", on_click=answer, args=({"liked": True},))
        elif kind == "duel":
            st.markdown(f"#### {q['round']} · match {q['match']} of {q['matches']}" if q.get("round") else "#### Which one tonight?")
            cols = st.columns(2)
            for col, opt in zip(cols, q["options"]):
                with col, st.container(border=True):
                    if opt.get("image_url"):
                        st.image(opt["image_url"], width="stretch")
                    st.markdown(f"**{opt['name']}**")
                    st.caption(opt["cuisine"].title() + (f" · {', '.join(opt['tags'])}" if opt["tags"] else ""))
                    st.button("This one", key=f"pick_{opt['id']}", width="stretch", on_click=answer, args=({"winner_id": opt["id"]},))
        elif kind == "yes_no":
            st.markdown(f"#### {q['prompt']}")
            x, y = st.columns(2)
            x.button("No", width="stretch", on_click=answer, args=({"yes": False},))
            y.button("Yes", width="stretch", type="primary", on_click=answer, args=({"yes": True},))
        elif kind == "spin":
            st.markdown(f"#### Spin {q['spin']} · {q['spins_left']} re-spin(s) left")
            wheel = st.columns(3)
            for i, seg in enumerate(q["segments"]):
                with wheel[i % 3]:
                    mark = "🎯 " if seg["id"] == q["landed"]["id"] else ""
                    st.caption(f"{mark}{'🧭 ' if seg['stretch'] else ''}{seg['name']}")
            with st.container(border=True):
                landed = q["landed"]
                if landed.get("image_url"):
                    st.image(landed["image_url"], width="stretch")
                st.markdown(f"### {landed['name']}" + ("  \n🧭 _something new for you_" if landed.get("stretch") else ""))
                st.caption(q["prompt"])
            x, y = st.columns(2)
            x.button("✅ Yes, that one", width="stretch", type="primary", on_click=answer, args=({"accept": True},))
            y.button("🔄 Spin again" if q["spins_left"] > 0 else "🙅 None of these", width="stretch", on_click=answer,
                     args=({"accept": False},))
        else:
            if q.get("cold_open"):
                st.markdown(f"_{q['cold_open']}_")
            if q.get("segment"):
                st.caption(f"{q['segment']} · {q.get('step', '?')}/{q.get('of', '?')}")
            st.markdown(f"#### {q['prompt']}")
            if q.get("personalised"):
                st.caption(f"✍️ personalised from: “{q['base_prompt']}”")
            for opt in q["options"]:
                st.button(f"{opt.get('emoji', '')} {opt['label']}".strip(), key=f"opt_{opt['id']}", width="stretch",
                          on_click=answer, args=({"option_id": opt["id"]},))
        st.caption(f"question key `{q['key']}`")

    st.markdown("**Progress**")
    ui.trend_charts(points, thresholds)
    if len(points) < 2:
        st.caption("Charts appear after the first answer.")

with right:
    latest = steps_ev[-1] if steps_ev else None
    st.subheader(f"Under the hood · step {latest['step'] if latest else 0}")
    if latest:
        jc = latest["jev_check"]
        m1, m2, m3, m4 = st.columns([3, 2, 2, 2])
        m1.markdown(f"**Leader**  \n{latest['leader']['name']}  \n`P = {latest['leader']['p']:.2f}`")
        m2.markdown(f"**Uncertainty**  \n{latest['entropy_after']:.2f} nats  \n`{latest['entropy_after'] - latest['entropy_before']:+.2f}`")
        m3.markdown(f"**JEV check**  \n{'ran' if jc['ran'] else 'skipped'}  \n" +
                    (f"`confidence {jc['result']['confidence']:.2f}`" if jc.get("result") else f"_{jc.get('reason', '')}_"))
        m4.markdown(f"**Stop reason**  \n{latest['stop_reason'].replace('_', ' ')}")
        st.caption(f"Answer: `{latest['label']}` to “{latest['question']['label']}”" + (f" · {latest['reaction_ms']} ms" if latest.get("reaction_ms") else ""))
    tabs = st.tabs(["Probabilities", "Next question", "Answer effect", "JEV", "Candidates", "Events"])
    with tabs[0]:
        ui.posterior_chart(latest["posterior"] if latest else start_ev["posterior"], thresholds)
    with tabs[1]:
        rows = latest["next_question_scores"] if latest else start_ev["question_scores"]
        chosen = latest["next_question"] if latest else start_ev["chosen"]
        st.caption("The engine asks the question expected to cut uncertainty the most (largest information gain).")
        ui.question_scores_chart(rows, chosen)
    with tabs[2]:
        if latest:
            ui.movers_chart(latest["posterior"])
        else:
            st.caption("Answer a question to see its effect.")
    with tabs[3]:
        if latest:
            if jc["ran"] and jc.get("result"):
                st.markdown(f"Commit check over the top 4: {', '.join(jc['candidates'])}")
                names = {p["id"]: p["name"] for p in latest["posterior"]}
                probs = {names.get(k, k): v for k, v in jc["result"]["probabilities"].items()}
                ui.prob_bars(probs, highlight=names.get(jc["result"]["dish_id"]), title="JEV: P(this is the pick)")
                st.caption(f"Ends the game when confidence ≥ {thresholds['jev_stop_conf']} and JEV's pick is in the engine's top 2.")
            else:
                st.caption(f"No commit check this step: {jc.get('reason')}")
            ui.jev_calls(run["steps"][-1]["trace"])
        else:
            st.caption("JEV is consulted once a dish leads with P ≥ " + str(thresholds["jev_check_from"]) + ".")
    with tabs[4]:
        f = start_ev["filters"]
        st.caption(f"Hard filters: {f['kept']} of {f['catalog']} catalog dishes kept · " +
                   ", ".join(f"{k.replace('_', ' ')} −{v}" for k, v in f.items() if k not in ("catalog", "kept")))
        st.markdown(f"**{len(start_ev['candidates'])} candidates** and their starting score parts")
        ui.parts_heatmap(start_ev["candidates"])
    with tabs[5]:
        ui.raw_events(run["steps"][-1]["trace"] if run["steps"] else run["start"]["trace"])

# --- timeline -----------------------------------------------------------------------------

if steps_ev:
    st.subheader("Timeline")
    st.dataframe(pd.DataFrame([{
        "step": e["step"], "question": e["question"]["label"], "answer": e["label"],
        "leader": e["leader"]["name"], "P(leader)": e["leader"]["p"], "entropy": e["entropy_after"],
        "JEV": (f"conf {e['jev_check']['result']['confidence']:.2f}" if e["jev_check"].get("result") else "—"),
        "stop": e["stop_reason"], "ms": s["elapsed_ms"]} for e, s in zip(steps_ev, run["steps"])]),
        hide_index=True, width="stretch")
    with st.expander("Inspect an earlier step"):
        n = st.slider("Step", 1, len(steps_ev), len(steps_ev)) if len(steps_ev) > 1 else 1
        e = steps_ev[n - 1]
        st.caption(f"“{e['question']['label']}” → {e['label']} · stop reason {e['stop_reason']}")
        x, y = st.columns(2)
        with x:
            ui.posterior_chart(e["posterior"], thresholds, height=260)
        with y:
            ui.movers_chart(e["posterior"])

# --- decision -----------------------------------------------------------------------------

if run["done"]:
    final = run["steps"][-1]
    decision = final["result"]["decision"]
    dec_ev = ui.events_of(final["trace"], "game.decision")[0]
    st.divider()
    st.header("Decision")
    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Confidence", f"{decision['confidence']:.2f}", dec_ev["confidence_source"].replace("_", " "), delta_color="off")
    k2.metric("Steps", len(run["steps"]))
    k3.metric("Final answer latency", f"{final['elapsed_ms']:.0f} ms")
    with k4:
        ui.status_badge(decision.get("live_status"))
    recs = decision["recommendations"]["recommendations"]
    matches = decision["recommendations"].get("swiggy_matches") or {}
    for col, rec in zip(st.columns(max(1, len(recs))), recs):
        with col:
            ui.rec_card(rec, matches.get(rec["dish"]["id"]))

    t1, t2, t3, t4, t5 = st.tabs(["Why these", "Explanation sources", "Swiggy matching", "Signals sent", "Replay & compare"])
    with t1:
        st.caption("Score parts of the pool the decision drew from (selected = shown as a card).")
        ui.parts_heatmap(dec_ev["pool"])
        st.dataframe(pd.DataFrame([{k: p[k] for k in ("name", "posterior", "total", "selected", "live")} for p in dec_ev["pool"]]),
                     hide_index=True, width="stretch")
    with t2:
        for ev in ui.events_of(final["trace"], "explain"):
            if ev["dish_id"] in decision["dish_ids"]:
                st.markdown(f"**{ev['dish']}**")
                st.dataframe(pd.DataFrame([{"line": k, "source": v} for k, v in ev["sources"].items() if k != "candidate_hooks"]),
                             hide_index=True, width="stretch")
                st.caption("Hook candidates (first unused wins): " + " · ".join(f"{h['source']}" for h in ev["sources"]["candidate_hooks"]))
    with t3:
        ui.swiggy_section(final["trace"])
    with t4:
        st.caption("Typed signals the API logs for the learner (lossless, in learner formats).")
        st.json([sig for s in run["steps"] for sig in s["result"]["signals"]], expanded=False)
    with t5:
        st.caption("Replay the same answers on a fresh session with JEV switched the other way.")
        if st.button(f"Replay with JEV {'off' if run['jev'] else 'on'}"):
            replay(not run["jev"])
        rp = S.get("replay")
        if rp:
            if rp["note"]:
                st.warning(rp["note"])
            def summary(steps):
                last = steps[-1]["result"] if steps else {}
                ev = ui.events_of(steps[-1]["trace"], "game.step")[0] if steps else {}
                return {"steps": len(steps), "stop": ev.get("stop_reason"), "picks": ", ".join(
                    r["dish"]["name"] for r in last.get("decision", {}).get("recommendations", {}).get("recommendations", []))}
            st.dataframe(pd.DataFrame([{"run": f"JEV {'on' if run['jev'] else 'off'} (played)", **summary(run["steps"])},
                                       {"run": f"JEV {'on' if rp['jev'] else 'off'} (replay)", **summary(rp["steps"])}]),
                         hide_index=True, width="stretch")
