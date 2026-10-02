// Thin client for the Python intelligence service's learning endpoints.
// All calls are best-effort: the durable signals log lives in our DB, and the
// intelligence service can replay it, so a failed forward is never fatal.

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY;
const SYNC_KEY = process.env.INTELLIGENCE_SYNC_KEY;
const LEARN_TIMEOUT_MS = parseInt(process.env.LEARN_TIMEOUT_MS || "8000");

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (AI_SERVICE_KEY) headers["Authorization"] = `Bearer ${AI_SERVICE_KEY}`;
  if (SYNC_KEY) headers["x-sync-key"] = SYNC_KEY;
  return headers;
}

async function request(method, path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LEARN_TIMEOUT_MS);
  try {
    const response = await fetch(AI_SERVICE_URL + path, {
      method,
      headers: buildHeaders(),
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Intelligence service ${response.status} on ${path}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Forward a batch of stored signals to the learning service.
 * Returns { taste_vector?, profile_summary? } or null on failure.
 */
export async function forwardSignals(userId, signals) {
  try {
    return await request("POST", "/api/learn/signals", {
      user_id: userId,
      signals,
    });
  } catch (error) {
    console.warn("Signal forward to intelligence failed:", error.message);
    return null;
  }
}

/**
 * Fetch the learned profile (persona, confidence, question budget, game plan).
 * Returns null on failure.
 */
export async function fetchLearnedProfile(userId) {
  try {
    return await request("GET", `/api/profile/${encodeURIComponent(userId)}`);
  } catch (error) {
    console.warn("Learned profile fetch failed:", error.message);
    return null;
  }
}

export function hasSyncKey() {
  return !!SYNC_KEY;
}

export function verifySyncKey(req) {
  return !!SYNC_KEY && req.headers["x-sync-key"] === SYNC_KEY;
}
