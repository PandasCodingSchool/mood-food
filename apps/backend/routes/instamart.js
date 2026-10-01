import express from "express";
import { getActiveSwiggyToken } from "../lib/swiggyUserToken.js";

const router = express.Router();

// Intelligence service owns the Instamart MCP client + tokens.
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY;
const SWIGGY_TIMEOUT = parseInt(process.env.SWIGGY_TIMEOUT_MS || "25000");

/**
 * Thin proxy: forwards /api/instamart/* to the intelligence service, same
 * shape as routes/swiggy.js — the browser never sees the Swiggy token.
 */
router.use(async (req, res) => {
  const target = `${AI_SERVICE_URL}/api/instamart${req.url}`;
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
    console.warn(`Instamart proxy error for ${target}:`, error.message);
    return res.status(aborted ? 504 : 502).json({
      success: false,
      error: aborted
        ? "Instamart service timed out."
        : "Instamart service unavailable.",
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
