"""HTTP client for the intelligence service's lab API (/api/lab/*).

The lab UI talks to the running service over HTTP — the same code paths
mobile and site use — and gets each decision back with its trace.
"""

from __future__ import annotations

import os
import uuid
from typing import Any, Optional

import httpx

TIMEOUT_S = 90.0  # a game's final answer may run live Swiggy matching


class LabError(RuntimeError):
    pass


class LabClient:
    def __init__(self, base_url: Optional[str] = None, service_key: Optional[str] = None):
        self.base_url = (base_url or os.getenv("LAB_API_URL", "http://localhost:8010")).rstrip("/")
        key = service_key if service_key is not None else os.getenv("AI_SERVICE_KEY", "")
        self.headers = {"Authorization": f"Bearer {key}"} if key else {}

    def _call(self, method: str, path: str, *, json: Any = None, params: Optional[dict] = None) -> Any:
        try:
            res = httpx.request(method, self.base_url + path, json=json, params=params,
                                headers={**self.headers, "X-Request-Id": f"lab-{uuid.uuid4().hex[:12]}"}, timeout=TIMEOUT_S)
        except httpx.HTTPError as exc:
            raise LabError(f"Can't reach the intelligence service at {self.base_url} ({type(exc).__name__}). "
                           "Start it with scripts/lab.sh.") from exc
        if res.status_code == 404 and path.startswith("/api/lab"):
            raise LabError("Lab routes are off. Set LAB_ENABLED=true in apps/intelligence/.env and restart the service.")
        if res.status_code >= 400:
            try:
                detail = res.json().get("detail", res.text)
            except ValueError:
                detail = res.text
            raise LabError(f"{res.status_code}: {detail}")
        return res.json()

    def health(self) -> dict:
        return self._call("GET", "/api/lab/health")

    def game_start(self, user_context: dict, game: Optional[str], *, user_id: Optional[str] = None, count: int = 3,
                   max_steps: Optional[int] = None, swiggy_address_id: Optional[str] = None) -> dict:
        body = {"user_context": user_context, "game": game, "user_id": user_id, "count": count,
                "max_steps": max_steps, "swiggy_address_id": swiggy_address_id}
        return self._call("POST", "/api/lab/games/session", json={k: v for k, v in body.items() if v is not None})

    def game_answer(self, session_id: str, answer: dict, *, reaction_ms: Optional[int] = None, jev: bool = True) -> dict:
        body = {"answer": answer, **({"reaction_ms": reaction_ms} if reaction_ms is not None else {})}
        return self._call("POST", f"/api/lab/games/session/{session_id}/answer", json=body, params={"jev": str(jev).lower()})

    def recommend(self, request: dict, *, jev: bool = True) -> dict:
        return self._call("POST", "/api/lab/recommend", json=request, params={"jev": str(jev).lower()})

    def map_items(self, items: list[str], is_veg: Optional[bool] = None) -> dict:
        return self._call("POST", "/api/lab/map-items", json={"items": items, "is_veg": is_veg})

    def jev(self, state: Any, questions: dict, timeout_s: Optional[float] = None) -> dict:
        return self._call("POST", "/api/lab/jev", json={"state": state, "questions": questions, "timeout_s": timeout_s})

    def catalog(self, q: str = "", limit: int = 50, full: bool = False) -> dict:
        return self._call("GET", "/api/lab/catalog", params={"q": q, "limit": limit, "full": str(full).lower()})

    def food_graph_summary(self) -> dict:
        return self._call("GET", "/api/lab/food-graph/summary")

    def dish(self, dish_id: str) -> dict:
        return self._call("GET", f"/api/lab/catalog/{dish_id}")

    def swiggy_addresses(self) -> dict:
        return self._call("GET", "/api/lab/swiggy/addresses")

    def evals(self) -> dict:
        return self._call("POST", "/api/lab/evals")
