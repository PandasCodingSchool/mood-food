import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import { initDb, getDb, isPostgres } from "./db.js";
import aiRecommendationsRouter from "./routes/aiRecommendations.js";
import characterMatchRouter from "./routes/characterMatch.js";
import gameAssistRouter from "./routes/gameAssist.js";
import swiggyRouter from "./routes/swiggy.js";
import swiggyAuthRouter from "./routes/swiggyAuth.js";
import authRouter from "./routes/auth.js";
import preferencesRouter from "./routes/preferences.js";
import historyRouter from "./routes/history.js";
import notificationsRouter from "./routes/notifications.js";
import {
  sessionMiddleware,
  getUserMe,
  updateUserProfile,
} from "./middleware/session.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(sessionMiddleware());

// General rate limit — all API routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_GENERAL || "100"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Strict limit for AI recommendations (calls OpenAI — cost-sensitive)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AI || "10"),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Too many recommendation requests. Please wait a few minutes before trying again.",
  },
  handler: (req, res, _next, options) => {
    console.warn(`Rate limit hit for AI recommendations from IP: ${req.ip}`);
    res.status(429).json(options.message);
  },
});

app.use("/api", generalLimiter);

// AI Recommendations route
app.use("/api/ai-recommendations", aiLimiter, aiRecommendationsRouter);
// Character match route (AI-driven personality matching)
app.use("/api/character-match", aiLimiter, characterMatchRouter);
// Swiggy OAuth endpoints (handled locally, not proxied)
app.use("/api/swiggy/oauth", swiggyAuthRouter);
// Lightweight mid-game LLM assists (gpt-4o-mini — cheap, cached server-side,
// so only the general limiter applies)
app.use("/api/game-assist", gameAssistRouter);
// Swiggy discovery/ordering route (proxied to intelligence service)
app.use("/api/swiggy", swiggyRouter);

// Auth routes (login / signup)
app.use("/api/auth", authRouter);

// User preferences
app.use("/api/user/preferences", preferencesRouter);

// User order history
app.use("/api/user/history", historyRouter);

// User notifications
app.use("/api/user/notifications", notificationsRouter);

// Database helper functions
const query = async (sql, params = []) => {
  const db = getDb();
  if (isPostgres()) {
    const result = await db.query(sql, params);
    return { rows: result.rows };
  } else {
    // SQLite uses ? placeholders, convert $n to ?
    const sqliteSql = sql.replace(/\$\d+/g, "?");
    if (sql.toLowerCase().trim().startsWith("select")) {
      const rows = await db.all(sqliteSql, params);
      return { rows };
    } else {
      const result = await db.run(sqliteSql, params);
      return { rows: [{ id: result.lastID }] };
    }
  }
};

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    const result = await query(
      isPostgres() ? "SELECT NOW() as now" : "SELECT datetime('now') as now",
    );
    res.json({
      status: "ok",
      timestamp: result.rows[0].now,
      database: isPostgres() ? "postgresql" : "sqlite",
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// Current user session info (Swiggy connection status)
app.get("/api/user/me", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.user?.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: "No session id provided" });
    }
    const me = await getUserMe(sessionId);
    res.json({ success: true, user: me });
  } catch (error) {
    console.error("/api/user/me error:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Update user profile (name, email, phone)
app.put("/api/user/me", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] || req.user?.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: "No session id provided" });
    }

    const { name, email, phone } = req.body || {};
    const trimmedEmail = typeof email === "string" ? email.trim() : email;
    const trimmedPhone = typeof phone === "string" ? phone.trim() : phone;

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ error: "Invalid email address" });
    }
    if (trimmedPhone && !/^[\d\s+\-()]{6,20}$/.test(trimmedPhone)) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    const me = await updateUserProfile(sessionId, {
      name: name === undefined ? undefined : name?.trim() || null,
      email: trimmedEmail === undefined ? undefined : trimmedEmail || null,
      phone: trimmedPhone === undefined ? undefined : trimmedPhone || null,
    });
    res.json({ success: true, user: me });
  } catch (error) {
    console.error("PUT /api/user/me error:", error);
    const isUnique = /unique/i.test(error.message);
    res
      .status(isUnique ? 409 : 500)
      .json({
        error: isUnique
          ? "Email or phone already in use"
          : "Failed to update profile",
      });
  }
});

// Get waitlist count (public endpoint for frontend)
app.get("/api/waitlist/count", async (req, res) => {
  try {
    const result = await query("SELECT COUNT(*) as count FROM waitlist");
    const count = parseInt(result.rows[0]?.count || 0);
    res.json({ count, base: 100, total: 100 + count });
  } catch (error) {
    console.error("Waitlist count error:", error);
    res.status(500).json({ error: "Failed to fetch waitlist count" });
  }
});

// Waitlist endpoint
app.post("/api/waitlist", async (req, res) => {
  const { name, email, city, cuisine } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }

  try {
    const result = await query(
      "INSERT INTO waitlist (name, email, city, cuisine) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, email, city || null, cuisine || null],
    );
    res.status(201).json({
      success: true,
      data: result.rows[0] || { name, email, city, cuisine },
    });
  } catch (error) {
    if (
      error.message?.includes("UNIQUE constraint failed") ||
      error.code === "23505"
    ) {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error("Waitlist error:", error);
    res.status(500).json({ error: "Failed to join waitlist" });
  }
});

// Analytics tracking endpoint
app.post("/api/analytics", async (req, res) => {
  const { event, properties } = req.body;
  const userAgent = req.headers["user-agent"];
  const ipAddress = req.ip;

  if (!event) {
    return res.status(400).json({ error: "Event name is required" });
  }

  try {
    await query(
      "INSERT INTO analytics_events (event_name, properties, user_agent, ip_address) VALUES ($1, $2, $3, $4)",
      [event, JSON.stringify(properties || {}), userAgent, ipAddress],
    );
    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Analytics error:", error);
    // Don't fail the request for analytics
    res.status(200).json({ success: false, logged: false });
  }
});

// Quiz completion tracking
app.post("/api/quiz-complete", async (req, res) => {
  const { mood, craving, budget, preference } = req.body;

  try {
    await query(
      "INSERT INTO quiz_completions (mood, craving, budget, preference) VALUES ($1, $2, $3, $4)",
      [mood, craving, budget, preference],
    );
    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Quiz tracking error:", error);
    res.status(200).json({ success: false });
  }
});

// Get analytics summary (for admin)
app.get("/api/admin/analytics", async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedAuth =
    "Basic " +
    Buffer.from(
      `${process.env.ADMIN_USERNAME || "admin"}:${process.env.ADMIN_PASSWORD || "changeme"}`,
    ).toString("base64");

  if (authHeader !== expectedAuth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get event counts
    const eventCounts = await query(`
      SELECT event_name, COUNT(*) as count 
      FROM analytics_events 
      GROUP BY event_name 
      ORDER BY count DESC
    `);

    // Get waitlist count
    const waitlistCount = await query("SELECT COUNT(*) as count FROM waitlist");

    // Get quiz completion count
    const quizCount = await query(
      "SELECT COUNT(*) as count FROM quiz_completions",
    );

    // Get daily stats for last 7 days
    const dateFilter = isPostgres()
      ? "WHERE created_at > NOW() - INTERVAL '7 days'"
      : "WHERE created_at > datetime('now', '-7 days')";
    const dailyStats = await query(`
      SELECT date(created_at) as date, event_name, COUNT(*) as count
      FROM analytics_events
      ${dateFilter}
      GROUP BY date(created_at), event_name
      ORDER BY date DESC
    `);

    res.json({
      events: eventCounts.rows,
      waitlistCount: parseInt(waitlistCount.rows[0]?.count || 0),
      quizCompletions: parseInt(quizCount.rows[0]?.count || 0),
      dailyStats: dailyStats.rows,
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Get waitlist (for admin)
app.get("/api/admin/waitlist", async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedAuth =
    "Basic " +
    Buffer.from(
      `${process.env.ADMIN_USERNAME || "admin"}:${process.env.ADMIN_PASSWORD || "changeme"}`,
    ).toString("base64");

  if (authHeader !== expectedAuth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await query(
      "SELECT * FROM waitlist ORDER BY created_at DESC",
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error("Admin waitlist error:", error);
    res.status(500).json({ error: "Failed to fetch waitlist" });
  }
});

// Track order clicks (for internal analytics)
app.post("/api/analytics/order-click", async (req, res) => {
  const { dish_name, dish_type = "main", platform = "swiggy" } = req.body;

  if (!dish_name) {
    return res.status(400).json({ error: "dish_name is required" });
  }

  try {
    const user_agent = req.headers["user-agent"] || "";
    const ip_address = req.ip || req.connection.remoteAddress || "";

    if (isPostgres()) {
      await query(
        `INSERT INTO order_clicks (dish_name, dish_type, platform, user_agent, ip_address) 
         VALUES ($1, $2, $3, $4, $5)`,
        [dish_name, dish_type, platform, user_agent, ip_address],
      );
    } else {
      await query(
        `INSERT INTO order_clicks (dish_name, dish_type, platform, user_agent, ip_address) 
         VALUES (?, ?, ?, ?, ?)`,
        [dish_name, dish_type, platform, user_agent, ip_address],
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Order click tracking error:", error);
    res.status(500).json({ error: "Failed to track order click" });
  }
});

// Get order click stats (for admin)
app.get("/api/admin/order-clicks", async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedAuth =
    "Basic " +
    Buffer.from(
      `${process.env.ADMIN_USERNAME || "admin"}:${process.env.ADMIN_PASSWORD || "changeme"}`,
    ).toString("base64");

  if (authHeader !== expectedAuth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get total clicks
    const totalClicks = await query(
      "SELECT COUNT(*) as count FROM order_clicks",
    );

    // Get clicks by dish type (main, healthier, budget)
    const clicksByType = await query(`
      SELECT dish_type, COUNT(*) as count 
      FROM order_clicks 
      GROUP BY dish_type
    `);

    // Get top dishes ordered
    const topDishes = await query(`
      SELECT dish_name, COUNT(*) as clicks 
      FROM order_clicks 
      GROUP BY dish_name 
      ORDER BY clicks DESC 
      LIMIT 10
    `);

    // Get daily clicks for last 7 days
    const dateFilter = isPostgres()
      ? "WHERE created_at > NOW() - INTERVAL '7 days'"
      : "WHERE created_at > datetime('now', '-7 days')";
    const dailyClicks = await query(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM order_clicks
      ${dateFilter}
      GROUP BY date(created_at)
      ORDER BY date DESC
    `);

    res.json({
      totalClicks: parseInt(
        totalClicks.rows?.[0]?.count || totalClicks?.[0]?.count || 0,
      ),
      clicksByType: clicksByType.rows || clicksByType,
      topDishes: topDishes.rows || topDishes,
      dailyClicks: dailyClicks.rows || dailyClicks,
    });
  } catch (error) {
    console.error("Admin order clicks error:", error);
    res.status(500).json({ error: "Failed to fetch order click stats" });
  }
});

// Serve admin panel
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "index.html"));
});

app.use("/admin", express.static(path.join(__dirname, "admin")));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Initialize database and start server
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Admin panel: http://localhost:${PORT}/admin`);
      console.log(`Database: ${isPostgres() ? "PostgreSQL" : "SQLite"}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    // Start server anyway - it will work with in-memory fallback
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (DB initialization failed)`);
    });
  });

export default app;
