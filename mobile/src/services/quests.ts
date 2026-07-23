import { API_BASE_URL, getHeaders } from './apiBase';

export interface Quest {
  id: number;
  key: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  status: 'active' | 'completed';
  streakCount: number;
}

export async function fetchQuests(): Promise<Quest[]> {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/quests`, { headers });
    if (!response.ok) return [];
    const data = await response.json();
    return data?.quests ?? [];
  } catch {
    return [];
  }
}

export async function bumpQuestProgress(key: string, count = 1): Promise<void> {
  try {
    const headers = await getHeaders();
    await fetch(`${API_BASE_URL}/quests/${encodeURIComponent(key)}/progress`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ count }),
    });
  } catch {
    // best-effort
  }
}
