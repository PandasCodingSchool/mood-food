import { API_BASE_URL, getHeaders } from "./apiBase";
import { setSessionId, clearSessionId } from "./session";

export interface AuthUser {
  id: string;
  sessionId: string;
  name: string | null;
  phone: string | null;
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
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
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

export async function logout(): Promise<void> {
  await clearSessionId();
}
