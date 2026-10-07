-- Learned per-user state (rebuildable from the API's signals log) plus the
-- embedding caches. Lives in the schema named by DATABASE_SCHEMA (default
-- "intelligence"), separate from the Drizzle-managed public schema.

-- In public so per-schema drops (tests, rebuilds) never drop the extension.
CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;

CREATE TABLE IF NOT EXISTS user_vectors (
    user_id TEXT PRIMARY KEY,
    positive_json TEXT NOT NULL,
    negative_json TEXT NOT NULL,
    n_events INTEGER NOT NULL DEFAULT 0,
    model_version TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_mood_map (
    user_id TEXT NOT NULL,
    mood_key TEXT NOT NULL,
    food_archetype TEXT NOT NULL,
    score_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
    n_obs INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, mood_key, food_archetype)
);

CREATE TABLE IF NOT EXISTS tradeoff_weights (
    user_id TEXT NOT NULL,
    context_bucket TEXT NOT NULL,
    dimension TEXT NOT NULL,
    theta DOUBLE PRECISION NOT NULL DEFAULT 0,
    n_duels INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, context_bucket, dimension)
);

CREATE TABLE IF NOT EXISTS calibration_stats (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS personas (
    user_id TEXT PRIMARY KEY,
    archetype TEXT,
    blurb TEXT,
    drift_line TEXT,
    features_json TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_stats (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS signal_cursor (
    user_id TEXT PRIMARY KEY,
    last_signal_id BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mood_checkins (
    user_id TEXT NOT NULL,
    signal_id BIGINT NOT NULL,
    energy INTEGER, stress INTEGER, hunger INTEGER, social INTEGER,
    day TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, signal_id)
);

CREATE TABLE IF NOT EXISTS recent_picks (
    user_id TEXT NOT NULL,
    signal_id BIGINT NOT NULL,
    dish_id TEXT,
    archetype TEXT,
    kind TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, signal_id)
);

-- Embedding caches (replace app/data/dish_embeddings.npz and the anchors JSON).
CREATE TABLE IF NOT EXISTS dish_embeddings (
    dish_id TEXT NOT NULL,
    model_version TEXT NOT NULL,
    dishes_hash TEXT NOT NULL,
    embedding vector NOT NULL,
    PRIMARY KEY (dish_id, model_version)
);

CREATE TABLE IF NOT EXISTS text_embeddings (
    key TEXT PRIMARY KEY,
    embedding vector NOT NULL
);

-- One row per recommendation request: what we considered, chose and why.
-- Outcomes join to public.signals / public.predictions on request_id.
CREATE TABLE IF NOT EXISTS recommendation_runs (
    request_id TEXT PRIMARY KEY,
    user_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
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
CREATE INDEX IF NOT EXISTS recommendation_runs_user_created ON recommendation_runs (user_id, created_at);
