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
    db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    });
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
