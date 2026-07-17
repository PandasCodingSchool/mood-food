import Constants from "expo-constants";
import { getSessionId } from "./session";

const envUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? "http://localhost:3001/api" : "https://moodfood.fun/api");

if (!__DEV__ && envUrl.includes("localhost")) {
  throw new Error(
    "Release builds cannot use a localhost API URL. Set EXPO_PUBLIC_API_URL in eas.json or an EAS Environment variable to the production server.",
  );
}

function getApiBaseUrl(): string {
  if (!envUrl.includes("localhost")) {
    return envUrl;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return envUrl.replace("localhost", host);
  }

  return envUrl;
}

export const API_BASE_URL = getApiBaseUrl();

export async function getHeaders(): Promise<Record<string, string>> {
  const sessionId = await getSessionId();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (sessionId) {
    headers["X-Session-Id"] = sessionId;
  }
  return headers;
}
