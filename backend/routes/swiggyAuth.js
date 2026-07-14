import express from "express";
import { randomUUID, randomBytes, createHash, createSecretKey } from "crypto";
import { URLSearchParams } from "url";
import { getDb, isPostgres } from "../db.js";
import { encrypt } from "../lib/crypto.js";

const router = express.Router();

const AUTH_BASE = "https://mcp.swiggy.com";
const REDIRECT_URI =
  process.env.SWIGGY_OAUTH_REDIRECT_URI || "https://moodfood.fun/api/swiggy/oauth/callback";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://moodfood.fun";

// In-memory PKCE state store. For multi-instance production deploys, move this to Redis/DB.
const stateStore = new Map();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cleanupStates() {
  const now = Date.now();
  for (const [state, meta] of stateStore.entries()) {
    if (meta.expiresAt < now) stateStore.delete(state);
  }
}

function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

async function registerClient() {
  const response = await fetch(`${AUTH_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "MoodFood",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Swiggy client registration failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function exchangeCode(code, verifier) {
  const response = await fetch(`${AUTH_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Swiggy token exchange failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function saveSwiggyToken(userId, tokenData) {
  const db = getDb();
  const pg = isPostgres();
  const swiggyUserId = tokenData.user_id || "unknown";
  const accessToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in || 432000;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  const encryptedToken = encrypt(accessToken);

  // Mark any previous tokens for this user inactive, then insert the new one.
  const deactivateSql = pg
    ? "UPDATE swiggy_user_tokens SET is_active = FALSE WHERE user_id = $1"
    : "UPDATE swiggy_user_tokens SET is_active = 0 WHERE user_id = ?";
  const insertSql = pg
    ? `INSERT INTO swiggy_user_tokens
         (id, user_id, swiggy_user_id, access_token_encrypted, expires_at)
       VALUES ($1, $2, $3, $4, $5)`
    : `INSERT INTO swiggy_user_tokens
         (id, user_id, swiggy_user_id, access_token_encrypted, expires_at)
       VALUES (?, ?, ?, ?, ?)`;

  if (pg) {
    await db.query(deactivateSql, [userId]);
    await db.query(insertSql, [
      randomUUID(),
      userId,
      swiggyUserId,
      encryptedToken,
      expiresAt,
    ]);
  } else {
    await db.run(deactivateSql, [userId]);
    await db.run(insertSql, [
      randomUUID(),
      userId,
      swiggyUserId,
      encryptedToken,
      expiresAt.toISOString(),
    ]);
  }
}

// POST /api/swiggy/oauth/initiate
router.post("/initiate", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "No active session" });
    }

    cleanupStates();

    const { client_id } = await registerClient();
    const { verifier, challenge } = pkcePair();
    const state = randomUUID();

    stateStore.set(state, {
      userId,
      verifier,
      expiresAt: Date.now() + STATE_TTL_MS,
    });

    const params = new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri: REDIRECT_URI,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      scope: "mcp:tools",
    });

    const authUrl = `${AUTH_BASE}/auth/authorize?${params.toString()}`;
    res.json({ success: true, authUrl });
  } catch (error) {
    console.error("Swiggy OAuth initiate error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/swiggy/oauth/callback
router.get("/callback", async (req, res) => {
  try {
    const { code, state, error: swiggyError, error_description } = req.query;

    if (swiggyError) {
      return res.status(400).send(callbackHtml("error", swiggyError));
    }

    if (!code || !state) {
      return res.status(400).send(callbackHtml("error", "Missing code or state"));
    }

    const meta = stateStore.get(state);
    if (!meta || meta.expiresAt < Date.now()) {
      return res.status(400).send(callbackHtml("error", "Invalid or expired state"));
    }
    stateStore.delete(state);

    const tokenData = await exchangeCode(code, meta.verifier);
    await saveSwiggyToken(meta.userId, tokenData);

    res.send(callbackHtml("success"));
  } catch (error) {
    console.error("Swiggy OAuth callback error:", error);
    res.status(500).send(callbackHtml("error", error.message));
  }
});

// POST /api/swiggy/oauth/unlink
router.post("/unlink", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "No active session" });
    }

    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? "UPDATE swiggy_user_tokens SET is_active = FALSE WHERE user_id = $1"
      : "UPDATE swiggy_user_tokens SET is_active = 0 WHERE user_id = ?";
    if (pg) await db.query(sql, [userId]);
    else await db.run(sql, [userId]);

    res.json({ success: true });
  } catch (error) {
    console.error("Swiggy OAuth unlink error:", error);
    res.status(500).json({ error: error.message });
  }
});

function callbackHtml(status, message = "") {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Swiggy Connection ${status === "success" ? "Successful" : "Failed"}</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f9fafb; }
    .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; max-width: 420px; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { margin: 0 0 0.5rem; font-size: 1.5rem; }
    p { color: #6b7280; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${status === "success" ? "✅" : "❌"}</div>
    <h1>Swiggy ${status === "success" ? "Connected" : "Connection Failed"}</h1>
    <p>${status === "success" ? "You can close this tab and return to MoodFood." : escapeHtml(message)}</p>
  </div>
  <script>
    window.opener?.postMessage(
      { type: "swiggy-oauth", status: "${status}", message: "${escapeJs(message)}" },
      "${FRONTEND_ORIGIN}"
    );
  </script>
</body>
</html>
  `.trim();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(str) {
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

export default router;
