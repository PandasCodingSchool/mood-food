import { getDb, isPostgres } from "../db.js";
import { decrypt } from "./crypto.js";

/**
 * Return the decrypted active Swiggy token for a MoodFood user, or null if none
 * exists or the token has expired.
 */
export async function getActiveSwiggyToken(userId) {
  if (!userId) return null;
  const db = getDb();
  const pg = isPostgres();
  const sql = pg
    ? `SELECT access_token_encrypted, expires_at FROM swiggy_user_tokens
       WHERE user_id = $1 AND is_active = TRUE
       ORDER BY created_at DESC LIMIT 1`
    : `SELECT access_token_encrypted, expires_at FROM swiggy_user_tokens
       WHERE user_id = ? AND is_active = 1
       ORDER BY created_at DESC LIMIT 1`;
  const result = pg
    ? await db.query(sql, [userId])
    : await db.get(sql, [userId]);
  const row = pg ? result.rows[0] : result;
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) <= new Date()) return null;
  try {
    return decrypt(row.access_token_encrypted);
  } catch (error) {
    console.error(
      "Failed to decrypt Swiggy token for user:",
      userId,
      error.message,
    );
    return null;
  }
}
