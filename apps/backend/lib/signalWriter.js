import { getDb, isPostgres } from "../db.js";
import { forwardSignals } from "./intelligenceClient.js";

// Shared signal-write path for routes other than POST /api/signals (quests,
// groups, ...) that need to feed the same append-only log + learning
// service without duplicating the insert/forward logic.
export async function logSignalInternal(userId, type, payload, context = {}) {
  const db = getDb();
  const pg = isPostgres();
  const payloadJson = JSON.stringify(payload);
  const contextJson = JSON.stringify(context);

  let id;
  if (pg) {
    const result = await db.query(
      `INSERT INTO signals (user_id, type, payload_json, context_json) VALUES ($1,$2,$3,$4) RETURNING id`,
      [userId, type, payloadJson, contextJson],
    );
    id = result.rows[0].id;
  } else {
    const result = await db.run(
      `INSERT INTO signals (user_id, type, payload_json, context_json) VALUES (?,?,?,?)`,
      [userId, type, payloadJson, contextJson],
    );
    id = result.lastID;
  }

  await forwardSignals(userId, [{ id, type, payload, context }]);
  return id;
}
