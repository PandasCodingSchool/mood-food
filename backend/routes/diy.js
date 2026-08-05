import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, isPostgres } from "../db.js";
import { resolveUserId } from "../middleware/session.js";
import { isPhotoStorageConfigured, uploadWallPhoto } from "../lib/photoStorage.js";

const router = Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY;

function serializeSession(r, pg) {
  return {
    id: r.id,
    dishName: r.dish_name,
    recipe: pg ? r.recipe : JSON.parse(r.recipe || "null"),
    ingredientCart: pg ? r.ingredient_cart : JSON.parse(r.ingredient_cart || "[]"),
    matchedProducts: pg ? r.matched_products : JSON.parse(r.matched_products || "[]"),
    completedSteps: pg ? r.completed_steps || [] : JSON.parse(r.completed_steps || "[]"),
    instamartOrderId: r.instamart_order_id,
    status: r.status,
    wallPhotoUrl: r.wall_photo_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// GET /api/diy — list the current user's DIY sessions (resume / wall source)
router.get("/", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? "SELECT * FROM diy_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50"
      : "SELECT * FROM diy_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50";
    const result = pg ? await db.query(sql, [userId]) : await db.all(sql, [userId]);
    const rows = pg ? result.rows : result;

    return res.json({ success: true, sessions: rows.map((r) => serializeSession(r, pg)) });
  } catch (err) {
    console.error("GET /diy error:", err);
    return res.status(500).json({ error: "Failed to fetch DIY sessions" });
  }
});

// GET /api/diy/:id
router.get("/:id", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? "SELECT * FROM diy_sessions WHERE id = $1 AND user_id = $2"
      : "SELECT * FROM diy_sessions WHERE id = ? AND user_id = ?";
    const result = pg
      ? await db.query(sql, [req.params.id, userId])
      : await db.all(sql, [req.params.id, userId]);
    const rows = pg ? result.rows : result;
    if (!rows[0]) return res.status(404).json({ error: "Not found" });

    return res.json({ success: true, session: serializeSession(rows[0], pg) });
  } catch (err) {
    console.error("GET /diy/:id error:", err);
    return res.status(500).json({ error: "Failed to fetch DIY session" });
  }
});

// POST /api/diy — create a session once a recipe has been generated
router.post("/", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const { dishName, recipe, ingredientCart = [], matchedProducts = [] } = req.body || {};
    if (!dishName || !recipe) {
      return res.status(400).json({ error: "dishName and recipe are required" });
    }

    const db = getDb();
    const pg = isPostgres();
    const id = randomUUID();

    if (pg) {
      await db.query(
        `INSERT INTO diy_sessions (id, user_id, dish_name, recipe, ingredient_cart, matched_products)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, userId, dishName, JSON.stringify(recipe), JSON.stringify(ingredientCart), JSON.stringify(matchedProducts)],
      );
    } else {
      await db.run(
        `INSERT INTO diy_sessions (id, user_id, dish_name, recipe, ingredient_cart, matched_products)
         VALUES (?,?,?,?,?,?)`,
        [id, userId, dishName, JSON.stringify(recipe), JSON.stringify(ingredientCart), JSON.stringify(matchedProducts)],
      );
    }

    return res.status(201).json({ success: true, id });
  } catch (err) {
    console.error("POST /diy error:", err);
    return res.status(500).json({ error: "Failed to create DIY session" });
  }
});

// PATCH /api/diy/:id — update cart/steps/status/order id as the user progresses
router.patch("/:id", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const { ingredientCart, matchedProducts, completedSteps, status, instamartOrderId } = req.body || {};
    const db = getDb();
    const pg = isPostgres();

    const sets = [];
    const params = [];
    const push = (col, val) => {
      params.push(val);
      sets.push(`${col} = ${pg ? `$${params.length}` : "?"}`);
    };

    if (ingredientCart !== undefined) push("ingredient_cart", JSON.stringify(ingredientCart));
    if (matchedProducts !== undefined) push("matched_products", JSON.stringify(matchedProducts));
    if (completedSteps !== undefined) {
      push("completed_steps", pg ? completedSteps : JSON.stringify(completedSteps));
    }
    if (status !== undefined) push("status", status);
    if (instamartOrderId !== undefined) push("instamart_order_id", instamartOrderId);

    if (!sets.length) return res.status(400).json({ error: "No fields to update" });

    sets.push("updated_at = CURRENT_TIMESTAMP");
    params.push(req.params.id, userId);
    const idPlaceholder = pg ? `$${params.length - 1}` : "?";
    const userPlaceholder = pg ? `$${params.length}` : "?";

    const sql = `UPDATE diy_sessions SET ${sets.join(", ")} WHERE id = ${idPlaceholder} AND user_id = ${userPlaceholder}`;
    if (pg) {
      await db.query(sql, params);
    } else {
      await db.run(sql, params);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("PATCH /diy/:id error:", err);
    return res.status(500).json({ error: "Failed to update DIY session" });
  }
});

// POST /api/diy/:id/wall-photo — food-only moderation gate, then storage
// (locked until WALL_PHOTO_BUCKET is configured — see lib/photoStorage.js).
router.post("/:id/wall-photo", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const { imageBase64, mimeType = "image/jpeg" } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "imageBase64 is required" });

    const headers = { "Content-Type": "application/json" };
    if (AI_SERVICE_KEY) headers["Authorization"] = `Bearer ${AI_SERVICE_KEY}`;

    const modResponse = await fetch(`${AI_SERVICE_URL}/api/moderation/check-food-photo`, {
      method: "POST",
      headers,
      body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType }),
    });
    const moderation = await modResponse.json();

    if (!moderation.success) {
      return res.status(502).json({ success: false, error: moderation.error || "Moderation check failed" });
    }
    if (!moderation.is_food) {
      return res.status(422).json({
        success: false,
        rejected: true,
        reason: moderation.reason || "That doesn't look like food — try another photo.",
      });
    }

    if (!isPhotoStorageConfigured()) {
      return res.status(503).json({
        success: false,
        locked: true,
        error: "Wall photo storage is not configured yet — this feature is coming soon.",
      });
    }

    const buffer = Buffer.from(imageBase64, "base64");
    const url = await uploadWallPhoto(buffer, userId, req.params.id);

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? "UPDATE diy_sessions SET wall_photo_url = $1, status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3"
      : "UPDATE diy_sessions SET wall_photo_url = ?, status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?";
    if (pg) {
      await db.query(sql, [url, req.params.id, userId]);
    } else {
      await db.run(sql, [url, req.params.id, userId]);
    }

    return res.json({ success: true, wallPhotoUrl: url });
  } catch (err) {
    console.error("POST /diy/:id/wall-photo error:", err);
    return res.status(500).json({ error: "Failed to process wall photo" });
  }
});

export default router;
