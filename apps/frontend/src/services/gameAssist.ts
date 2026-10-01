// Client for the lightweight mid-game LLM assist endpoint.
// Always fails soft: any error/timeout returns null and callers render their
// static fallback options — the UI must never block on this.

const API_BASE_URL = import.meta.env.VITE_API_URL || "/api";

export type AssistKind =
  | "craving_options"
  | "story_beat_flavor"
  | "followup_phrasing";

export interface AssistOption {
  value: string; // canonical craving value
  label: string;
  emoji?: string;
  subtitle?: string;
}

export interface GameAssistResult {
  options: AssistOption[];
  flavorText?: string;
}

export async function fetchGameAssist(
  kind: AssistKind,
  context: Record<string, unknown>,
  {
    gameType,
    count = 4,
    timeoutMs = 2500,
  }: { gameType?: string; count?: number; timeoutMs?: number } = {},
): Promise<GameAssistResult | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/game-assist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, game_type: gameType, context, count }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.success) return null;
    return {
      options: Array.isArray(data.options) ? data.options : [],
      flavorText: data.flavor_text || undefined,
    };
  } catch {
    return null;
  }
}
