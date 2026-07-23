const API_URL = import.meta.env.VITE_API_URL || "/api";

export interface Quest {
  id: number;
  key: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  status: "active" | "completed";
  streakCount: number;
}

function headers(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

export async function fetchQuests(): Promise<Quest[]> {
  try {
    const response = await fetch(`${API_URL}/quests`, {
      headers: headers(),
      credentials: "include",
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data?.quests ?? [];
  } catch {
    return [];
  }
}

export async function bumpQuestProgress(key: string, count = 1): Promise<void> {
  try {
    await fetch(`${API_URL}/quests/${encodeURIComponent(key)}/progress`, {
      method: "POST",
      headers: headers(),
      credentials: "include",
      body: JSON.stringify({ count }),
    });
  } catch {
    // best-effort
  }
}
