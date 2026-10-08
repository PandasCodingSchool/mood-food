"""Lab UI smoke tests: every page runs without exceptions against the real lab router (in-process)."""

from pathlib import Path

import pytest

pytest.importorskip("streamlit")

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from streamlit.testing.v1 import AppTest  # noqa: E402

from app.routes import lab  # noqa: E402
from lab.client import LabClient, LabError  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PAGES = ROOT / "lab" / "pages"


class InProcessClient(LabClient):
    """The lab client, but requests go to the lab router in this process."""

    def __init__(self, tc: TestClient):
        super().__init__("http://test", "")
        self.tc = tc

    def _call(self, method, path, *, json=None, params=None):
        res = self.tc.request(method, path, json=json, params=params)
        if res.status_code >= 400:
            raise LabError(f"{res.status_code}: {res.json().get('detail')}")
        return res.json()


@pytest.fixture
def lab_client():
    app = FastAPI()
    app.include_router(lab.router)
    with TestClient(app) as tc:
        yield InProcessClient(tc)


def _app(path: Path, client) -> AppTest:
    at = AppTest.from_file(str(path), default_timeout=30)
    at.session_state["lab_client"] = client
    return at.run()


def _button(at: AppTest, label: str):
    return next(b for b in at.button if b.label == label)


def test_home(lab_client):
    at = _app(ROOT / "lab" / "Home.py", lab_client)
    assert not at.exception
    assert any("JEV" == m.label for m in at.metric)


@pytest.mark.parametrize("game", ["Swipe", "This or that", "Craving radar", "Story"])
def test_games_page_plays_to_a_decision(lab_client, game):
    at = _app(PAGES / "1_Games.py", lab_client)
    game_box = next(s for s in at.selectbox if s.label == "Game")
    game_box.select(game).run()
    _button(at, "▶ Start").click().run()
    assert not at.exception
    for _ in range(12):
        if any(h.value == "Decision" for h in at.header):
            break
        answer = next(b for b in at.button if b.label not in ("▶ Start", "👎 Pass", "No") and not b.label.startswith("Replay"))
        answer.click().run()
        assert not at.exception, at.exception
    assert any(h.value == "Decision" for h in at.header)
    _button(at, "Replay with JEV off").click().run()
    assert not at.exception


def test_recommend_page(lab_client):
    at = _app(PAGES / "2_Recommend.py", lab_client)
    _button(at, "▶ Run").click().run()
    assert not at.exception
    _button(at, "↻ Get new picks").click().run()
    assert not at.exception


def test_food_graph_page(lab_client):
    at = _app(PAGES / "3_Food_Graph.py", lab_client)
    assert not at.exception and any(m.label == "Dishes" for m in at.metric)
    _button(at, "Map").click().run()
    assert not at.exception and at.dataframe


def test_jev_page_without_key_shows_an_error(lab_client):
    at = _app(PAGES / "4_JEV.py", lab_client)
    _button(at, "Ask JEV").click().run()
    assert not at.exception and any("JEV_API_KEY" in e.value for e in at.error)


def test_evals_and_swiggy_pages(lab_client):
    at = _app(PAGES / "5_Evals.py", lab_client)
    _button(at, "Run evals").click().run()
    assert not at.exception and any("pass" in s.value for s in at.success)
    at = _app(PAGES / "6_Swiggy.py", lab_client)
    assert not at.exception


def test_sidebar_address_picker(lab_client):
    from unittest.mock import patch

    from app.services import swiggy_mcp

    async def fake(self, name, arguments):
        return {"addresses": [{"id": "addr_home", "addressLine": "12 MG Road, Bengaluru", "phoneNumber": "9", "addressTag": "Home"}]}

    with patch.object(swiggy_mcp.SwiggyMCPClient, "_call_tool", fake), patch("app.services.swiggy_token.load_token", return_value="tok"):
        at = _app(PAGES / "6_Swiggy.py", lab_client)
        _button(at, "Load my Swiggy addresses").click().run()
    picker = next(s for s in at.selectbox if s.label == "Deliver to")
    assert picker.options[1].startswith("Home · 12 MG Road")
    picker.select(picker.options[1]).run()
    assert not at.exception and any("addr_home" in m.value for m in at.markdown)


def test_brain_page_imports_history(lab_client):
    from unittest.mock import patch

    from tests.test_history import FakeSwiggy

    with patch("app.services.swiggy_mcp.SwiggyMCPClient", return_value=FakeSwiggy()):
        at = _app(PAGES / "7_Brain.py", lab_client)
        _button(at, "Import my Swiggy history").click().run()
    assert not at.exception and any(m.label == "Mapped to catalog" for m in at.metric) and at.dataframe


def test_brain_page_groceries_tab(lab_client):
    from unittest.mock import patch

    from tests.test_groceries import FakeIM

    with patch("app.services.swiggy_mcp.SwiggyMCPClient", return_value=FakeIM()):
        at = _app(PAGES / "7_Brain.py", lab_client)
        _button(at, "Import my Instamart groceries").click().run()
    assert not at.exception and any(m.label == "Kitchen" for m in at.metric)


def test_brain_page_builds_the_brain(lab_client):
    from unittest.mock import patch

    from tests.test_groceries import FakeIM
    from tests.test_history import FakeSwiggy

    def client_for(token=None, mcp_url=None):
        return FakeIM() if mcp_url else FakeSwiggy()

    with patch("app.services.swiggy_mcp.SwiggyMCPClient", side_effect=client_for):
        at = _app(PAGES / "7_Brain.py", lab_client)
        _button(at, "Build my brain from Swiggy + Instamart").click().run()
    assert not at.exception and any(m.label == "Evidence (time-decayed)" for m in at.metric)


def test_stale_client_from_an_old_code_version_is_replaced(lab_client):
    class OldLabClient:  # what a session holds after the lab code reloads: not the current class
        def brain(self, user_id, slot=None, daytype=None):
            raise AssertionError("stale client used")

    at = AppTest.from_file(str(ROOT / "lab" / "Home.py"), default_timeout=30)
    at.session_state["lab_client"] = OldLabClient()
    at.run()
    assert isinstance(at.session_state["lab_client"], LabClient)


def test_suggested_page(lab_client):
    at = _app(PAGES / "8_Suggested.py", lab_client)
    _button(at, "✨ Suggest").click().run()
    assert not at.exception and any(m.label == "Suggestions logged" for m in at.metric)
