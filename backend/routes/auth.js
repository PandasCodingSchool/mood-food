import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, isPostgres } from "../db.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

const router = Router();

const PHONE_RE = /^\+?[\d\s-]{7,20}$/;

function normalizePhone(phone) {
  return phone.replace(/[\s-]/g, "");
}

router.post("/signup", async (req, res) => {
  const { name, phone, password } = req.body || {};
  const trimmedName = typeof name === "string" ? name.trim() : "";
  const rawPhone = typeof phone === "string" ? phone.trim() : "";
  const normalizedPhone = normalizePhone(rawPhone);
  const trimmedPassword = typeof password === "string" ? password : "";

  if (!trimmedName) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!PHONE_RE.test(rawPhone) || normalizedPhone.length < 7) {
    return res.status(400).json({ error: "Valid phone number is required" });
  }
  if (trimmedPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    const db = getDb();
    const pg = isPostgres();
    const findSql = pg
      ? "SELECT * FROM users WHERE phone = $1 LIMIT 1"
      : "SELECT * FROM users WHERE phone = ? LIMIT 1";
    const existing = pg
      ? await db.query(findSql, [normalizedPhone])
      : await db.get(findSql, [normalizedPhone]);
    const rows = pg ? existing.rows : existing ? [existing] : [];
    if (rows.length > 0) {
      return res.status(409).json({ error: "Phone number already registered" });
    }

    const id = randomUUID();
    const sessionId = randomUUID();
    const passwordHash = await hashPassword(trimmedPassword);

    const insertSql = pg
      ? "INSERT INTO users (id, session_id, name, phone, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *"
      : "INSERT INTO users (id, session_id, name, phone, password_hash) VALUES (?, ?, ?, ?, ?)";

    const insertResult = pg
      ? await db.query(insertSql, [id, sessionId, trimmedName, normalizedPhone, passwordHash])
      : await db.run(insertSql, [id, sessionId, trimmedName, normalizedPhone, passwordHash]);

    const userRow = pg
      ? insertResult.rows[0]
      : { id, session_id: sessionId, name: trimmedName, phone: normalizedPhone };

    return res.status(201).json({
      success: true,
      user: {
        id: userRow.id,
        sessionId: userRow.session_id,
        name: userRow.name,
        phone: userRow.phone,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ error: "Failed to create account" });
  }
});

router.post("/login", async (req, res) => {
  const { phone, password } = req.body || {};
  const rawPhone = typeof phone === "string" ? phone.trim() : "";
  const normalizedPhone = normalizePhone(rawPhone);
  const trimmedPassword = typeof password === "string" ? password : "";

  if (!PHONE_RE.test(rawPhone) || normalizedPhone.length < 7) {
    return res.status(400).json({ error: "Valid phone number is required" });
  }
  if (!trimmedPassword) {
    return res.status(400).json({ error: "Password is required" });
  }

  try {
    const db = getDb();
    const pg = isPostgres();
    const findSql = pg
      ? "SELECT * FROM users WHERE phone = $1 LIMIT 1"
      : "SELECT * FROM users WHERE phone = ? LIMIT 1";
    const result = pg
      ? await db.query(findSql, [normalizedPhone])
      : await db.get(findSql, [normalizedPhone]);
    const user = pg ? result.rows[0] : result;

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    const valid = await verifyPassword(trimmedPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid phone number or password" });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        sessionId: user.session_id,
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Failed to log in" });
  }
});

export default router;
