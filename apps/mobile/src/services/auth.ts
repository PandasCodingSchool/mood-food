import { API_BASE_URL, getHeaders } from "./apiBase";
import { setSessionId, clearSessionId } from "./session";

export interface AuthUser {
  id: string;
  sessionId: string;
  name: string | null;
  phone: string | null;
  isGuest?: boolean;
  swiggyLinked?: boolean;
  swiggyUserId?: string | null;
}

export async function login(phone: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Login failed");
  }

  await setSessionId(data.user.sessionId);
  return data.user;
}

export async function signup(
  name: string,
  phone: string,
  password: string,
): Promise<AuthUser> {
  // Sends the current session so a guest account is upgraded in place (keeps its data).
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify({ name, phone, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Sign up failed");
  }

  await setSessionId(data.user.sessionId);
  return data.user;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/user/me`, {
      headers: await getHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user as AuthUser;
  } catch {
    return null;
  }
}

export interface VerifyOtpResult {
  success: boolean;
  isNew?: boolean;
  user?: AuthUser;
  needsName?: boolean;
}

export async function requestOtp(phone: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE_URL}/auth/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to send OTP");
  }
  return data;
}

export async function verifyOtp(
  phone: string,
  otp: string,
  name?: string,
): Promise<VerifyOtpResult> {
  const res = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify({ phone, otp, name }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Verification failed") as Error & {
      needsName?: boolean;
    };
    err.needsName = !!data.needsName;
    throw err;
  }
  if (data.user?.sessionId) {
    await setSessionId(data.user.sessionId);
  }
  return data;
}

/** Anonymous account so personalised features work before sign-up. */
export async function continueAsGuest(): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/auth/guest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Could not start a guest session");
  }
  await setSessionId(data.user.sessionId);
  return data.user;
}

export async function logout(): Promise<void> {
  // Revoke the session server-side too; the local clear must happen regardless.
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", headers: await getHeaders() });
  } catch {
    // offline: the token expires on its own
  }
  await clearSessionId();
}
