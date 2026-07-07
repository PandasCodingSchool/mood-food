import express from "express";

const router = express.Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
// Mid-game calls are latency-sensitive — abort fast; the frontend falls back
// to static options.
const ASSIST_TIMEOUT = parseInt(process.env.GAME_ASSIST_TIMEOUT_MS || "3000");

/**
 * POST /api/game-assist
 * Thin pass-through to the intelligence service's gpt-4o-mini assist endpoint.
 */
router.post("/", async (req, res) => {
  const { kind } = req.body || {};

  if (!kind) {
    return res.status(400).json({ error: "kind required" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ASSIST_TIMEOUT);

    let response;
    try {
      response = await fetch(`${AI_SERVICE_URL}/api/game-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`AI service responded ${response.status}`);
    }

    return res.json(await response.json());
  } catch (err) {
    console.warn("Game assist failed, frontend will use static options:", err.message);
    return res.status(503).json({ error: "ai_unavailable" });
  }
});

export default router;
