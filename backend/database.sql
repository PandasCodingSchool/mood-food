-- MoodFood Database Schema

-- Waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  city VARCHAR(255) NOT NULL,
  cuisine VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics events table
CREATE TABLE IF NOT EXISTS analytics_events (
  id SERIAL PRIMARY KEY,
  event_name VARCHAR(255) NOT NULL,
  properties JSONB DEFAULT '{}',
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quiz completions table
CREATE TABLE IF NOT EXISTS quiz_completions (
  id SERIAL PRIMARY KEY,
  mood VARCHAR(50) NOT NULL,
  craving VARCHAR(50) NOT NULL,
  budget VARCHAR(50) NOT NULL,
  preference VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DIY cooking sessions (recipe + ingredient cart + step progress + wall photo)
-- NOTE: the tables actually created at boot live in db.js (Postgres + SQLite
-- branches) — this file is reference documentation only, not executed.
CREATE TABLE IF NOT EXISTS diy_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dish_name VARCHAR(255) NOT NULL,
  recipe JSONB NOT NULL,
  ingredient_cart JSONB NOT NULL DEFAULT '[]',
  matched_products JSONB NOT NULL DEFAULT '[]',
  completed_steps INTEGER[] NOT NULL DEFAULT '{}',
  instamart_order_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'cart',
  wall_photo_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at);
CREATE INDEX IF NOT EXISTS idx_quiz_completions_created ON quiz_completions(created_at);
CREATE INDEX IF NOT EXISTS idx_diy_sessions_user ON diy_sessions(user_id);
