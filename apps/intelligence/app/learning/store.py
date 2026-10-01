"""SQLite model store for learned per-user state.

This store is a *rebuildable cache* over the Node backend's durable
append-only ``signals`` log. Every learner must be a pure fold over ordered
signals so that wiping this file and replaying reproduces identical state.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any, Optional

from app.config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS user_vectors (
    user_id TEXT PRIMARY KEY,
    positive_json TEXT NOT NULL,
    negative_json TEXT NOT NULL,
    n_events INTEGER NOT NULL DEFAULT 0,
    model_version TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_mood_map (
    user_id TEXT NOT NULL,
    mood_key TEXT NOT NULL,
    food_archetype TEXT NOT NULL,
    score_sum REAL NOT NULL DEFAULT 0,
    n_obs INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, mood_key, food_archetype)
);

CREATE TABLE IF NOT EXISTS tradeoff_weights (
    user_id TEXT NOT NULL,
    context_bucket TEXT NOT NULL,
    dimension TEXT NOT NULL,
    theta REAL NOT NULL DEFAULT 0,
    n_duels INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, context_bucket, dimension)
);

CREATE TABLE IF NOT EXISTS calibration_stats (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,               -- e.g. 'rolling_accuracy', 'band_0.8', 'cuisine_italian'
    value_json TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS personas (
    user_id TEXT PRIMARY KEY,
    archetype TEXT,
    blurb TEXT,
    drift_line TEXT,
    features_json TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usage_stats (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,               -- e.g. 'sos_count', 'n_signals', 'signals_by_type'
    value_json TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS signal_cursor (
    user_id TEXT PRIMARY KEY,
    last_signal_id INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mood_checkins (
    user_id TEXT NOT NULL,
    signal_id INTEGER NOT NULL,
    energy INTEGER, stress INTEGER, hunger INTEGER, social INTEGER,
    day TEXT,                        -- YYYY-MM-DD, for once-a-day gating
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, signal_id)
);

CREATE TABLE IF NOT EXISTS recent_picks (
    user_id TEXT NOT NULL,
    signal_id INTEGER NOT NULL,
    dish_id TEXT,
    archetype TEXT,
    kind TEXT,                        -- 'order' | 'post_meal' | 'like'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, signal_id)
);
"""

_lock = threading.Lock()
_conn: Optional[sqlite3.Connection] = None


def get_conn() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            _conn = sqlite3.connect(settings.model_store_path, check_same_thread=False)
            _conn.row_factory = sqlite3.Row
            _conn.executescript(_SCHEMA)
            _conn.commit()
        return _conn


def reset_store() -> None:
    """Drop all learned state (used by replay drills and tests)."""
    conn = get_conn()
    with _lock:
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall():
            conn.execute(f"DELETE FROM {row['name']}")
        conn.commit()


def execute(sql: str, params: tuple = ()) -> None:
    conn = get_conn()
    with _lock:
        conn.execute(sql, params)
        conn.commit()


def executemany(sql: str, rows: list[tuple]) -> None:
    conn = get_conn()
    with _lock:
        conn.executemany(sql, rows)
        conn.commit()


def fetchone(sql: str, params: tuple = ()) -> Optional[sqlite3.Row]:
    return get_conn().execute(sql, params).fetchone()


def fetchall(sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    return get_conn().execute(sql, params).fetchall()


# --- Convenience accessors -------------------------------------------------

def get_cursor(user_id: str) -> int:
    row = fetchone("SELECT last_signal_id FROM signal_cursor WHERE user_id = ?", (user_id,))
    return int(row["last_signal_id"]) if row else 0


def set_cursor(user_id: str, signal_id: int) -> None:
    execute(
        """INSERT INTO signal_cursor (user_id, last_signal_id, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET
             last_signal_id = MAX(last_signal_id, excluded.last_signal_id),
             updated_at = CURRENT_TIMESTAMP""",
        (user_id, signal_id),
    )


def get_usage(user_id: str, key: str, default: Any = None) -> Any:
    row = fetchone(
        "SELECT value_json FROM usage_stats WHERE user_id = ? AND key = ?",
        (user_id, key),
    )
    return json.loads(row["value_json"]) if row else default


def set_usage(user_id: str, key: str, value: Any) -> None:
    execute(
        """INSERT INTO usage_stats (user_id, key, value_json, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id, key) DO UPDATE SET
             value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP""",
        (user_id, key, json.dumps(value)),
    )


def get_calibration(user_id: str, key: str, default: Any = None) -> Any:
    row = fetchone(
        "SELECT value_json FROM calibration_stats WHERE user_id = ? AND key = ?",
        (user_id, key),
    )
    return json.loads(row["value_json"]) if row else default


def set_calibration(user_id: str, key: str, value: Any) -> None:
    execute(
        """INSERT INTO calibration_stats (user_id, key, value_json, updated_at)
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id, key) DO UPDATE SET
             value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP""",
        (user_id, key, json.dumps(value)),
    )


def known_user(user_id: str) -> bool:
    return fetchone("SELECT 1 FROM signal_cursor WHERE user_id = ?", (user_id,)) is not None
