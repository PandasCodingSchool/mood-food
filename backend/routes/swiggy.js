import express from "express";

const router = express.Router();

// Intelligence service owns the Swiggy MCP client + tokens.
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY;
const SWIGGY_TIMEOUT = parseInt(process.env.SWIGGY_TIMEOUT_MS || "25000");

/**
 * Thin proxy: forwards /api/swiggy/* to the intelligence service, preserving
 * method, sub-path, query string and JSON body. The intelligence service holds
 * the Swiggy token, so the browser never sees it.
 */
router.use(async (req, res) => {
  // req.url is the path *after* the mount point, e.g. "/restaurants".
  const target = `${AI_SERVICE_URL}/api/swiggy${req.url}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SWIGGY_TIMEOUT);

  const headers = { "Content-Type": "application/json" };
  if (AI_SERVICE_KEY) {
    headers["Authorization"] = `Bearer ${AI_SERVICE_KEY}`;
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
