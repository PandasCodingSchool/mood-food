import { Router } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { getDb, isPostgres } from "../db.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  generateOtp,
  saveOtp,
  getOtpRecord,
  verifyOtpHash,
  incrementAttempts,
  markOtpUsed,
  deleteOtp,
  MAX_ATTEMPTS,
  randomUUID as newSessionId,
} from "../lib/otp.js";
import { sendSms } from "../lib/sms.js";

const router = Router();

const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.phone || 'unknown',
  message: { error: "Too many OTP requests. Please try again later." },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.phone || 'unknown',
  message: { error: "Too many verification attempts. Please try again later." },
});

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

router.post("/otp/send", otpSendLimiter, async (req, res) => {
  const { phone } = req.body || {};
  const rawPhone = typeof phone === "string" ? phone.trim() : "";
  const normalizedPhone = normalizePhone(rawPhone);

  if (!PHONE_RE.test(rawPhone) || normalizedPhone.length < 7) {
    return res.status(400).json({ error: "Valid phone number is required" });
  }

  try {
    const otp = generateOtp();
    await saveOtp(normalizedPhone, otp);
    const message = `Your MoodFood login code is ${otp}. It is valid for 5 minutes.`;
    await sendSms(normalizedPhone, message);
    return res.json({ success: true, message: "OTP sent" });
  } catch (error) {
    console.error("OTP send error:", error);
    try {
      await deleteOtp(normalizedPhone);
    } catch {
      // ignore cleanup failure
    }
    return res.status(500).json({ error: "Failed to send OTP" });
  }
});

router.post("/otp/verify", otpVerifyLimiter, async (req, res) => {
  const { phone, otp, name } = req.body || {};
  const rawPhone = typeof phone === "string" ? phone.trim() : "";
  const normalizedPhone = normalizePhone(rawPhone);
  const trimmedOtp = typeof otp === "string" ? otp.trim() : "";
  const trimmedName = typeof name === "string" ? name.trim() : "";

  if (!PHONE_RE.test(rawPhone) || normalizedPhone.length < 7) {
    return res.status(400).json({ error: "Valid phone number is required" });
  }
  if (!/^\d{6}$/.test(trimmedOtp)) {
    return res.status(400).json({ error: "6-digit OTP is required" });
  }

  try {
    const record = await getOtpRecord(normalizedPhone);
    if (!record) {
      return res.status(400).json({ error: "OTP expired or not requested" });
    }
    if (record.used) {
      return res.status(400).json({ error: "OTP already used" });
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      return res.status(400).json({ error: "Too many failed attempts. Please request a new OTP." });
    }

    const valid = await verifyOtpHash(trimmedOtp, record.otp_hash);
    if (!valid) {
      await incrementAttempts(normalizedPhone);
      return res.status(401).json({ error: "Invalid OTP" });
    }

    const db = getDb();
    const pg = isPostgres();
    const findSql = pg
      ? "SELECT * FROM users WHERE phone = $1 LIMIT 1"
      : "SELECT * FROM users WHERE phone = ? LIMIT 1";
    const existing = pg
      ? await db.query(findSql, [normalizedPhone])
      : await db.get(findSql, [normalizedPhone]);
    const rows = pg ? existing.rows : existing ? [existing] : [];
    const userRow = rows[0];

    let isNew = false;
    let user;

    if (userRow) {
      const sessionId = newSessionId();
      const updateSql = pg
        ? "UPDATE users SET session_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *"
        : "UPDATE users SET session_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
      const updateResult = pg
        ? await db.query(updateSql, [sessionId, userRow.id])
        : await db.run(updateSql, [sessionId, userRow.id]);
      user = pg ? updateResult.rows[0] : { ...userRow, session_id: sessionId };
      await markOtpUsed(normalizedPhone);
    } else {
      if (!trimmedName) {
        return res.status(404).json({
          error: "No account found. Please sign up.",
          needsName: true,
        });
      }
      isNew = true;
      const id = randomUUID();
      const sessionId = newSessionId();
      const insertSql = pg
        ? "INSERT INTO users (id, session_id, name, phone) VALUES ($1, $2, $3, $4) RETURNING *"
        : "INSERT INTO users (id, session_id, name, phone) VALUES (?, ?, ?, ?)";
      const insertResult = pg
        ? await db.query(insertSql, [id, sessionId, trimmedName, normalizedPhone])
        : await db.run(insertSql, [id, sessionId, trimmedName, normalizedPhone]);
      user = pg ? insertResult.rows[0] : { id, session_id: sessionId, name: trimmedName, phone: normalizedPhone };
      await markOtpUsed(normalizedPhone);
    }

    return res.status(isNew ? 201 : 200).json({
      success: true,
      isNew,
      user: {
        id: user.id,
        sessionId: user.session_id,
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("OTP verify error:", error);
    return res.status(500).json({ error: "Failed to verify OTP" });
  }
});

export default router;
