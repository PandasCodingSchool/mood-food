import { randomUUID } from "crypto";
import { Expo } from "expo-server-sdk";
import { getDb, isPostgres } from "../db.js";

const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

async function fetchPushToken(userId) {
  try {
    const db = getDb();
    const pg = isPostgres();
    const sql = pg
      ? "SELECT push_token FROM users WHERE id = $1"
      : "SELECT push_token FROM users WHERE id = ?";
    const result = pg ? await db.query(sql, [userId]) : await db.get(sql, [userId]);
    const row = pg ? result.rows[0] : result;
    return row?.push_token || null;
  } catch (err) {
    console.error("fetchPushToken error:", err);
    return null;
  }
}

async function sendPushNotification(pushToken, { title, body, data = {} }) {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.warn(`Invalid Expo push token: ${pushToken}`);
    return;
  }

  const messages = [
    {
      to: pushToken,
      sound: "default",
      title,
      body: body || "",
      data,
    },
  ];

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      console.log("Expo push receipts:", receipts);
    }
  } catch (err) {
    console.error("sendPushNotification error:", err);
  }
}

// Internal helper to create in-app notifications and optionally send a
// push notification if the user has registered an Expo push token.
// Routes that trigger meaningful user events (order placed, quest completed,
// streaks, etc.) should call this instead of duplicating insert logic.
export async function createNotification({
  userId,
  type = "info",
  title,
  body,
  data = {},
}) {
  if (!userId) throw new Error("userId is required");
  if (!title) throw new Error("title is required");

  const db = getDb();
  const pg = isPostgres();
  const id = randomUUID();
  const dataJson = JSON.stringify(data);

  try {
    if (pg) {
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, body, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, userId, type, title, body || null, dataJson],
      );
    } else {
      await db.run(
        `INSERT INTO notifications (id, user_id, type, title, body, data)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, userId, type, title, body || null, dataJson],
      );
    }
  } catch (err) {
    console.error("createNotification error:", err);
    // Notification creation is best-effort; do not fail the caller.
    return { id: null, error: err.message };
  }

  // Fire-and-forget push delivery so the caller isn't blocked.
  const pushToken = await fetchPushToken(userId);
  if (pushToken) {
    void sendPushNotification(pushToken, { title, body, data: { ...data, type } });
  }

  return { id };
}
