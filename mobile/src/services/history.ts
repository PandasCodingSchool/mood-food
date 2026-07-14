import { API_BASE_URL, getHeaders } from "./apiBase";

export interface HistoryItem {
  id: string;
  dishName: string;
  cuisine: string | null;
  emoji: string;
  priceInr: number;
  platform: string;
  via: string | null;
  gradientStart: string;
  gradientEnd: string;
  ordered: boolean;
  saved: boolean;
  createdAt: string;
}

export interface SaveOrderPayload {
  dishName: string;
  cuisine?: string;
  emoji?: string;
  priceInr?: number;
  platform?: string;
  via?: string;
  gradientStart?: string;
  gradientEnd?: string;
  ordered?: boolean;
  saved?: boolean;
}

export async function fetchHistory(tab: "all" | "ordered" | "saved" = "all"): Promise<HistoryItem[]> {
  const headers = await getHeaders();
  const res = await fetch(`${API_BASE_URL}/user/history?tab=${tab}`, { headers });
  if (!res.ok) throw new Error("Failed to fetch history");
  const data = await res.json();
  return data.items as HistoryItem[];
}

export async function saveOrder(payload: SaveOrderPayload): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/user/history`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to save order");
  const data = await res.json();
  return data.id as string;
}

export async function toggleSaved(id: string, saved: boolean): Promise<void> {
  await fetch(`${API_BASE_URL}/user/history/${id}`, {
    method: "PATCH",
    headers: await getHeaders(),
    body: JSON.stringify({ saved }),
  });
}
