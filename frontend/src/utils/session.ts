const SESSION_KEY = "moodfood.session_id";

export function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function getSessionHeaders(): Record<string, string> {
  return {
    "X-Session-Id": getSessionId(),
  };
}

export function initSession(): string {
  return getSessionId();
}
