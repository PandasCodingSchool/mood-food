import { API_BASE_URL, getHeaders } from "./apiBase";

export interface UserPreferences {
  diets: string[];
  allergies: string[];
  cuisines: string[];
  budget: number;
}

export async function fetchPreferences(): Promise<UserPreferences> {
  const res = await fetch(`${API_BASE_URL}/user/preferences`, {
    headers: await getHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch preferences");
  const data = await res.json();
  return data.preferences as UserPreferences;
}

export async function savePreferences(prefs: UserPreferences): Promise<UserPreferences> {
  const res = await fetch(`${API_BASE_URL}/user/preferences`, {
    method: "PUT",
    headers: await getHeaders(),
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error("Failed to save preferences");
  const data = await res.json();
  return data.preferences as UserPreferences;
}
