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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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
    `);
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
