import Constants from "expo-constants";

const envUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001/api";

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
