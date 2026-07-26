import pg from "pg";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Use SQLite for local dev, PostgreSQL for production
const usePostgres = process.env.DATABASE_URL || process.env.DB_HOST;

let db = null;
let dbInitialized = false;

// Initialize database (call this before using db)
export async function initDb() {
  if (dbInitialized) return db;

  if (usePostgres) {
    const { Pool } = pg;
    const isInternal = process.env.DATABASE_URL?.includes(".railway.internal");
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isInternal
        ? false
        : process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });
    console.log(
      "PostgreSQL pool created, connecting to:",
      isInternal ? "internal" : "external",
    );

    // Create tables if they don't exist (each statement separately for pg compatibility)
    try {
      await db.query(`CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        city VARCHAR(255) NOT NULL,
        cuisine VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        event_name VARCHAR(255) NOT NULL,
        properties JSONB DEFAULT '{}',
        user_agent TEXT,
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS quiz_completions (
        id SERIAL PRIMARY KEY,
        mood VARCHAR(50) NOT NULL,
        craving VARCHAR(50) NOT NULL,
        budget VARCHAR(50) NOT NULL,
        preference VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS order_clicks (
        id SERIAL PRIMARY KEY,
        dish_name VARCHAR(255) NOT NULL,
        dish_type VARCHAR(50) DEFAULT 'main',
        platform VARCHAR(50) DEFAULT 'swiggy',
        user_agent TEXT,
        ip_address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

      // Anonymous/lightweight MoodFood user sessions
      await db.query(`CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        phone VARCHAR(50) UNIQUE,
        name VARCHAR(255),
        password_hash TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

      // Add password_hash column to existing users (migration-safe)
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);

      // Personalization columns on users (migration-safe)
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS persona_archetype VARCHAR(100)`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS question_budget INTEGER DEFAULT 3`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS automation_pref VARCHAR(50) DEFAULT 'balanced'`);
      await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS comfort_anchors_json TEXT`);

      // Append-only personalization event log (the "signals spine")
      await db.query(`CREATE TABLE IF NOT EXISTS signals (
        id SERIAL PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(100) NOT NULL,
        payload_json TEXT NOT NULL,
        context_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_signals_user ON signals(user_id, id)`);

      // Durable mirror of the learned taste embedding (Python owns the live copy)
      await db.query(`CREATE TABLE IF NOT EXISTS taste_vector (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        embedding TEXT NOT NULL,
        dim INTEGER NOT NULL,
        model_version VARCHAR(100),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

      // Calibration loop: predicted vs actual enjoyment per recommendation
      await db.query(`CREATE TABLE IF NOT EXISTS predictions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rec_id VARCHAR(255) NOT NULL,
        dish_id VARCHAR(255),
        dish_name VARCHAR(255),
        predicted_score REAL,
        confidence REAL,
        user_predicted_score REAL,
        actual_score REAL,
        context_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id, resolved_at)`);

      // Durable mirror of the learned mood -> food-archetype map
      await db.query(`CREATE TABLE IF NOT EXISTS mood_food_map (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mood_key VARCHAR(100) NOT NULL,
        food_archetype VARCHAR(100) NOT NULL,
        weight REAL NOT NULL,
        n_obs INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, mood_key, food_archetype)
      )`);

      // Per-user food preferences
      await db.query(`CREATE TABLE IF NOT EXISTS user_preferences (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        diets TEXT DEFAULT '[]',
        allergies TEXT DEFAULT '[]',
        cuisines TEXT DEFAULT '[]',
        budget INTEGER DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

      // Per-user order history
      await db.query(`CREATE TABLE IF NOT EXISTS order_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        dish_name VARCHAR(255) NOT NULL,
        cuisine VARCHAR(100),
        emoji TEXT DEFAULT '🍽️',
        price_inr INTEGER DEFAULT 0,
        platform VARCHAR(50) DEFAULT 'swiggy',
        via VARCHAR(100),
        gradient_start VARCHAR(20) DEFAULT '#f97316',
        gradient_end VARCHAR(20) DEFAULT '#fbbf24',
        ordered BOOLEAN DEFAULT TRUE,
        saved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_order_history_user ON order_history(user_id)`);

      // Per-user in-app notifications
      await db.query(`CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) DEFAULT 'info',
        title VARCHAR(255) NOT NULL,
        body TEXT,
        data JSONB DEFAULT '{}',
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)`);

      // Encrypted per-user Swiggy OAuth tokens
      await db.query(`CREATE TABLE IF NOT EXISTS swiggy_user_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        swiggy_user_id VARCHAR(255) NOT NULL,
        access_token_encrypted TEXT NOT NULL,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, swiggy_user_id)
      )`);

      // Phase 3 — retention & social tables
      await db.query(`CREATE TABLE IF NOT EXISTS quests (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        definition_json TEXT DEFAULT '{}',
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS user_quests (
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
        progress_json TEXT DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'active',
        streak_count INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, quest_id)
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS campaigns (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        config_json TEXT DEFAULT '{}',
        starts_at TIMESTAMP,
        ends_at TIMESTAMP,
        active BOOLEAN DEFAULT TRUE
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS group_sessions (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) UNIQUE NOT NULL,
        host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) DEFAULT 'open',
        config_json TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.query(`CREATE TABLE IF NOT EXISTS group_members (
        group_id INTEGER NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
        member_key VARCHAR(100) NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        display_name VARCHAR(100),
        swipes_json TEXT DEFAULT '[]',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, member_key)
      )`);

      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name)`,
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at)`,
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at)`,
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_quiz_completions_created ON quiz_completions(created_at)`,
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_order_clicks_created ON order_clicks(created_at)`,
      );
      await db.query(
        `CREATE INDEX IF NOT EXISTS idx_order_clicks_dish ON order_clicks(dish_name)`,
      );
      console.log("PostgreSQL tables created/verified successfully");
    } catch (err) {
      console.error("Failed to create PostgreSQL tables:", err.message);
    }
  } else {
    // SQLite for local development
    db = await open({
      filename: "/tmp/moodfood.db", // Use /tmp for Railway compatibility
      driver: sqlite3.Database,
    });

    // Create tables if they don't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        city TEXT NOT NULL,
        cuisine TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_name TEXT NOT NULL,
        properties TEXT,
        user_agent TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS quiz_completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mood TEXT NOT NULL,
        craving TEXT NOT NULL,
        budget TEXT NOT NULL,
        preference TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dish_name TEXT NOT NULL,
        dish_type TEXT DEFAULT 'main',
        platform TEXT DEFAULT 'swiggy',
        user_agent TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        session_id TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        phone TEXT UNIQUE,
        name TEXT,
        password_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        diets TEXT DEFAULT '[]',
        allergies TEXT DEFAULT '[]',
        cuisines TEXT DEFAULT '[]',
        budget INTEGER DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS order_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        dish_name TEXT NOT NULL,
        cuisine TEXT,
        emoji TEXT DEFAULT '🍽️',
        price_inr INTEGER DEFAULT 0,
        platform TEXT DEFAULT 'swiggy',
        via TEXT,
        gradient_start TEXT DEFAULT '#f97316',
        gradient_end TEXT DEFAULT '#fbbf24',
        ordered INTEGER DEFAULT 1,
        saved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_order_history_user ON order_history(user_id);

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT DEFAULT 'info',
        title TEXT NOT NULL,
        body TEXT,
        data TEXT DEFAULT '{}',
        read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

      CREATE TABLE IF NOT EXISTS swiggy_user_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        swiggy_user_id TEXT NOT NULL,
        access_token_encrypted TEXT NOT NULL,
        expires_at DATETIME,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, swiggy_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_order_clicks_created ON order_clicks(created_at);
      CREATE INDEX IF NOT EXISTS idx_order_clicks_dish ON order_clicks(dish_name);

      CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        context_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_signals_user ON signals(user_id, id);

      CREATE TABLE IF NOT EXISTS taste_vector (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        embedding TEXT NOT NULL,
        dim INTEGER NOT NULL,
        model_version TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS predictions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rec_id TEXT NOT NULL,
        dish_id TEXT,
        dish_name TEXT,
        predicted_score REAL,
        confidence REAL,
        user_predicted_score REAL,
        actual_score REAL,
        context_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME
      );

      CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id, resolved_at);

      CREATE TABLE IF NOT EXISTS mood_food_map (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mood_key TEXT NOT NULL,
        food_archetype TEXT NOT NULL,
        weight REAL NOT NULL,
        n_obs INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, mood_key, food_archetype)
      );

      CREATE TABLE IF NOT EXISTS quests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        definition_json TEXT DEFAULT '{}',
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_quests (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
        progress_json TEXT DEFAULT '{}',
        status TEXT DEFAULT 'active',
        streak_count INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, quest_id)
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        config_json TEXT DEFAULT '{}',
        starts_at DATETIME,
        ends_at DATETIME,
        active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS group_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        host_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        status TEXT DEFAULT 'open',
        config_json TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS group_members (
        group_id INTEGER NOT NULL REFERENCES group_sessions(id) ON DELETE CASCADE,
        member_key TEXT NOT NULL,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        display_name TEXT,
        swipes_json TEXT DEFAULT '[]',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, member_key)
      );
    `);

    // Migration-safe column additions for existing databases
    const sqliteMigrations = [
      "ALTER TABLE users ADD COLUMN password_hash TEXT",
      "ALTER TABLE users ADD COLUMN persona_archetype TEXT",
      "ALTER TABLE users ADD COLUMN question_budget INTEGER DEFAULT 3",
      "ALTER TABLE users ADD COLUMN automation_pref TEXT DEFAULT 'balanced'",
      "ALTER TABLE users ADD COLUMN comfort_anchors_json TEXT",
    ];
    for (const migration of sqliteMigrations) {
      try {
        await db.run(migration);
      } catch {
        // Column already exists
      }
    }
  }

  dbInitialized = true;
  return db;
}

// Get database instance (call initDb first)
export function getDb() {
  return db;
}

// Check if using PostgreSQL
export function isPostgres() {
  return usePostgres;
}

export default { initDb, getDb, isPostgres };
