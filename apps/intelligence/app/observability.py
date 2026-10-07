"""Request ids, structured logs and per-call timing for every external model call."""

from __future__ import annotations

import contextvars
import json
import logging
import time
from contextlib import contextmanager
from typing import Any, Iterator, Optional

request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("request_id", default=None)

_calls = logging.getLogger("calls")


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get() or "-"
        return True


class JsonFormatter(logging.Formatter):
    """One JSON object per line; extra fields passed via ``extra={"fields": {...}}``."""

    def format(self, record: logging.LogRecord) -> str:
        out: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "msg": record.getMessage(),
        }
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            out.update(fields)
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str)


def configure_logging(level: str, json_logs: bool) -> None:
    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(
        JsonFormatter()
        if json_logs
        else logging.Formatter("%(asctime)s %(levelname)s %(name)s [%(request_id)s]: %(message)s")
    )
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)


@contextmanager
def timed_call(kind: str, provider: str, model: str) -> Iterator[dict]:
    """Log latency/outcome of one external call; callers may add fields (tokens…)."""
    fields: dict[str, Any] = {"kind": kind, "provider": provider, "model": model}
    start = time.perf_counter()
    try:
        yield fields
        fields.setdefault("ok", True)
    except BaseException as exc:
        fields["ok"] = False
        fields["error"] = type(exc).__name__
        raise
    finally:
        fields["latency_ms"] = round((time.perf_counter() - start) * 1000, 1)
        _calls.info("%s %s %s", provider, kind, "ok" if fields.get("ok") else "failed", extra={"fields": fields})
