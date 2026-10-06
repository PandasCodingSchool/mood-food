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
  swiggyExpiresAt?: string | null;
  email?: string | null;
  emailVerified?: boolean;
}

async function postJson(path: string, body?: unknown, withSession = true) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: withSession ? await getHeaders() : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

/** Emails the signed-in user a 6-digit code for their email address. */
export async function sendEmailVerification(): Promise<{ emailVerified: boolean }> {
  return postJson("/auth/email/send-verification");
}

export async function verifyEmail(otp: string): Promise<void> {
  await postJson("/auth/email/verify", { otp });
}

/** Sends a reset code if an account exists (the server answers the same either way). */
export async function forgotPassword(email: string): Promise<void> {
  await postJson("/auth/password/forgot", { email }, false);
}

/** Sets a new password with the emailed code and signs in (other devices are signed out). */
export async function resetPasswordWithEmail(email: string, otp: string, password: string): Promise<AuthUser> {
  const data = await postJson("/auth/password/reset", { email, otp, password }, false);
  await setSessionId(data.user.sessionId);
  return data.user;
}

/** Accounts are identified by email or phone (email is the default while SMS OTP is unavailable). */
export type AccountId = { email: string } | { phone: string };

/** Sign-in methods the server supports right now; OTP only when it can actually send SMS. */
export async function fetchAuthMethods(): Promise<{ email: boolean; otp: boolean }> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/methods`);
    if (!res.ok) return { email: true, otp: false };
    const data = await res.json();
    return { email: data.email !== false, otp: !!data.otp };
  } catch {
    return { email: true, otp: false };
  }
}

export async function login(account: AccountId, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...account, password }),
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
  account: AccountId,
  password: string,
): Promise<AuthUser> {
  // Sends the current session so a guest account is upgraded in place (keeps its data).
  const res = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify({ name, ...account, password }),
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

/** Permanently deletes the account and all its data (store requirement), then signs out locally. */
export async function deleteAccount(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/user/me`, { method: "DELETE", headers: await getHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Could not delete your account. Please try again.");
  }
  await clearSessionId();
}
