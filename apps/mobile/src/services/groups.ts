import { API_BASE_URL, getHeaders } from './apiBase';

export interface GroupMember {
  memberKey: string;
  displayName: string;
  swipeCount: number;
}

export interface ConsensusOption {
  dish_id: string;
  dish_name: string;
  min_score: number;
  member_match: Record<string, number>;
}

export async function createGroup(): Promise<string | null> {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/groups`, { method: 'POST', headers });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.code ?? null;
  } catch {
    return null;
  }
}

export async function joinGroup(code: string, displayName: string): Promise<string | null> {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/groups/${code}/join`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ displayName }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.memberKey ?? null;
  } catch {
    return null;
  }
}

export async function fetchGroup(code: string): Promise<{ members: GroupMember[] } | null> {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/groups/${code}`, { headers });
    if (!response.ok) return null;
    const data = await response.json();
    return { members: data?.members ?? [] };
  } catch {
    return null;
  }
}

export async function submitGroupSwipes(
  code: string,
  memberKey: string,
  swipes: Array<{ item: string; liked: boolean }>,
): Promise<void> {
  try {
    const headers = await getHeaders();
    await fetch(`${API_BASE_URL}/groups/${code}/swipe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ memberKey, swipes }),
    });
  } catch {
    // best-effort
  }
}

export async function fetchConsensus(code: string): Promise<ConsensusOption[]> {
  try {
    const headers = await getHeaders();
    const response = await fetch(`${API_BASE_URL}/groups/${code}/consensus`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data?.options ?? [];
  } catch {
    return [];
  }
}
