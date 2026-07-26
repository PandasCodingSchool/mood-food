import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, isPostgres } from "../db.js";
import { resolveUserId } from "../middleware/session.js";
import { forwardSignals } from "../lib/intelligenceClient.js";

const router = Router();

// POST /api/predictions — create prediction rows at recommendation time
// body: { recId, predictions: [{dishId, dishName, predictedScore, confidence, context?}] }
router.post("/", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const { recId, predictions } = req.body || {};
    if (!recId || !Array.isArray(predictions) || predictions.length === 0) {
      return res.status(400).json({ error: "recId and predictions[] are required" });
    }

    const db = getDb();
    const pg = isPostgres();
    const ids = [];

    for (const p of predictions.slice(0, 10)) {
      const id = randomUUID();
      const contextJson = p.context ? JSON.stringify(p.context) : null;
      if (pg) {
        await db.query(
          `INSERT INTO predictions (id, user_id, rec_id, dish_id, dish_name, predicted_score, confidence, context_json)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, userId, recId, p.dishId || null, p.dishName || null, p.predictedScore ?? null, p.confidence ?? null, contextJson],
        );
      } else {
        await db.run(
          `INSERT INTO predictions (id, user_id, rec_id, dish_id, dish_name, predicted_score, confidence, context_json)
           VALUES (?,?,?,?,?,?,?,?)`,
          [id, userId, recId, p.dishId || null, p.dishName || null, p.predictedScore ?? null, p.confidence ?? null, contextJson],
        );
      }
      ids.push(id);
    }

    return res.status(201).json({ success: true, ids });
  } catch (err) {
    console.error("POST /predictions error:", err);
    return res.status(500).json({ error: "Failed to create predictions" });
  }
});

// GET /api/predictions/pending — unresolved predictions old enough to prompt on
router.get("/pending", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const parsedMinAge = parseInt(req.query.minAgeMinutes);
    const minAgeMinutes = Number.isNaN(parsedMinAge) ? 45 : parsedMinAge;
    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? `SELECT id, rec_id, dish_id, dish_name, user_predicted_score, created_at FROM predictions
         WHERE user_id = $1 AND actual_score IS NULL
           AND created_at < NOW() - ($2 || ' minutes')::interval
         ORDER BY created_at DESC LIMIT 5`
      : `SELECT id, rec_id, dish_id, dish_name, user_predicted_score, created_at FROM predictions
         WHERE user_id = ? AND actual_score IS NULL
           AND created_at < datetime('now', '-' || ? || ' minutes')
         ORDER BY created_at DESC LIMIT 5`;
    const result = pg
      ? await db.query(sql, [userId, String(minAgeMinutes)])
      : await db.all(sql, [userId, String(minAgeMinutes)]);
    const rows = pg ? result.rows : result;

    return res.json({
      success: true,
      pending: rows.map((r) => ({
        id: r.id,
        recId: r.rec_id,
        dishId: r.dish_id,
        dishName: r.dish_name,
        userPredictedScore: r.user_predicted_score,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error("GET /predictions/pending error:", err);
    return res.status(500).json({ error: "Failed to fetch pending predictions" });
  }
});

// POST /api/predictions/:id/resolve
// body: { actualScore } (post-meal 4.1) or { userPredictedScore } (blind bet 2.4)
router.post("/:id/resolve", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const { id } = req.params;
    const { actualScore, userPredictedScore } = req.body || {};
    if (actualScore == null && userPredictedScore == null) {
      return res.status(400).json({ error: "actualScore or userPredictedScore is required" });
    }

    const db = getDb();
    const pg = isPostgres();

    const findSql = pg
      ? `SELECT * FROM predictions WHERE id = $1 AND user_id = $2 LIMIT 1`
      : `SELECT * FROM predictions WHERE id = ? AND user_id = ? LIMIT 1`;
    const found = pg ? await db.query(findSql, [id, userId]) : await db.get(findSql, [id, userId]);
    const row = pg ? found.rows[0] : found;
    if (!row) return res.status(404).json({ error: "Prediction not found" });

    const fields = [];
    const values = [];
    let idx = 1;
    if (actualScore != null) {
      fields.push(pg ? `actual_score = $${idx++}` : "actual_score = ?");
      values.push(actualScore);
      fields.push(`resolved_at = CURRENT_TIMESTAMP`);
    }
    if (userPredictedScore != null) {
      fields.push(pg ? `user_predicted_score = $${idx++}` : "user_predicted_score = ?");
      values.push(userPredictedScore);
    }
    values.push(id, userId);
    const updateSql = pg
      ? `UPDATE predictions SET ${fields.join(", ")} WHERE id = $${idx++} AND user_id = $${idx}`
      : `UPDATE predictions SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`;
    if (pg) await db.query(updateSql, values);
    else await db.run(updateSql, values);

    // Route the outcome through the one signals spine so learning sees it.
    const signalType = actualScore != null ? "post_meal" : "blind_bet";
    const payload =
      actualScore != null
        ? {
            prediction_id: id,
            rec_id: row.rec_id,
            dish_id: row.dish_id,
            dish_name: row.dish_name,
            predicted_score: row.predicted_score,
            actual_score: actualScore,
          }
        : {
            prediction_id: id,
            rec_id: row.rec_id,
            dish_id: row.dish_id,
            user_predicted_score: userPredictedScore,
          };

    const context = row.context_json ? JSON.parse(row.context_json) : {};
    let signalId = null;
    if (pg) {
      const result = await db.query(
        `INSERT INTO signals (user_id, type, payload_json, context_json) VALUES ($1,$2,$3,$4) RETURNING id`,
        [userId, signalType, JSON.stringify(payload), JSON.stringify(context)],
      );
      signalId = result.rows[0].id;
    } else {
      const result = await db.run(
        `INSERT INTO signals (user_id, type, payload_json, context_json) VALUES (?,?,?,?)`,
        [userId, signalType, JSON.stringify(payload), JSON.stringify(context)],
      );
      signalId = result.lastID;
    }
    await forwardSignals(userId, [
      { id: signalId, type: signalType, payload, context },
    ]);

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /predictions/:id/resolve error:", err);
    return res.status(500).json({ error: "Failed to resolve prediction" });
  }
});

export default router;
