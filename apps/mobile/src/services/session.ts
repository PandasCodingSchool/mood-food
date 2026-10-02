import * as SecureStore from "./secureStorage";

const SESSION_KEY = "moodfood_session_id";
const SESSION_EXPIRY_KEY = "moodfood_session_expiry";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function getSessionId(): Promise<string | null> {
  const sessionId = await SecureStore.getItem(SESSION_KEY);
  if (!sessionId) return null;

  const expiry = await SecureStore.getItem(SESSION_EXPIRY_KEY);
  if (!expiry) return null;

  const expiryDate = new Date(expiry);
  if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
    await clearSessionId();
    return null;
  }

  return sessionId;
}

export async function setSessionId(sessionId: string): Promise<void> {
  await SecureStore.setItem(SESSION_KEY, sessionId);
  const expiry = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await SecureStore.setItem(SESSION_EXPIRY_KEY, expiry);
}

export async function clearSessionId(): Promise<void> {
  await SecureStore.deleteItem(SESSION_KEY);
  await SecureStore.deleteItem(SESSION_EXPIRY_KEY);
}

export async function isSessionValid(): Promise<boolean> {
  const id = await getSessionId();
  return !!id;
}
