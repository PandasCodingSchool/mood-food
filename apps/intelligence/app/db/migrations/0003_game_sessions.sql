-- Server-driven adaptive game sessions (anonymous allowed: user_id NULL).
CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    game TEXT NOT NULL,
    status TEXT NOT NULL,           -- active | done
    state_json TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_sessions_user ON game_sessions (user_id, created_at);
