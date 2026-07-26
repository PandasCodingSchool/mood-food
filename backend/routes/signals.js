import { Router } from "express";
import { getDb, isPostgres } from "../db.js";
import { resolveUserId } from "../middleware/session.js";
import {
  forwardSignals,
  fetchLearnedProfile,
  verifySyncKey,
} from "../lib/intelligenceClient.js";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY;

const router = Router();

const MAX_BATCH = 50;
const KNOWN_TYPES = new Set([
  "mood_checkin",
  "swipe",
  "this_or_that",
  "post_meal",
  "veto",
  "craving",
  "occasion",
  "mind_reader_verdict",
  "wildcard_verdict",
  "sos",
  "day_story",
  "bracket",
  "group_swipe",
  "nostalgia",
  "hunger",
  "pantry",
  "blind_bet",
  "quest_event",
  "game_signals",
  "order",
]);

// Server-side context stamped on every signal at write time (strategy 3.2).
async function buildServerContext(userId, clientContext) {
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay =
    hour < 11 ? "breakfast" : hour < 16 ? "lunch" : hour < 22 ? "dinner" : "late_night";

  let hoursSinceLastMeal = null;
  try {
    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? `SELECT created_at FROM order_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`
      : `SELECT created_at FROM order_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`;
    const result = pg ? await db.query(sql, [userId]) : await db.get(sql, [userId]);
    const row = pg ? result.rows[0] : result;
    if (row?.created_at) {
      hoursSinceLastMeal =
        Math.round(((now - new Date(row.created_at)) / 36e5) * 10) / 10;
    }
  } catch {
    // context enrichment is best-effort
  }

  return {
    ...clientContext,
    time_of_day: timeOfDay,
    day_of_week: now.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase(),
    is_weekend: [0, 6].includes(now.getDay()),
    hour,
    ...(hoursSinceLastMeal != null && { hours_since_last_meal: hoursSinceLastMeal }),
    server_ts: now.toISOString(),
  };
}

async function mirrorTasteVector(userId, tasteVector) {
  if (!tasteVector?.embedding) return;
  const db = getDb();
  const pg = isPostgres();
  const embedding = JSON.stringify(tasteVector.embedding);
  const dim = tasteVector.dim ?? tasteVector.embedding.length;
  const version = tasteVector.model_version || null;
  if (pg) {
    await db.query(
      `INSERT INTO taste_vector (user_id, embedding, dim, model_version, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         embedding = EXCLUDED.embedding, dim = EXCLUDED.dim,
         model_version = EXCLUDED.model_version, updated_at = CURRENT_TIMESTAMP`,
      [userId, embedding, dim, version],
    );
  } else {
    await db.run(
      `INSERT INTO taste_vector (user_id, embedding, dim, model_version, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         embedding = excluded.embedding, dim = excluded.dim,
         model_version = excluded.model_version, updated_at = CURRENT_TIMESTAMP`,
      [userId, embedding, dim, version],
    );
  }
}

async function syncProfileColumns(userId, profileSummary) {
  if (!profileSummary) return;
  const fields = [];
  const values = [];
  const pg = isPostgres();
  let idx = 1;
  if (profileSummary.persona_archetype) {
    fields.push(pg ? `persona_archetype = $${idx++}` : "persona_archetype = ?");
    values.push(profileSummary.persona_archetype);
  }
  if (profileSummary.question_budget != null) {
    fields.push(pg ? `question_budget = $${idx++}` : "question_budget = ?");
    values.push(profileSummary.question_budget);
  }
  if (!fields.length) return;
  values.push(userId);
  const db = getDb();
  const sql = `UPDATE users SET ${fields.join(", ")} WHERE id = ${pg ? `$${idx}` : "?"}`;
  if (pg) await db.query(sql, values);
  else await db.run(sql, values);
}

// POST /api/signals — append a batch of personalization events
router.post("/", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const incoming = Array.isArray(req.body?.signals) ? req.body.signals : null;
    if (!incoming || incoming.length === 0) {
      return res.status(400).json({ error: "signals (non-empty array) is required" });
    }
    if (incoming.length > MAX_BATCH) {
      return res.status(400).json({ error: `Max ${MAX_BATCH} signals per batch` });
    }

    const valid = incoming.filter(
      (s) => s && typeof s.type === "string" && KNOWN_TYPES.has(s.type) && s.payload != null,
    );
    if (valid.length === 0) {
      return res.status(400).json({ error: "No valid signals in batch" });
    }

    const db = getDb();
    const pg = isPostgres();
    const stored = [];

    for (const signal of valid) {
      const context = await buildServerContext(userId, signal.context || {});
      const payloadJson = JSON.stringify(signal.payload);
      const contextJson = JSON.stringify(context);
      let id;
      if (pg) {
        const result = await db.query(
          `INSERT INTO signals (user_id, type, payload_json, context_json)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [userId, signal.type, payloadJson, contextJson],
        );
        id = result.rows[0].id;
      } else {
        const result = await db.run(
          `INSERT INTO signals (user_id, type, payload_json, context_json) VALUES (?, ?, ?, ?)`,
          [userId, signal.type, payloadJson, contextJson],
        );
        id = result.lastID;
      }
      stored.push({ id, type: signal.type, payload: signal.payload, context });
    }

    // Best-effort forward to the learning service; replay covers failures.
    const learnResult = await forwardSignals(userId, stored);
    if (learnResult?.taste_vector) {
      await mirrorTasteVector(userId, learnResult.taste_vector).catch((err) =>
        console.warn("taste_vector mirror failed:", err.message),
      );
    }
    if (learnResult?.profile_summary) {
      await syncProfileColumns(userId, learnResult.profile_summary).catch((err) =>
        console.warn("profile column sync failed:", err.message),
      );
    }

    return res.status(201).json({
      success: true,
      stored: stored.length,
      ...(learnResult?.profile_summary && { profile: learnResult.profile_summary }),
    });
  } catch (err) {
    console.error("POST /signals error:", err);
    return res.status(500).json({ error: "Failed to store signals" });
  }
});

// GET /api/signals/profile — learned profile for the current user
router.get("/profile", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const profile = await fetchLearnedProfile(userId);
    if (!profile) {
      return res.json({ success: false, profile: null });
    }
    return res.json({ success: true, profile });
  } catch (err) {
    console.error("GET /signals/profile error:", err);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// GET /api/signals/twin-taste — "people like you are loving..." (3.7)
router.get("/twin-taste", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const headers = {};
    if (AI_SERVICE_KEY) headers["Authorization"] = `Bearer ${AI_SERVICE_KEY}`;
    const response = await fetch(
      `${AI_SERVICE_URL}/api/twin-taste/${encodeURIComponent(userId)}`,
      { headers },
    );
    if (!response.ok) throw new Error(`Twin-taste service error: ${response.status}`);
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.warn("GET /signals/twin-taste error:", err.message);
    return res.json({ success: false, neighbor_count: 0, dishes: [] });
  }
});

// GET /api/signals/internal — replay feed for the intelligence service.
// Guarded by the shared sync key; never expose without it.
router.get("/internal", async (req, res) => {
  try {
    if (!verifySyncKey(req)) return res.status(403).json({ error: "Forbidden" });

    const userId = req.query.userId;
    const sinceId = parseInt(req.query.sinceId) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 500, 1000);
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? `SELECT id, type, payload_json, context_json, created_at FROM signals
         WHERE user_id = $1 AND id > $2 ORDER BY id ASC LIMIT $3`
      : `SELECT id, type, payload_json, context_json, created_at FROM signals
         WHERE user_id = ? AND id > ? ORDER BY id ASC LIMIT ?`;
    const result = pg
      ? await db.query(sql, [userId, sinceId, limit])
      : await db.all(sql, [userId, sinceId, limit]);
    const rows = pg ? result.rows : result;

    const signals = rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: JSON.parse(r.payload_json || "{}"),
      context: JSON.parse(r.context_json || "{}"),
      created_at: r.created_at,
    }));

    return res.json({ signals, has_more: signals.length === limit });
  } catch (err) {
    console.error("GET /signals/internal error:", err);
    return res.status(500).json({ error: "Failed to fetch signals" });
  }
});

export default router;
