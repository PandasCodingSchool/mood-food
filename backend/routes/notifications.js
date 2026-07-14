import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, isPostgres } from "../db.js";

const router = Router();

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

// GET /api/user/notifications  — list newest 50
router.get("/", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.user?.sessionId;
    if (!sessionId) return res.status(401).json({ error: "No session" });
    const userId = await getUserIdFromSession(sessionId);
    if (!userId) return res.status(401).json({ error: "User not found" });

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50"
      : "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50";
    const result = pg
      ? await db.query(sql, [userId])
      : await db.all(sql, [userId]);
    const rows = pg ? result.rows : result;

    const notifications = rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      data: typeof r.data === "string" ? JSON.parse(r.data || "{}") : (r.data || {}),
      read: pg ? r.read : r.read === 1,
      createdAt: r.created_at,
    }));

    const unreadCount = notifications.filter((n) => !n.read).length;
    return res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    console.error("GET /notifications error:", err);
    return res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// POST /api/user/notifications  — create a notification (internal / webhook use)
router.post("/", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.user?.sessionId;
    const { userId: targetUserId, type = "info", title, body, data = {} } = req.body || {};

    const userId = targetUserId || (sessionId ? await getUserIdFromSession(sessionId) : null);
    if (!userId) return res.status(401).json({ error: "No user" });
    if (!title) return res.status(400).json({ error: "title is required" });

    const db = getDb();
    const pg = isPostgres();
    const id = randomUUID();
    const dataJson = JSON.stringify(data);

    if (pg) {
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, userId, type, title, body || null, dataJson],
      );
    } else {
      await db.run(
        `INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, userId, type, title, body || null, dataJson],
      );
    }

    return res.status(201).json({ success: true, id });
  } catch (err) {
    console.error("POST /notifications error:", err);
    return res.status(500).json({ error: "Failed to create notification" });
  }
});

// PATCH /api/user/notifications/read  — mark all as read
router.patch("/read", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.user?.sessionId;
    if (!sessionId) return res.status(401).json({ error: "No session" });
    const userId = await getUserIdFromSession(sessionId);
    if (!userId) return res.status(401).json({ error: "User not found" });

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? "UPDATE notifications SET read = TRUE WHERE user_id = $1"
      : "UPDATE notifications SET read = 1 WHERE user_id = ?";
    if (pg) await db.query(sql, [userId]);
    else await db.run(sql, [userId]);

    return res.json({ success: true });
  } catch (err) {
    console.error("PATCH /notifications/read error:", err);
    return res.status(500).json({ error: "Failed to mark notifications read" });
  }
});

// PATCH /api/user/notifications/:id/read  — mark single as read
router.patch("/:id/read", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.user?.sessionId;
    if (!sessionId) return res.status(401).json({ error: "No session" });
    const userId = await getUserIdFromSession(sessionId);
    if (!userId) return res.status(401).json({ error: "User not found" });

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? "UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2"
      : "UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?";
    if (pg) await db.query(sql, [req.params.id, userId]);
    else await db.run(sql, [req.params.id, userId]);

    return res.json({ success: true });
  } catch (err) {
    console.error("PATCH /notifications/:id/read error:", err);
    return res.status(500).json({ error: "Failed to mark notification read" });
  }
});

export default router;
