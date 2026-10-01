import express from "express";

const router = express.Router();

// Intelligence service owns recipe generation (OpenAI structured output).
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_SERVICE_KEY = process.env.AI_SERVICE_KEY;
const RECIPE_TIMEOUT = parseInt(process.env.RECIPE_TIMEOUT_MS || "30000");

/**
 * Thin proxy: forwards /api/recipe/* to the intelligence service.
 */
router.use(async (req, res) => {
  const target = `${AI_SERVICE_URL}/api/recipe${req.url}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RECIPE_TIMEOUT);

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
    console.warn(`Recipe proxy error for ${target}:`, error.message);
    return res.status(aborted ? 504 : 502).json({
      success: false,
      error: aborted ? "Recipe service timed out." : "Recipe service unavailable.",
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
