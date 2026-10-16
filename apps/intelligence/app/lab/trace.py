"""Decision tracing for the Intelligence Lab.

Code at each decision point calls ``emit(kind, **data)``. Outside a
``collect()`` block (every production request) that is a no-op; inside one,
events are appended to a per-request list held in a ContextVar, so concurrent
requests never mix. Guard costly diagnostics with ``enabled()``.

Events must be JSON-safe and never carry tokens or other secrets.
"""

from __future__ import annotations

import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator, Optional

_events: ContextVar[Optional[list[dict[str, Any]]]] = ContextVar("lab_trace", default=None)
_start: ContextVar[float] = ContextVar("lab_trace_start", default=0.0)


def enabled() -> bool:
    return _events.get() is not None


def emit(kind: str, **data: Any) -> None:
    events = _events.get()
    if events is None:
        return
    events.append({"kind": kind, "t_ms": round((time.perf_counter() - _start.get()) * 1000, 1), **data})


@contextmanager
def collect() -> Iterator[list[dict[str, Any]]]:
    """Collect every event emitted in this context (including awaited tasks it starts)."""
    events: list[dict[str, Any]] = []
    tok_e, tok_s = _events.set(events), _start.set(time.perf_counter())
    try:
        yield events
    finally:
        _events.reset(tok_e)
        _start.reset(tok_s)


def r(x: float, n: int = 4) -> float:
    """Round for display."""
    return round(float(x), n)
