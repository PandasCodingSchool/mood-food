import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// expo-secure-store has no web implementation, so on web we fall back to
// localStorage (the browser's per-origin store). Native keeps the keychain /
// keystore. Every call is async and never throws on web (private mode,
// blocked storage), matching how callers already treat SecureStore.

const web = Platform.OS === "web";

function local(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (!web) return SecureStore.getItemAsync(key);
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  if (!web) return SecureStore.setItemAsync(key, value);
  try {
    local()?.setItem(key, value);
  } catch {
    // storage full or blocked: the session just won't persist
  }
}

export async function deleteItem(key: string): Promise<void> {
  if (!web) return SecureStore.deleteItemAsync(key);
  try {
    local()?.removeItem(key);
  } catch {
    // ignore
  }
}
