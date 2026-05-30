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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at);
CREATE INDEX IF NOT EXISTS idx_quiz_completions_created ON quiz_completions(created_at);
