import { randomUUID } from "crypto";
import { getDb, isPostgres } from "../db.js";

const SESSION_COOKIE = "moodfood_session_id";
const SESSION_HEADER = "x-session-id";
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    }),
  );
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.maxAge)
    parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
  if (options.path) parts.push(`Path=${options.path}`);
  return parts.join("; ");
}

async function getOrCreateUser(sessionId) {
  const db = getDb();
  const pg = isPostgres();

  const findSql = pg
    ? "SELECT * FROM users WHERE session_id = $1 LIMIT 1"
    : "SELECT * FROM users WHERE session_id = ? LIMIT 1";
  const existing = pg
    ? await db.query(findSql, [sessionId])
    : await db.get(findSql, [sessionId]);

  const rows = pg ? existing.rows : existing ? [existing] : [];
  if (rows.length > 0) {
    return rows[0];
  }

  const id = randomUUID();
  const insertSql = pg
    ? "INSERT INTO users (id, session_id) VALUES ($1, $2) RETURNING *"
    : "INSERT INTO users (id, session_id) VALUES (?, ?)";
  const result = pg
    ? await db.query(insertSql, [id, sessionId])
    : await db.run(insertSql, [id, sessionId]);

  const createdId = pg ? result.rows[0].id : id;
  const getSql = pg
    ? "SELECT * FROM users WHERE id = $1 LIMIT 1"
    : "SELECT * FROM users WHERE id = ? LIMIT 1";
  const created = pg
    ? await db.query(getSql, [createdId])
    : await db.get(getSql, [createdId]);
  return pg ? created.rows[0] : created;
}

async function getSwiggyTokenInfo(userId) {
  const db = getDb();
  const pg = isPostgres();
  const sql = pg
    ? `SELECT swiggy_user_id, expires_at FROM swiggy_user_tokens
       WHERE user_id = $1 AND is_active = TRUE
       ORDER BY created_at DESC LIMIT 1`
    : `SELECT swiggy_user_id, expires_at FROM swiggy_user_tokens
       WHERE user_id = ? AND is_active = 1
       ORDER BY created_at DESC LIMIT 1`;
  const result = pg
    ? await db.query(sql, [userId])
    : await db.get(sql, [userId]);
  const row = pg ? result.rows[0] : result;
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) <= new Date()) return null;
  return {
    swiggyUserId: row.swiggy_user_id,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
  };
}

export async function getUserMe(sessionId) {
  const user = await getOrCreateUser(sessionId);
  const swiggy = await getSwiggyTokenInfo(user.id);
  return {
    id: user.id,
    sessionId: user.session_id,
    email: user.email,
    phone: user.phone,
    name: user.name,
    swiggyLinked: !!swiggy,
    swiggyUserId: swiggy?.swiggyUserId || null,
    swiggyExpiresAt: swiggy?.expiresAt || null,
  };
}

export function sessionMiddleware() {
  return async (req, res, next) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      let sessionId =
        req.headers[SESSION_HEADER] ||
        req.get(SESSION_HEADER) ||
        cookies[SESSION_COOKIE];

      if (!sessionId) {
        sessionId = randomUUID();
      }

      const user = await getOrCreateUser(sessionId);
      const swiggy = await getSwiggyTokenInfo(user.id);

      req.user = {
        id: user.id,
        sessionId: user.session_id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        swiggyLinked: !!swiggy,
        swiggyUserId: swiggy?.swiggyUserId || null,
        swiggyExpiresAt: swiggy?.expiresAt || null,
      };

      // Always refresh the httpOnly session cookie.
      const isProduction = process.env.NODE_ENV === "production";
      res.setHeader(
        "Set-Cookie",
        serializeCookie(SESSION_COOKIE, sessionId, {
          httpOnly: true,
          secure: isProduction,
          sameSite: "Lax",
          path: "/",
          maxAge: COOKIE_MAX_AGE_MS,
        }),
      );

      next();
    } catch (error) {
      console.error("Session middleware error:", error);
      // Fail open: attach an empty user so the app keeps working.
      req.user = {
        id: null,
        sessionId: null,
        email: null,
        phone: null,
        name: null,
        swiggyLinked: false,
        swiggyUserId: null,
        swiggyExpiresAt: null,
      };
      next();
    }
  };
}
