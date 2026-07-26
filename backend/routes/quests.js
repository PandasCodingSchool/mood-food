import { Router } from "express";
import { getDb, isPostgres } from "../db.js";
import { resolveUserId } from "../middleware/session.js";
import { logSignalInternal } from "../lib/signalWriter.js";

const router = Router();

// 5.2 — Streaks & taste-discovery quests. Definitions are seeded once at
// boot (idempotent upsert-by-key); the orchestrator decides WHICH quest to
// surface (exploration lever when diversity is low) — this route is just
// storage + progress bookkeeping.
export const QUEST_DEFINITIONS = [
  {
    key: "try_3_cuisines",
    title: "Try 3 new cuisines",
    description: "Order from three cuisines you haven't picked before",
    target: 3,
  },
  {
    key: "mood_streak_7",
    title: "7-day mood streak",
    description: "Check in your mood seven days running",
    target: 7,
  },
  {
    key: "adventure_score",
    title: "Beat your adventurousness score",
    description: "Say yes to a wildcard pick",
    target: 1,
  },
];

export async function seedQuests() {
  const db = getDb();
  const pg = isPostgres();
  for (const q of QUEST_DEFINITIONS) {
    const definitionJson = JSON.stringify({ target: q.target });
    if (pg) {
      await db.query(
        `INSERT INTO quests (key, title, description, definition_json)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description`,
        [q.key, q.title, q.description, definitionJson],
      );
    } else {
      await db.run(
        `INSERT INTO quests (key, title, description, definition_json)
         VALUES (?,?,?,?)
         ON CONFLICT(key) DO UPDATE SET title = excluded.title, description = excluded.description`,
        [q.key, q.title, q.description, definitionJson],
      );
    }
  }
}

// GET /api/quests — active quests + this user's progress
router.get("/", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const db = getDb();
    const pg = isPostgres();
    const questsResult = pg
      ? await db.query(`SELECT * FROM quests WHERE active = TRUE`)
      : await db.all(`SELECT * FROM quests WHERE active = 1`);
    const quests = pg ? questsResult.rows : questsResult;

    const progressSql = pg
      ? `SELECT * FROM user_quests WHERE user_id = $1`
      : `SELECT * FROM user_quests WHERE user_id = ?`;
    const progressResult = pg
      ? await db.query(progressSql, [userId])
      : await db.all(progressSql, [userId]);
    const progressRows = pg ? progressResult.rows : progressResult;
    const progressByQuest = Object.fromEntries(progressRows.map((r) => [r.quest_id, r]));

    return res.json({
      success: true,
      quests: quests.map((q) => {
        const progress = progressByQuest[q.id];
        return {
          id: q.id,
          key: q.key,
          title: q.title,
          description: q.description,
          target: JSON.parse(q.definition_json || "{}").target ?? 1,
          progress: progress ? JSON.parse(progress.progress_json || "{}").count ?? 0 : 0,
          status: progress?.status || "active",
          streakCount: progress?.streak_count || 0,
        };
      }),
    });
  } catch (err) {
    console.error("GET /quests error:", err);
    return res.status(500).json({ error: "Failed to fetch quests" });
  }
});

// POST /api/quests/:key/progress — increment progress by 1 (or {count} explicit)
router.post("/:key/progress", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const db = getDb();
    const pg = isPostgres();
    const { key } = req.params;
    const increment = Number(req.body?.count) || 1;

    const questRow = pg
      ? await db.query(`SELECT id, definition_json FROM quests WHERE key = $1`, [key])
      : await db.get(`SELECT id, definition_json FROM quests WHERE key = ?`, [key]);
    const quest = pg ? questRow.rows[0] : questRow;
    if (!quest) return res.status(404).json({ error: "Quest not found" });

    const target = JSON.parse(quest.definition_json || "{}").target ?? 1;

    const existingSql = pg
      ? `SELECT * FROM user_quests WHERE user_id = $1 AND quest_id = $2`
      : `SELECT * FROM user_quests WHERE user_id = ? AND quest_id = ?`;
    const existingResult = pg
      ? await db.query(existingSql, [userId, quest.id])
      : await db.get(existingSql, [userId, quest.id]);
    const existing = pg ? existingResult.rows[0] : existingResult;

    const currentCount = existing ? JSON.parse(existing.progress_json || "{}").count ?? 0 : 0;
    const nextCount = currentCount + increment;
    const status = nextCount >= target ? "completed" : "active";
    const progressJson = JSON.stringify({ count: nextCount });

    if (pg) {
      await db.query(
        `INSERT INTO user_quests (user_id, quest_id, progress_json, status, streak_count, updated_at)
         VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, quest_id) DO UPDATE SET
           progress_json = EXCLUDED.progress_json, status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP`,
        [userId, quest.id, progressJson, status, existing?.streak_count || 0],
      );
    } else {
      await db.run(
        `INSERT INTO user_quests (user_id, quest_id, progress_json, status, streak_count, updated_at)
         VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(user_id, quest_id) DO UPDATE SET
           progress_json = excluded.progress_json, status = excluded.status, updated_at = CURRENT_TIMESTAMP`,
        [userId, quest.id, progressJson, status, existing?.streak_count || 0],
      );
    }

    if (status === "completed" && existing?.status !== "completed") {
      await logSignalInternal(userId, "quest_event", { quest_key: key, event: "completed" });
    }

    return res.json({ success: true, count: nextCount, target, status });
  } catch (err) {
    console.error("POST /quests/:key/progress error:", err);
    return res.status(500).json({ error: "Failed to update quest progress" });
  }
});

export default router;
