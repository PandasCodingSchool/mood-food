"""Model store for learned per-user state: SQLite (default) or Postgres.

This store is a *rebuildable cache* over the API's durable append-only
``signals`` log. Every learner must be a pure fold over ordered signals so that
wiping the store and replaying reproduces identical state.

Backends share one SQL dialect: callers write portable SQL with ``?``
placeholders and ``ON CONFLICT ... excluded.`` upserts. Set ``DATABASE_URL``
to use Postgres (schema ``DATABASE_SCHEMA``, migrations in app/db/migrations);
otherwise the SQLite file at ``MODEL_STORE_PATH`` is used.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
from pathlib import Path
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

CREATE TABLE IF NOT EXISTS dish_embeddings (
    dish_id TEXT NOT NULL,
    model_version TEXT NOT NULL,
    dishes_hash TEXT NOT NULL,
    embedding TEXT NOT NULL,          -- JSON array (pgvector `vector` in Postgres)
    PRIMARY KEY (dish_id, model_version)
);

CREATE TABLE IF NOT EXISTS text_embeddings (
    key TEXT PRIMARY KEY,
    embedding TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_item_map (
    item_key TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    dish_id TEXT,
    confidence REAL NOT NULL,
    method TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_profiles (
    item_key TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    method TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    game TEXT NOT NULL,
    status TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommendation_runs (
    request_id TEXT PRIMARY KEY,
    user_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    mode TEXT,
    ranker_provider TEXT,
    model TEXT,
    shortlist_json TEXT,
    ranked_json TEXT,
    selected_json TEXT,
    fallback_used BOOLEAN,
    cache_hit BOOLEAN,
    live_status TEXT,
    latency_json TEXT,
    tokens INTEGER,
    shadow_json TEXT
);
"""

_lock = threading.Lock()
# The active backend; tests reset it to None to re-read settings.
_conn: Optional["_Backend"] = None

_MIGRATIONS = Path(__file__).resolve().parents[1] / "db" / "migrations"
# Tables holding learned per-user state (what reset_store clears).
_STATE_TABLES = (
    "user_vectors", "user_mood_map", "tradeoff_weights", "calibration_stats", "personas",
    "usage_stats", "signal_cursor", "mood_checkins", "recent_picks",
)


class Row(tuple):
    """Tuple that also supports ``row["column"]``, like ``sqlite3.Row``."""

    _keys: tuple[str, ...] = ()

    def __new__(cls, values, keys):
        row = super().__new__(cls, values)
        row._keys = keys
        return row

    def __getitem__(self, key):
        if isinstance(key, str):
            return tuple.__getitem__(self, self._keys.index(key))
        return tuple.__getitem__(self, key)

    def keys(self) -> tuple[str, ...]:
        return self._keys


class _Backend:
    def execute(self, sql: str, params: tuple = ()) -> None: ...
    def executemany(self, sql: str, rows: list[tuple]) -> None: ...
    def fetchone(self, sql: str, params: tuple = ()) -> Optional[Any]: ...
    def fetchall(self, sql: str, params: tuple = ()) -> list[Any]: ...
    def close(self) -> None: ...


class _SQLite(_Backend):
    def __init__(self, path: str):
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)
        self.conn.commit()

    def execute(self, sql, params=()):
        with _lock:
            self.conn.execute(sql, params)
            self.conn.commit()

    def executemany(self, sql, rows):
        with _lock:
            self.conn.executemany(sql, rows)
            self.conn.commit()

    def fetchone(self, sql, params=()):
        with _lock:
            return self.conn.execute(sql, params).fetchone()

    def fetchall(self, sql, params=()):
        with _lock:
            return self.conn.execute(sql, params).fetchall()

    def close(self):
        self.conn.close()


_PLACEHOLDER = re.compile(r"\?")


def _pg_sql(sql: str) -> str:
    """``?`` placeholders → psycopg ``%s`` (literal ``%`` escaped first)."""
    return _PLACEHOLDER.sub("%s", sql.replace("%", "%%"))


def _row_factory(cursor):
    keys = tuple(c.name for c in cursor.description or ())
    return lambda values: Row(values, keys)


class _Postgres(_Backend):
    def __init__(self, url: str, schema: str):
        from psycopg_pool import ConnectionPool

        if not re.fullmatch(r"[a-z_][a-z0-9_]*", schema):
            raise ValueError(f"invalid DATABASE_SCHEMA {schema!r}")
        self.schema = schema
        self.pool = ConnectionPool(
            url,
            min_size=1,
            max_size=settings.database_pool_max,
            kwargs={"options": f"-c search_path={schema},public", "autocommit": True},
            open=True,
        )
        self._migrate()

    def _migrate(self) -> None:
        with self.pool.connection() as conn:
            conn.execute(f'CREATE SCHEMA IF NOT EXISTS "{self.schema}"')
            conn.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())"
            )
            done = {r[0] for r in conn.execute("SELECT version FROM schema_migrations").fetchall()}
            for path in sorted(_MIGRATIONS.glob("*.sql")):
                if path.stem in done:
                    continue
                with conn.transaction():
                    conn.execute(path.read_text())
                    conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (path.stem,))

    def execute(self, sql, params=()):
        with self.pool.connection() as conn:
            conn.execute(_pg_sql(sql), params)

    def executemany(self, sql, rows):
        with self.pool.connection() as conn, conn.cursor() as cur:
            cur.executemany(_pg_sql(sql), rows)

    def fetchone(self, sql, params=()):
        with self.pool.connection() as conn, conn.cursor(row_factory=_row_factory) as cur:
            return cur.execute(_pg_sql(sql), params).fetchone()

    def fetchall(self, sql, params=()):
        with self.pool.connection() as conn, conn.cursor(row_factory=_row_factory) as cur:
            return cur.execute(_pg_sql(sql), params).fetchall()

    def close(self):
        self.pool.close()


def get_conn() -> _Backend:
    global _conn
    with _lock:
        if _conn is None:
            _conn = (
                _Postgres(settings.database_url, settings.database_schema)
                if settings.database_url
                else _SQLite(settings.model_store_path)
            )
        return _conn


def backend_name() -> str:
    return "postgres" if isinstance(get_conn(), _Postgres) else "sqlite"


def close() -> None:
    global _conn
    with _lock:
        if _conn is not None:
            _conn.close()
            _conn = None


def reset_store() -> None:
    """Drop all learned state (used by replay drills and tests)."""
    backend = get_conn()
    for table in _STATE_TABLES:
        backend.execute(f"DELETE FROM {table}")


def execute(sql: str, params: tuple = ()) -> None:
    get_conn().execute(sql, params)


def executemany(sql: str, rows: list[tuple]) -> None:
    get_conn().executemany(sql, rows)


def fetchone(sql: str, params: tuple = ()) -> Optional[Any]:
    return get_conn().fetchone(sql, params)


def fetchall(sql: str, params: tuple = ()) -> list[Any]:
    return get_conn().fetchall(sql, params)


# --- Convenience accessors -------------------------------------------------

def get_cursor(user_id: str) -> int:
    row = fetchone("SELECT last_signal_id FROM signal_cursor WHERE user_id = ?", (user_id,))
    return int(row["last_signal_id"]) if row else 0


def set_cursor(user_id: str, signal_id: int) -> None:
    execute(
        """INSERT INTO signal_cursor (user_id, last_signal_id, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(user_id) DO UPDATE SET
             last_signal_id = CASE
               WHEN excluded.last_signal_id > signal_cursor.last_signal_id
               THEN excluded.last_signal_id ELSE signal_cursor.last_signal_id END,
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
