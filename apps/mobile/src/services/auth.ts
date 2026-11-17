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

const OFFLINE = "Can't reach MoodFood right now. Check your connection and try again.";

/**
 * fetch + JSON with readable errors: no connection, and replies that aren't
 * the API's JSON (a captive portal or a wrong API URL), would otherwise surface
 * as "Network request failed" / "JSON Parse error: Unexpected character: <".
 */
async function request(path: string, init: RequestInit, fallback: string) {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, init);
  } catch {
    throw new Error(OFFLINE);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    const err = new Error(data?.error || fallback) as Error & { data?: Record<string, unknown> };
    err.data = data ?? undefined;
    throw err;
  }
  return data;
}

async function postJson(path: string, body?: unknown, withSession = true, fallback = "Something went wrong") {
  return request(
    path,
    {
      method: "POST",
      headers: withSession ? await getHeaders() : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    fallback,
  );
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
  const data = await postJson("/auth/login", { ...account, password }, false, "Login failed");
  await setSessionId(data.user.sessionId);
  return data.user;
}

export async function signup(
  name: string,
  account: AccountId,
  password: string,
): Promise<AuthUser> {
  // Sends the current session so a guest account is upgraded in place (keeps its data).
  const data = await postJson("/auth/signup", { name, ...account, password }, true, "Sign up failed");
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
  return postJson("/auth/otp/send", { phone }, false, "Failed to send OTP");
}

export async function verifyOtp(
  phone: string,
  otp: string,
  name?: string,
): Promise<VerifyOtpResult> {
  let data;
  try {
    data = await postJson("/auth/otp/verify", { phone, otp, name }, true, "Verification failed");
  } catch (e) {
    const err = e as Error & { needsName?: boolean; data?: { needsName?: boolean } };
    err.needsName = !!err.data?.needsName;
    throw err;
  }
  if (data.user?.sessionId) {
    await setSessionId(data.user.sessionId);
  }
  return data;
}

/** Anonymous account so personalised features work before sign-up. */
export async function continueAsGuest(): Promise<AuthUser> {
  const data = await postJson("/auth/guest", undefined, false, "Could not start a guest session");
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
