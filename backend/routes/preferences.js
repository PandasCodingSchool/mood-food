import { Router } from "express";
import { getDb, isPostgres } from "../db.js";

const router = Router();

function parseJsonArray(val) {
  if (Array.isArray(val)) return val;
  try {
    const parsed = JSON.parse(val || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getUserIdFromSession(sessionId) {
  const db = getDb();
  const pg = isPostgres();
  const sql = pg
    ? "SELECT id FROM users WHERE session_id = $1 LIMIT 1"
    : "SELECT id FROM users WHERE session_id = ? LIMIT 1";
  const result = pg
    ? await db.query(sql, [sessionId])
    : await db.get(sql, [sessionId]);
  const row = pg ? result.rows[0] : result;
  return row?.id || null;
}

async function getPrefs(userId) {
  const db = getDb();
  const pg = isPostgres();
  const sql = pg
    ? "SELECT * FROM user_preferences WHERE user_id = $1 LIMIT 1"
    : "SELECT * FROM user_preferences WHERE user_id = ? LIMIT 1";
  const result = pg
    ? await db.query(sql, [userId])
    : await db.get(sql, [userId]);
  const row = pg ? result.rows[0] : result;
  if (!row) {
    return { diets: [], allergies: [], cuisines: [], budget: 1 };
  }
  return {
    diets: parseJsonArray(row.diets),
    allergies: parseJsonArray(row.allergies),
    cuisines: parseJsonArray(row.cuisines),
    budget: row.budget ?? 1,
  };
}

// GET /api/user/preferences
router.get("/", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.user?.sessionId;
    if (!sessionId) return res.status(401).json({ error: "No session" });

    const userId = await getUserIdFromSession(sessionId);
    if (!userId) return res.status(401).json({ error: "User not found" });

    const prefs = await getPrefs(userId);
    return res.json({ success: true, preferences: prefs });
  } catch (err) {
    console.error("GET /preferences error:", err);
    return res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

// PUT /api/user/preferences
router.put("/", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.user?.sessionId;
    if (!sessionId) return res.status(401).json({ error: "No session" });

    const userId = await getUserIdFromSession(sessionId);
    if (!userId) return res.status(401).json({ error: "User not found" });

    const { diets, allergies, cuisines, budget } = req.body || {};

    const dietsJson = JSON.stringify(Array.isArray(diets) ? diets : []);
    const allergiesJson = JSON.stringify(Array.isArray(allergies) ? allergies : []);
    const cuisinesJson = JSON.stringify(Array.isArray(cuisines) ? cuisines : []);
    const budgetVal = typeof budget === "number" ? budget : 1;

    const db = getDb();
    const pg = isPostgres();

    if (pg) {
      await db.query(
        `INSERT INTO user_preferences (user_id, diets, allergies, cuisines, budget, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE
           SET diets = EXCLUDED.diets,
               allergies = EXCLUDED.allergies,
               cuisines = EXCLUDED.cuisines,
               budget = EXCLUDED.budget,
               updated_at = CURRENT_TIMESTAMP`,
        [userId, dietsJson, allergiesJson, cuisinesJson, budgetVal],
      );
    } else {
      await db.run(
        `INSERT INTO user_preferences (user_id, diets, allergies, cuisines, budget, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(user_id) DO UPDATE
           SET diets = excluded.diets,
               allergies = excluded.allergies,
               cuisines = excluded.cuisines,
               budget = excluded.budget,
               updated_at = CURRENT_TIMESTAMP`,
        [userId, dietsJson, allergiesJson, cuisinesJson, budgetVal],
      );
    }

    const prefs = await getPrefs(userId);
    return res.json({ success: true, preferences: prefs });
  } catch (err) {
    console.error("PUT /preferences error:", err);
    return res.status(500).json({ error: "Failed to save preferences" });
  }
});

export default router;
