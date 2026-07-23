import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, isPostgres } from "../db.js";
import { resolveUserId } from "../middleware/session.js";

const router = Router();

// GET /api/user/history?tab=all|ordered|saved&limit=50&offset=0
router.get("/", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const tab = req.query.tab || "all";
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    const db = getDb();
    const pg = isPostgres();

    let whereClauses = [pg ? "user_id = $1" : "user_id = ?"];
    const params = [userId];

    if (tab === "ordered") {
      whereClauses.push(pg ? "ordered = TRUE" : "ordered = 1");
    } else if (tab === "saved") {
      whereClauses.push(pg ? "saved = TRUE" : "saved = 1");
    }

    const where = whereClauses.join(" AND ");
    const limitPlaceholder = pg ? `$${params.length + 1}` : "?";
    const offsetPlaceholder = pg ? `$${params.length + 2}` : "?";
    params.push(limit, offset);

    const sql = `SELECT * FROM order_history WHERE ${where} ORDER BY created_at DESC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`;

    const result = pg
      ? await db.query(sql, params)
      : await db.all(sql, params);
    const rows = pg ? result.rows : result;

    const items = rows.map((r) => ({
      id: r.id,
      dishName: r.dish_name,
      cuisine: r.cuisine,
      emoji: r.emoji,
      priceInr: r.price_inr,
      platform: r.platform,
      via: r.via,
      gradientStart: r.gradient_start,
      gradientEnd: r.gradient_end,
      ordered: pg ? r.ordered : !!r.ordered,
      saved: pg ? r.saved : !!r.saved,
      createdAt: r.created_at,
    }));

    return res.json({ success: true, items, total: items.length });
  } catch (err) {
    console.error("GET /history error:", err);
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});

// POST /api/user/history — record an order or save
router.post("/", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const {
      dishName,
      cuisine,
      emoji = "🍽️",
      priceInr = 0,
      platform = "swiggy",
      via,
      gradientStart = "#f97316",
      gradientEnd = "#fbbf24",
      ordered = true,
      saved = false,
    } = req.body || {};

    if (!dishName) return res.status(400).json({ error: "dishName is required" });

    const db = getDb();
    const pg = isPostgres();
    const id = randomUUID();

    if (pg) {
      await db.query(
        `INSERT INTO order_history
          (id, user_id, dish_name, cuisine, emoji, price_inr, platform, via, gradient_start, gradient_end, ordered, saved)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, userId, dishName, cuisine || null, emoji, priceInr, platform, via || null, gradientStart, gradientEnd, ordered, saved],
      );
    } else {
      await db.run(
        `INSERT INTO order_history
          (id, user_id, dish_name, cuisine, emoji, price_inr, platform, via, gradient_start, gradient_end, ordered, saved)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, userId, dishName, cuisine || null, emoji, priceInr, platform, via || null, gradientStart, gradientEnd, ordered ? 1 : 0, saved ? 1 : 0],
      );
    }

    return res.status(201).json({ success: true, id });
  } catch (err) {
    console.error("POST /history error:", err);
    return res.status(500).json({ error: "Failed to save history" });
  }
});

// PATCH /api/user/history/:id — toggle saved flag
router.patch("/:id", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const { saved } = req.body || {};
    if (typeof saved !== "boolean") return res.status(400).json({ error: "saved (boolean) is required" });

    const db = getDb();
    const pg = isPostgres();
    const { id } = req.params;

    const sql = pg
      ? "UPDATE order_history SET saved = $1 WHERE id = $2 AND user_id = $3"
      : "UPDATE order_history SET saved = ? WHERE id = ? AND user_id = ?";

    if (pg) {
      await db.query(sql, [saved, id, userId]);
    } else {
      await db.run(sql, [saved ? 1 : 0, id, userId]);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("PATCH /history error:", err);
    return res.status(500).json({ error: "Failed to update" });
  }
});

export default router;
