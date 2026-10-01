import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, isPostgres } from "../db.js";
import { resolveUserId } from "../middleware/session.js";

const router = Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY;

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

// 3.6 — Group / social decision games. Poll-based lobby (no websockets
// needed at this scale): members join by code, swipe, and any member can
// pull consensus once enough people have joined.

// POST /api/groups — create a lobby
router.post("/", async (req, res) => {
  try {
    const userId = await resolveUserId(req);
    if (!userId) return res.status(401).json({ error: "No session" });

    const db = getDb();
    const pg = isPostgres();
    const code = randomCode();

    if (pg) {
      await db.query(
        `INSERT INTO group_sessions (code, host_user_id, status) VALUES ($1,$2,'open')`,
        [code, userId],
      );
    } else {
      await db.run(`INSERT INTO group_sessions (code, host_user_id, status) VALUES (?,?,'open')`, [
        code,
        userId,
      ]);
    }

    return res.status(201).json({ success: true, code });
  } catch (err) {
    console.error("POST /groups error:", err);
    return res.status(500).json({ error: "Failed to create group" });
  }
});

async function getGroup(code) {
  const db = getDb();
  const pg = isPostgres();
  const sql = pg
    ? `SELECT * FROM group_sessions WHERE code = $1`
    : `SELECT * FROM group_sessions WHERE code = ?`;
  const result = pg ? await db.query(sql, [code]) : await db.get(sql, [code]);
  return pg ? result.rows[0] : result;
}

// POST /api/groups/:code/join — join with a display name; guests get a member_key
router.post("/:code/join", async (req, res) => {
  try {
    const { code } = req.params;
    const { displayName } = req.body || {};
    const group = await getGroup(code.toUpperCase());
    if (!group) return res.status(404).json({ error: "Group not found" });

    const userId = await resolveUserId(req).catch(() => null);
    const memberKey = userId || `guest_${randomUUID().slice(0, 8)}`;

    const db = getDb();
    const pg = isPostgres();
    if (pg) {
      await db.query(
        `INSERT INTO group_members (group_id, member_key, user_id, display_name)
         VALUES ($1,$2,$3,$4) ON CONFLICT (group_id, member_key) DO NOTHING`,
        [group.id, memberKey, userId || null, displayName || "Guest"],
      );
    } else {
      await db.run(
        `INSERT OR IGNORE INTO group_members (group_id, member_key, user_id, display_name)
         VALUES (?,?,?,?)`,
        [group.id, memberKey, userId || null, displayName || "Guest"],
      );
    }

    return res.json({ success: true, memberKey, code: group.code });
  } catch (err) {
    console.error("POST /groups/:code/join error:", err);
    return res.status(500).json({ error: "Failed to join group" });
  }
});

// GET /api/groups/:code — lobby state (poll this for member list)
router.get("/:code", async (req, res) => {
  try {
    const group = await getGroup(req.params.code.toUpperCase());
    if (!group) return res.status(404).json({ error: "Group not found" });

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? `SELECT member_key, display_name, swipes_json FROM group_members WHERE group_id = $1`
      : `SELECT member_key, display_name, swipes_json FROM group_members WHERE group_id = ?`;
    const result = pg ? await db.query(sql, [group.id]) : await db.all(sql, [group.id]);
    const members = pg ? result.rows : result;

    return res.json({
      success: true,
      code: group.code,
      status: group.status,
      members: members.map((m) => ({
        memberKey: m.member_key,
        displayName: m.display_name,
        swipeCount: (JSON.parse(m.swipes_json || "[]") || []).length,
      })),
    });
  } catch (err) {
    console.error("GET /groups/:code error:", err);
    return res.status(500).json({ error: "Failed to fetch group" });
  }
});

// POST /api/groups/:code/swipe — record one member's swipes
router.post("/:code/swipe", async (req, res) => {
  try {
    const group = await getGroup(req.params.code.toUpperCase());
    if (!group) return res.status(404).json({ error: "Group not found" });

    const { memberKey, swipes } = req.body || {};
    if (!memberKey || !Array.isArray(swipes)) {
      return res.status(400).json({ error: "memberKey and swipes[] are required" });
    }

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? `UPDATE group_members SET swipes_json = $1 WHERE group_id = $2 AND member_key = $3`
      : `UPDATE group_members SET swipes_json = ? WHERE group_id = ? AND member_key = ?`;
    if (pg) await db.query(sql, [JSON.stringify(swipes), group.id, memberKey]);
    else await db.run(sql, [JSON.stringify(swipes), group.id, memberKey]);

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /groups/:code/swipe error:", err);
    return res.status(500).json({ error: "Failed to record swipes" });
  }
});

// POST /api/groups/:code/consensus — proxy to the intelligence service's
// maximin consensus, feeding member ids (known users) + guest swipes.
router.post("/:code/consensus", async (req, res) => {
  try {
    const group = await getGroup(req.params.code.toUpperCase());
    if (!group) return res.status(404).json({ error: "Group not found" });

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? `SELECT member_key, user_id, swipes_json FROM group_members WHERE group_id = $1`
      : `SELECT member_key, user_id, swipes_json FROM group_members WHERE group_id = ?`;
    const result = pg ? await db.query(sql, [group.id]) : await db.all(sql, [group.id]);
    const members = pg ? result.rows : result;

    const memberIds = members.filter((m) => m.user_id).map((m) => m.user_id);
    const guestSwipes = members
      .filter((m) => !m.user_id)
      .flatMap((m) =>
        (JSON.parse(m.swipes_json || "[]") || []).map((s) => ({ ...s, guest_id: m.member_key })),
      );

    const headers = { "Content-Type": "application/json" };
    if (AI_SERVICE_KEY) headers["Authorization"] = `Bearer ${AI_SERVICE_KEY}`;
    const response = await fetch(`${AI_SERVICE_URL}/api/group/consensus`, {
      method: "POST",
      headers,
      body: JSON.stringify({ member_ids: memberIds, guest_swipes: guestSwipes, count: 3 }),
    });
    if (!response.ok) throw new Error(`Consensus service error: ${response.status}`);
    const data = await response.json();

    return res.json(data);
  } catch (err) {
    console.error("POST /groups/:code/consensus error:", err);
    return res.status(502).json({ success: false, options: [], error: "Consensus unavailable" });
  }
});

export default router;
