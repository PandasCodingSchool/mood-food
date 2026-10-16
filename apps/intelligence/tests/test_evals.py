"""Golden scenario evals (deterministic). Run alone with: pytest -m eval"""

import pytest

from evals import harness

pytestmark = pytest.mark.eval


@pytest.fixture(scope="module", autouse=True)
def _warm():
    harness.warm_up()


@pytest.mark.parametrize("scenario", harness.named_scenarios(), ids=lambda s: s.name)
def test_named_scenario(scenario):
    assert harness.evaluate(scenario).failures == []


def test_grid_is_safe_on_budget_and_fast():
    results = [harness.evaluate(s) for s in harness.grid_scenarios()]
    failures = {r.scenario.name: r.failures for r in results if r.failures}
    assert failures == {}


def test_grid_mood_fit_floor():
    fits = [harness.mood_fit(harness.evaluate(s)) for s in harness.grid_scenarios()]
    fits = [f for f in fits if f is not None]
    assert sum(fits) / len(fits) >= 0.7  # baseline 0.76 at Phase 0


def test_brain_backtest_beats_baselines():
    """Predict each synthetic order from earlier ones: context-aware brain > user overall > popular."""
    from evals import backtest

    r = backtest.run(n_users=18)
    for f in ("cuisine", "protein", "form"):
        assert r["brain"][f]["hit@1"] > r["overall"][f]["hit@1"], f
        assert r["brain"][f]["hit@1"] > r["popular"][f]["hit@1"], f
