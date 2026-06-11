import express from "express";

const router = express.Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_TIMEOUT = parseInt(process.env.AI_TIMEOUT_MS || "15000");

/**
 * POST /api/character-match
 * Forwards user Q&A answers to intelligence service.
 * Intelligence service returns character_id + spirit_animal description.
 */
router.post("/", async (req, res) => {
  const { answers } = req.body;

  if (!Array.isArray(answers) || answers.length === 0) {
    return res.status(400).json({ error: "answers[] required" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);

    let response;
    try {
      response = await fetch(`${AI_SERVICE_URL}/api/character-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
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
    console.warn("Character match AI failed, frontend will use local fallback:", err.message);
    // Return a signal so the frontend knows to fall back to cosine similarity
    return res.status(503).json({ error: "ai_unavailable" });
  }
});

export default router;
