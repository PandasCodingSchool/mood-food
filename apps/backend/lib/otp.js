import { randomInt, randomUUID } from "crypto";
import { hashPassword, verifyPassword } from "./password.js";
import { getDb, isPostgres } from "../db.js";

function toSqlite(sql) {
  return sql.replace(/\$\d+/g, "?");
}

async function dbRun(sql, params) {
  const db = getDb();
  if (isPostgres()) return db.query(sql, params);
  return db.run(toSqlite(sql), params);
}

async function dbGet(sql, params) {
  const db = getDb();
  if (isPostgres()) {
    const result = await db.query(sql, params);
    return result.rows[0];
  }
  return db.get(toSqlite(sql), params);
}

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;

export function generateOtp() {
  return randomInt(0, 1_000_000)
    .toString()
    .padStart(OTP_LENGTH, "0");
}

export async function hashOtp(otp) {
  return hashPassword(otp);
}

export async function verifyOtpHash(otp, hash) {
  return verifyPassword(otp, hash);
}

export async function saveOtp(phone, otp) {
  const hash = await hashOtp(otp);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
  const createdAt = now.toISOString();

  await dbRun(
    `INSERT INTO otp_codes (phone, otp_hash, expires_at, attempts, used, created_at)
     VALUES ($1, $2, $3, 0, FALSE, $4)
     ON CONFLICT (phone) DO UPDATE
     SET otp_hash = EXCLUDED.otp_hash,
         expires_at = EXCLUDED.expires_at,
         attempts = 0,
         used = FALSE,
         created_at = EXCLUDED.created_at`,
    [phone, hash, expiresAt, createdAt],
  );
}

export async function getOtpRecord(phone) {
  const now = new Date().toISOString();
  return dbGet(
    `SELECT phone, otp_hash, expires_at, attempts, used
     FROM otp_codes
     WHERE phone = $1 AND expires_at > $2`,
    [phone, now],
  );
}

export async function incrementAttempts(phone) {
  await dbRun(`UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1`, [phone]);
}

export async function markOtpUsed(phone) {
  await dbRun(`UPDATE otp_codes SET used = TRUE WHERE phone = $1`, [phone]);
}

export async function deleteOtp(phone) {
  await dbRun(`DELETE FROM otp_codes WHERE phone = $1`, [phone]);
}

export { MAX_ATTEMPTS, OTP_TTL_MS, randomUUID };
