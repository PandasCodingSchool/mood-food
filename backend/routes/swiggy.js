import express from "express";
import { getDb, isPostgres } from "../db.js";
import { decrypt } from "../lib/crypto.js";

const router = express.Router();

// Intelligence service owns the Swiggy MCP client + tokens.
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY;
const SWIGGY_TIMEOUT = parseInt(process.env.SWIGGY_TIMEOUT_MS || "25000");

/**
 * Return the decrypted active Swiggy token for a MoodFood user, or null if none
 * exists or the token has expired.
 */
async function getActiveSwiggyToken(userId) {
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

/**
 * Thin proxy: forwards /api/swiggy/* to the intelligence service, preserving
 * method, sub-path, query string and JSON body. The intelligence service holds
 * the Swiggy token, so the browser never sees it.
 *
 * When the current MoodFood user has linked a Swiggy account, the decrypted
 * per-user token is forwarded in a private header so the intelligence service
 * can use it instead of the bootstrap token.
 */
router.use(async (req, res) => {
  // req.url is the path *after* the mount point, e.g. "/restaurants".
  const target = `${AI_SERVICE_URL}/api/swiggy${req.url}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SWIGGY_TIMEOUT);

  const userToken = await getActiveSwiggyToken(req.user?.id);

  const headers = { "Content-Type": "application/json" };
  if (AI_SERVICE_KEY) {
    headers["Authorization"] = `Bearer ${AI_SERVICE_KEY}`;
  }
  if (userToken) {
    headers["X-Swiggy-User-Token"] = userToken;
  }

  const hasBody = !["GET", "HEAD"].includes(req.method);

  try {
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    res.status(response.status);
    res.type(response.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch (error) {
    const aborted = error?.name === "AbortError";
    console.warn(`Swiggy proxy error for ${target}:`, error.message);
    return res.status(aborted ? 504 : 502).json({
      success: false,
      error: aborted
        ? "Swiggy service timed out."
        : "Swiggy service unavailable.",
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
